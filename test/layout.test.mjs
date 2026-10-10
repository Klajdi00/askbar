import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  anchorAfterMove,
  clampInto,
  defaultMascotPosition,
  isMostlyVisible,
  placeNear,
  placeSaved,
  placeTopCenter,
} from '../src/main/layout.js';

const work = { x: 0, y: 0, width: 1920, height: 1040 };
const second = { x: 1920, y: 0, width: 1280, height: 1000 };
const mascot = (x, y) => ({ x, y, width: 96, height: 96 });

test('bar-only mode: centred near the top', () => {
  const p = placeTopCenter(work, { width: 440 });
  assert.equal(p.x, 740);
  assert.equal(p.top, Math.round(1040 * 0.18));
  assert.equal(p.growUp, false);
});

test('mascot bottom-right: bar to its left, growing upwards from its bottom edge', () => {
  const m = mascot(1800, 920);
  const p = placeNear(m, work, { width: 440 });
  assert.equal(p.x, 1800 - 6 - 440);
  assert.equal(p.growUp, true);
  assert.equal(p.bottom, 1016);
  assert.equal(p.maxHeight, 1016 - 12);
});

test('mascot top-left: bar to its right, growing downwards from its top edge', () => {
  const p = placeNear(mascot(12, 12), work, { width: 440 });
  assert.equal(p.x, 12 + 96 + 6);
  assert.equal(p.growUp, false);
  assert.equal(p.top, 12);
});

test('placement works on a second monitor', () => {
  const p = placeNear(mascot(3100, 20), second, { width: 440 });
  assert.equal(p.x, 3100 - 6 - 440);
  assert.equal(p.growUp, false);
});

test('bar never leaves the work area horizontally', () => {
  const narrow = { x: 0, y: 0, width: 500, height: 800 };
  const p = placeNear(mascot(380, 10), narrow, { width: 440 });
  assert.ok(p.x >= 0 && p.x + 440 <= 500);
});

test('dropped mascot stays where it is, only pulled back fully on screen', () => {
  assert.deepEqual(clampInto({ x: 1800, y: 900, width: 96, height: 96 }, work), { x: 1800, y: 900 });
  assert.deepEqual(clampInto({ x: 30, y: 25, width: 96, height: 96 }, work), { x: 30, y: 25 });
  assert.deepEqual(clampInto({ x: -50, y: 2000, width: 96, height: 96 }, work), { x: 0, y: 944 });
});

test('bar dropped in the top half grows down; in the bottom half grows up', () => {
  assert.deepEqual(anchorAfterMove({ x: 100, y: 200, width: 440, height: 64 }, work), {
    x: 100, top: 200, growUp: false, maxHeight: 1040 - 200 - 12,
  });
  assert.deepEqual(anchorAfterMove({ x: 100, y: 900, width: 440, height: 64 }, work), {
    x: 100, bottom: 964, growUp: true, maxHeight: 964 - 12,
  });
});

test('remembered bar spot is reused and kept on screen', () => {
  assert.deepEqual(placeSaved({ x: 100, top: 200 }, work, { width: 440 }), {
    x: 100, top: 200, growUp: false, maxHeight: 828,
  });
  assert.deepEqual(placeSaved({ x: 1700, bottom: 1500 }, work, { width: 440 }), {
    x: 1480, bottom: 1040, growUp: true, maxHeight: 1028,
  });
});

test('default position and off-screen detection', () => {
  assert.deepEqual(defaultMascotPosition(work, 96), { x: 1800, y: 920 });
  assert.equal(isMostlyVisible(mascot(2500, 100), [work, second]), true);
  assert.equal(isMostlyVisible(mascot(2500, 100), [work]), false); // second monitor unplugged
  assert.equal(isMostlyVisible(mascot(1880, 100), [work]), false); // less than half on screen
});
