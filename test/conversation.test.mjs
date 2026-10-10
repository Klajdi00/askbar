import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanTransformOutput, prepareConversation } from '../src/api/conversation.js';

const img = (id) => ({ mime: 'image/jpeg', base64: id });

test('only the latest screenshot is sent; older ones become a note', () => {
  const { messages } = prepareConversation([
    { role: 'user', text: 'first', image: img('A') },
    { role: 'assistant', text: 'answer 1' },
    { role: 'user', text: 'second', image: img('B') },
  ]);
  assert.equal(messages[0].image, undefined);
  assert.match(messages[0].text, /earlier screenshot/);
  assert.deepEqual(messages[2].image, img('B'));
});

test('a screenshot without a question gets the default question', () => {
  const { messages } = prepareConversation([{ role: 'user', text: '', image: img('A') }], {
    defaultImageText: 'Describe my screen.',
  });
  assert.equal(messages[0].text, 'Describe my screen.');
});

test('history is trimmed, starts with user and merges same-role turns', () => {
  const { messages } = prepareConversation(
    [
      { role: 'user', text: 'old' },
      { role: 'assistant', text: 'old answer' },
      { role: 'user', text: 'failed question' },
      { role: 'user', text: 'retry' },
    ],
    { maxMessages: 3 }
  );
  assert.deepEqual(messages, [{ role: 'user', text: 'failed question\n\nretry' }]);
});

test('redaction is consistent across turns', () => {
  const { messages, redactionMap } = prepareConversation(
    [
      { role: 'user', text: 'email bob@site.org' },
      { role: 'assistant', text: 'Wrote to bob@site.org' },
      { role: 'user', text: 'and cc ann@site.org' },
    ],
    { redact: true }
  );
  assert.deepEqual(
    messages.map((m) => m.text),
    ['email [EMAIL_1]', 'Wrote to [EMAIL_1]', 'and cc [EMAIL_2]']
  );
  assert.equal(redactionMap.byPlaceholder.get('[EMAIL_2]'), 'ann@site.org');
});

test('clipboard output: strips wrapper tags and code fences', () => {
  assert.equal(cleanTransformOutput('<text>\nHello there\n</text>'), 'Hello there');
  assert.equal(cleanTransformOutput('```\nHello\n```'), 'Hello');
  assert.equal(cleanTransformOutput('  Plain  '), 'Plain');
});
