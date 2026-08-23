import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepRow } from '../src/core/rule1d.js';
import { stepLife, stamp, GLIDER, RULES } from '../src/core/life.js';
import { stepCyclic } from '../src/core/cyclic.js';
import { stepBoids, DEFAULTS } from '../src/core/boids.js';

const row = (s) => Uint8Array.from(s, (c) => +c);
const str = (r) => Array.from(r).join('');

test('rule 110 / 30 / 90 from a single seed', () => {
  assert.equal(str(stepRow(row('00001000'), 110)), '00011000');
  assert.equal(str(stepRow(row('00001000'), 30)),  '00011100');
  assert.equal(str(stepRow(row('00001000'), 90)),  '00010100');
});

test('rule 0 kills everything, rule 255 fills everything, wrap works', () => {
  assert.equal(str(stepRow(row('10101'), 0)), '00000');
  assert.equal(str(stepRow(row('00000'), 255)), '11111');
  // rule 2 = only (0,0,1) -> 1, i.e. "right neighbour alive"; rule 16 = only (1,0,0) -> 1
  assert.equal(str(stepRow(row('00001'), 2)), '00010');
  assert.equal(str(stepRow(row('00001'), 16)), '10000'); // wraps: cell 0's left neighbour is cell 4
});

test('glider translates by (1,1) after 4 generations', () => {
  const w = 10, h = 10; let a = new Uint8Array(w * h), b = new Uint8Array(w * h);
  stamp(a, w, h, GLIDER, 1, 1);
  for (let i = 0; i < 4; i++) { stepLife(a, b, w, h, RULES.life.born, RULES.life.survive); [a, b] = [b, a]; }
  const expect = new Uint8Array(w * h); stamp(expect, w, h, GLIDER, 2, 2);
  assert.deepEqual(Array.from(a), Array.from(expect));
});

test('blinker oscillates and reports pop/changed', () => {
  const w = 5, h = 5; const a = new Uint8Array(w * h), b = new Uint8Array(w * h);
  a[2 * w + 1] = a[2 * w + 2] = a[2 * w + 3] = 1;
  const r = stepLife(a, b, w, h, RULES.life.born, RULES.life.survive);
  assert.equal(r.pop, 3); assert.equal(r.changed, 4);
  assert.equal(b[1 * w + 2] + b[2 * w + 2] + b[3 * w + 2], 3);
});

test('cyclic CA advances a cell only when a successor neighbour exists', () => {
  const w = 3, h = 3, k = 4; const a = new Uint8Array(w * h), b = new Uint8Array(w * h);
  a[4] = 0; a[5] = 1;            // centre is 0, right neighbour is 1 -> centre becomes 1
  a[0] = 3;                      // corner 3 has a 0 neighbour -> wraps to 0
  const changed = stepCyclic(a, b, w, h, k, 1);
  assert.equal(b[4], 1); assert.equal(b[0], 0);
  assert.ok(changed >= 2);
  assert.equal(b[5], 1);         // 1 has no neighbour holding 2 -> stays
});

test('boids stay inside the torus and within the speed clamp', () => {
  const n = 50, w = 200, h = 100, b = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { b[i*4] = Math.random()*w; b[i*4+1] = Math.random()*h; b[i*4+2] = Math.random()*4-2; b[i*4+3] = Math.random()*4-2; }
  for (let s = 0; s < 50; s++) stepBoids(b, n, w, h, DEFAULTS, { x: 100, y: 50, attract: false });
  for (let i = 0; i < n; i++) {
    assert.ok(b[i*4] >= 0 && b[i*4] < w && b[i*4+1] >= 0 && b[i*4+1] < h);
    const sp = Math.hypot(b[i*4+2], b[i*4+3]);
    assert.ok(sp <= DEFAULTS.maxSpeed + 1e-6 && sp >= DEFAULTS.minSpeed - 1e-6, `speed ${sp}`);
  }
});
