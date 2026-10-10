import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRedactionMap, createStreamRestorer, redactText, restoreText } from '../src/api/redact.js';

test('masks emails, IBANs and long numbers', () => {
  const map = createRedactionMap();
  const out = redactText(
    'Write to jane.doe@corp.example.com, IBAN AL47 2121 1009 0000 0002 3569 8741, card 4111 1111 1111 1111, phone +355 69 123 4567.',
    map
  );
  assert.equal(out, 'Write to [EMAIL_1], IBAN [IBAN_1], card [NUMBER_1], phone [NUMBER_2].');
});

test('compact IBAN and repeated values reuse the same placeholder', () => {
  const map = createRedactionMap();
  const out = redactText('DE89370400440532013000 then a@b.io and again a@b.io', map);
  assert.equal(out, '[IBAN_1] then [EMAIL_1] and again [EMAIL_1]');
});

test('leaves dates, times, prices and short numbers alone', () => {
  const map = createRedactionMap();
  const text = 'Meeting on 2026-10-10 at 14:30, budget 12,500 EUR, room 404, order #12345678.';
  assert.equal(redactText(text, map), text);
});

test('restores placeholders in the answer', () => {
  const map = createRedactionMap();
  redactText('mail x@y.com about 123456789', map);
  assert.equal(restoreText('Sent to [EMAIL_1] re: [NUMBER_1]. [EMAIL_9] is unknown.', map),
    'Sent to x@y.com re: 123456789. [EMAIL_9] is unknown.');
});

test('stream restorer handles placeholders split across chunks', () => {
  const map = createRedactionMap();
  redactText('x@y.com', map);
  const r = createStreamRestorer(map);
  const pieces = ['Reply to [EM', 'AIL', '_1] now [', 'not a placeholder] ok'];
  const out = pieces.map((p) => r.push(p)).join('') + r.flush();
  assert.equal(out, 'Reply to x@y.com now [not a placeholder] ok');
});

test('stream restorer is a pass-through without redactions', () => {
  const r = createStreamRestorer(createRedactionMap());
  assert.equal(r.push('a [b'), 'a [b');
  assert.equal(r.flush(), '');
});
