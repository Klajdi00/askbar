import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSSE } from '../src/api/sse.js';
import { streamOf } from './helpers.mjs';

async function collect(stream) {
  const out = [];
  for await (const ev of readSSE(stream)) out.push(ev);
  return out;
}

test('parses events split across chunks', async () => {
  const events = await collect(streamOf(['data: {"a"', ':1}\n', '\ndata: two\n\n']));
  assert.deepEqual(events, [
    { event: null, data: '{"a":1}' },
    { event: null, data: 'two' },
  ]);
});

test('handles CRLF, event names, comments and multi-line data', async () => {
  const events = await collect(
    streamOf([': keep-alive\r\n\r\nevent: delta\r\ndata: line1\r\ndata: line2\r\n\r\n'])
  );
  assert.deepEqual(events, [{ event: 'delta', data: 'line1\nline2' }]);
});

test('yields a final event without trailing blank line', async () => {
  const events = await collect(streamOf(['data: first\n\ndata: last']));
  assert.deepEqual(events.map((e) => e.data), ['first', 'last']);
});

test('decodes multi-byte UTF-8 split across chunks', async () => {
  const bytes = new TextEncoder().encode('data: Përshëndetje 👋\n\n');
  const stream = new ReadableStream({
    start(c) {
      for (const b of bytes) c.enqueue(new Uint8Array([b]));
      c.close();
    },
  });
  const events = await collect(stream);
  assert.equal(events[0].data, 'Përshëndetje 👋');
});
