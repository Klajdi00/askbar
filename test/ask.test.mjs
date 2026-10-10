import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askAI } from '../src/api/ask.js';
import { fakeFetch, sseBody } from './helpers.mjs';

const image = { mime: 'image/jpeg', base64: 'AAAA' };
const messages = [{ role: 'user', text: 'What is on screen?', image }];

async function run(provider, events, extra = {}) {
  const fetch = fakeFetch(new Response(sseBody(events), { status: 200 }));
  const deltas = [];
  const result = await askAI({
    provider,
    apiKey: 'test-key',
    model: 'test-model',
    system: 'Be brief.',
    messages,
    fetch,
    onText: (d) => deltas.push(d),
    ...extra,
  });
  return { result, deltas, call: fetch.calls[0] };
}

test('Claude: request shape with image block, streamed text', async () => {
  const { result, deltas, call } = await run('claude', [
    { type: 'message_start', message: {} },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' world' } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    { type: 'message_stop' },
  ]);
  assert.equal(call.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(call.init.headers['x-api-key'], 'test-key');
  assert.equal(call.init.headers['anthropic-version'], '2023-06-01');
  assert.equal(call.body.stream, true);
  assert.equal(call.body.system, 'Be brief.');
  assert.equal(call.body.max_tokens, 4096);
  assert.deepEqual(call.body.messages[0].content, [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
    { type: 'text', text: 'What is on screen?' },
  ]);
  assert.deepEqual(deltas, ['Hello', ' world']);
  assert.deepEqual(result, { text: 'Hello world', truncated: false });
});

test('Claude: text-only messages are plain strings; max_tokens stop is reported', async () => {
  const fetch = fakeFetch(
    new Response(
      sseBody([
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'x' } },
        { type: 'message_delta', delta: { stop_reason: 'max_tokens' } },
        { type: 'message_stop' },
      ])
    )
  );
  const result = await askAI({ provider: 'claude', apiKey: 'k', model: 'm', messages: [{ role: 'user', text: 'hi' }], fetch });
  assert.equal(fetch.calls[0].body.messages[0].content, 'hi');
  assert.equal(result.truncated, true);
});

test('OpenAI: request shape with image_url, [DONE] ends the stream', async () => {
  const { result, call } = await run('openai', [
    { choices: [{ delta: { role: 'assistant' } }] },
    { choices: [{ delta: { content: 'Hi' } }] },
    { choices: [{ delta: { content: '!' }, finish_reason: 'stop' }] },
    '[DONE]',
  ]);
  assert.equal(call.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(call.init.headers.authorization, 'Bearer test-key');
  assert.deepEqual(call.body.messages[0], { role: 'system', content: 'Be brief.' });
  assert.deepEqual(call.body.messages[1].content, [
    { type: 'text', text: 'What is on screen?' },
    { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
  ]);
  assert.equal(result.text, 'Hi!');
});

test('Gemini: request shape with inlineData, thought parts skipped', async () => {
  const { result, call } = await run('gemini', [
    { candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }] } }] },
    { candidates: [{ content: { parts: [{ text: 'Bon' }] } }] },
    { candidates: [{ content: { parts: [{ text: 'jour' }] }, finishReason: 'STOP' }] },
  ]);
  assert.equal(
    call.url,
    'https://generativelanguage.googleapis.com/v1beta/models/test-model:streamGenerateContent?alt=sse'
  );
  assert.equal(call.init.headers['x-goog-api-key'], 'test-key');
  assert.deepEqual(call.body.systemInstruction, { parts: [{ text: 'Be brief.' }] });
  assert.deepEqual(call.body.contents[0], {
    role: 'user',
    parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } }, { text: 'What is on screen?' }],
  });
  assert.equal(result.text, 'Bonjour');
});

test('Gemini: assistant turns use the "model" role', async () => {
  const fetch = fakeFetch(new Response(sseBody([{ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }])));
  await askAI({
    provider: 'gemini',
    apiKey: 'k',
    model: 'm',
    messages: [
      { role: 'user', text: 'a' },
      { role: 'assistant', text: 'b' },
      { role: 'user', text: 'c' },
    ],
    fetch,
  });
  assert.deepEqual(fetch.calls[0].body.contents.map((c) => c.role), ['user', 'model', 'user']);
});

test('HTTP errors use the provider message and a readable summary', async () => {
  const fetch = fakeFetch(
    new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), {
      status: 401,
    })
  );
  await assert.rejects(
    askAI({ provider: 'claude', apiKey: 'bad', model: 'm', messages, fetch }),
    (err) => err.code === 'HTTP' && err.status === 401 && /rejected/.test(err.message) && /invalid x-api-key/.test(err.message)
  );
});

test('errors inside the stream are raised', async () => {
  const fetch = fakeFetch(new Response(sseBody([{ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }])));
  await assert.rejects(askAI({ provider: 'claude', apiKey: 'k', model: 'm', messages, fetch }), /Overloaded/);
});

test('missing key fails before any request', async () => {
  const fetch = fakeFetch(new Response(''));
  await assert.rejects(askAI({ provider: 'openai', apiKey: '', model: 'm', messages, fetch }), (e) => e.code === 'NO_KEY');
  assert.equal(fetch.calls.length, 0);
});

test('aborting turns into a CANCELLED error', async () => {
  const controller = new AbortController();
  const fetch = async (_url, init) => {
    controller.abort();
    init.signal.throwIfAborted();
  };
  await assert.rejects(
    askAI({ provider: 'claude', apiKey: 'k', model: 'm', messages, fetch, signal: controller.signal }),
    (e) => e.code === 'CANCELLED'
  );
});
