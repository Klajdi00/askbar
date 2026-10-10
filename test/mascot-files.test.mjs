import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignStates, isSafeStoredName, mimeFor } from '../src/main/mascot-files.js';

test('one image is used for every state (as idle)', () => {
  assert.deepEqual(assignStates(['pics/my-cat.gif']), { idle: 'pics/my-cat.gif' });
});

test('files named idle / thinking / done get their own state', () => {
  assert.deepEqual(assignStates(['p/Done.png', 'p/idle.png', 'p/thinking.png']), {
    done: 'p/Done.png',
    idle: 'p/idle.png',
    thinking: 'p/thinking.png',
  });
  assert.deepEqual(assignStates(['p/frog-happy.webp', 'p/frog.webp']), { done: 'p/frog-happy.webp', idle: 'p/frog.webp' });
});

test('only state-named files: idle falls back to one of them', () => {
  assert.deepEqual(assignStates(['p/thinking.png']), { thinking: 'p/thinking.png', idle: 'p/thinking.png' });
});

test('supported types and safe stored names', () => {
  assert.equal(mimeFor('a/b/Cat.PNG'), 'image/png');
  assert.equal(mimeFor('x.svg'), 'image/svg+xml');
  assert.equal(mimeFor('x.exe'), null);
  assert.equal(isSafeStoredName('idle-1760000000000.gif'), true);
  assert.equal(isSafeStoredName('../../evil-1.png'), false);
  assert.equal(isSafeStoredName('idle-1.exe'), false);
});
