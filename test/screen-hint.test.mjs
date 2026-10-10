import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// screen-hint.js is a classic browser script that sets globalThis.looksLikeScreenQuestion.
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../src/renderer/screen-hint.js', import.meta.url), 'utf8'), context);
const isScreenQuestion = context.looksLikeScreenQuestion;

test('recognises questions about the screen', () => {
  for (const q of [
    'what am I looking at?',
    "What's on my screen",
    'can you see my screen',
    'look at this screen and fix the error',
    'explain the screenshot',
    "qu'est-ce qu'il y a sur mon écran ?",
    'explique ce que je vois',
    'çfarë ka në ekranin tim?',
  ]) {
    assert.equal(isScreenQuestion(q), true, q);
  }
});

test('ignores ordinary questions', () => {
  for (const q of [
    '',
    'write a reply to my landlord',
    'how do I center a div?',
    'translate "good morning" to French',
    'screening interview tips',
    'what is a display: flex container',
  ]) {
    assert.equal(isScreenQuestion(q), false, q);
  }
});
