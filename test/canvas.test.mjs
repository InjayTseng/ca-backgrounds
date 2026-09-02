import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fitCanvas } from '../src/canvas.js';

const fake = (clientWidth, clientHeight) => ({ clientWidth, clientHeight, width: 300, height: 150 });
afterEach(() => { delete globalThis.devicePixelRatio; });

test('a 0×0 host still gets a 1×1 backing store and 1×1 CSS size', () => {
  const c = fake(0, 0);
  const r = fitCanvas(c);
  assert.deepEqual([c.width, c.height], [1, 1]);
  assert.deepEqual([r.w, r.h], [1, 1]);
});

test('DPR is applied to the backing store and capped', () => {
  globalThis.devicePixelRatio = 3;
  const c = fake(800, 600);
  assert.deepEqual(fitCanvas(c), { w: 800, h: 600, dpr: 2 });
  assert.deepEqual([c.width, c.height], [1600, 1200]);
  assert.deepEqual(fitCanvas(c, { maxDpr: 1 }), { w: 800, h: 600, dpr: 1 });
  assert.deepEqual([c.width, c.height], [800, 600]);
});

test('no devicePixelRatio (node, odd embeds) means 1', () => {
  const c = fake(320, 200);
  assert.equal(fitCanvas(c).dpr, 1);
  assert.deepEqual([c.width, c.height], [320, 200]);
});

test('fractional CSS sizes floor, never to zero', () => {
  globalThis.devicePixelRatio = 1.5;
  const c = fake(0.6, 333.7);
  const r = fitCanvas(c);
  assert.deepEqual([r.w, r.h], [1, 333]);
  assert.deepEqual([c.width, c.height], [1, 499]);
});
