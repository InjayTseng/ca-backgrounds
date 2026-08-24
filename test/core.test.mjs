import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepRow, seedRow } from '../src/core/rule1d.js';
import { stepLife, stamp, GLIDER, RULES } from '../src/core/life.js';
import { stepCyclic, offsets } from '../src/core/cyclic.js';
import { stepBoids, stepPredators, DEFAULTS } from '../src/core/boids.js';

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

test('a glider crosses the torus edge and reappears on the far side', () => {
  const w = 8, h = 8; let a = new Uint8Array(w * h), b = new Uint8Array(w * h);
  stamp(a, w, h, GLIDER, 6, 6);                      // straddles the bottom-right corner already
  for (let i = 0; i < 8; i++) { stepLife(a, b, w, h, RULES.life.born, RULES.life.survive); [a, b] = [b, a]; }
  const expect = new Uint8Array(w * h); stamp(expect, w, h, GLIDER, 8, 8); // (2,2) further on, wrapped to the origin
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

test('cyclic CA holds below the threshold and advances once it is met', () => {
  const w = 5, h = 5, k = 4, moore = offsets(1, 'moore');
  const a = new Uint8Array(w * h), b = new Uint8Array(w * h);
  a[2 * w + 3] = 1;                                  // centre (2,2) is 0 with a single successor neighbour
  stepCyclic(a, b, w, h, k, 2, moore);
  assert.equal(b[2 * w + 2], 0, 'one neighbour must not clear a threshold of 2');
  a[1 * w + 2] = 1;                                  // a second successor neighbour
  stepCyclic(a, b, w, h, k, 2, moore);
  assert.equal(b[2 * w + 2], 1);
});

test('the neumann neighbourhood ignores diagonals that moore accepts', () => {
  const moore = offsets(1, 'moore'), neumann = offsets(1, 'neumann');
  assert.equal(moore.length / 2, 8);
  assert.equal(neumann.length / 2, 4);
  const w = 5, h = 5, k = 3;
  const a = new Uint8Array(w * h), b = new Uint8Array(w * h);
  a[1 * w + 1] = 1;                                  // diagonal neighbour of (2,2)
  stepCyclic(a, b, w, h, k, 1, neumann);
  assert.equal(b[2 * w + 2], 0);
  stepCyclic(a, b, w, h, k, 1, moore);
  assert.equal(b[2 * w + 2], 1);
});

test('seedRow puts one cell at the centre, or fills from the rng', () => {
  assert.equal(str(seedRow(9, 'seed')), '000010000');
  assert.equal(str(seedRow(6, 'random', () => 0.4)), '111111');
  assert.equal(str(seedRow(6, 'random', () => 0.9)), '000000');
});

test('boids stay inside the tank and within the speed clamp', () => {
  const n = 50, w = 200, h = 100, b = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { b[i*4] = Math.random()*w; b[i*4+1] = Math.random()*h; b[i*4+2] = Math.random()*4-2; b[i*4+3] = Math.random()*4-2; }
  for (let s = 0; s < 200; s++) stepBoids(b, n, w, h, DEFAULTS, [{ x: 100, y: 50, attract: false }]);
  for (let i = 0; i < n; i++) {
    assert.ok(b[i*4] >= 0 && b[i*4] <= w && b[i*4+1] >= 0 && b[i*4+1] <= h, `boid ${i} left the tank`);
    const sp = Math.hypot(b[i*4+2], b[i*4+3]);
    assert.ok(sp <= DEFAULTS.maxSpeed + 1e-6 && sp >= DEFAULTS.minSpeed - 1e-6, `speed ${sp}`);
  }
});

test('a bird flying at the glass reflects back into the tank', () => {
  const w = 300, h = 200;
  const right = Float32Array.from([w - 1, h / 2, DEFAULTS.maxSpeed, 0]);
  stepBoids(right, 1, w, h, DEFAULTS, null);
  assert.ok(right[0] <= w, `x ${right[0]} escaped`);
  assert.ok(right[2] < 0, `vx ${right[2]} should have reversed`);
  const top = Float32Array.from([w / 2, 1, 0, -DEFAULTS.maxSpeed]);
  stepBoids(top, 1, w, h, DEFAULTS, null);
  assert.ok(top[1] >= 0, `y ${top[1]} escaped`);
  assert.ok(top[3] > 0, `vy ${top[3]} should have reversed`);
});

test('a predator turns toward the nearest bird and closes on it', () => {
  const w = 900, h = 600;
  // the bird is off to one side: a target dead ahead or dead behind would only
  // change the predator's speed, and the min-speed clamp would undo that
  const pred = Float32Array.from([300, 300, DEFAULTS.predSpeed, 0]);
  const b = Float32Array.from([550, 380, 0, 0]);
  stepPredators(pred, 1, b, 1, w, h, DEFAULTS);
  assert.ok(pred[3] > 0, `heading should bend toward the bird (vy ${pred[3]})`);
  assert.ok(pred[2] > 0, 'without reversing its cruise direction');

  const gap = () => Math.hypot(b[0] - pred[0], b[1] - pred[1]);
  const before = gap();
  for (let s = 0; s < 30; s++) stepPredators(pred, 1, b, 1, w, h, DEFAULTS);
  assert.ok(gap() < before, `predator should close the gap (${before.toFixed(1)} -> ${gap().toFixed(1)})`);
});

test('a predator out of sight of the flock keeps cruising', () => {
  const w = 4000, h = 400;
  const pred = Float32Array.from([100, 200, DEFAULTS.predSpeed, 0]);
  const b = Float32Array.from([3900, 200, 0, 0]);  // far beyond predSight
  stepPredators(pred, 1, b, 1, w, h, DEFAULTS);
  assert.ok(pred[2] > 0, 'still heading the way it was going');
  assert.ok(Math.hypot(pred[2], pred[3]) <= DEFAULTS.predSpeed + 1e-6);
});

test('predators stay in the tank and never exceed their speed cap', () => {
  const w = 300, h = 200, np = 2;
  const pred = Float32Array.from([10, 10, -3, -3, 290, 190, 3, 3]); // both aimed at a corner
  const n = 30, b = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { b[i*4] = (i * 37) % w; b[i*4+1] = (i * 53) % h; }
  for (let s = 0; s < 300; s++) stepPredators(pred, np, b, n, w, h, DEFAULTS);
  for (let i = 0; i < np; i++) {
    assert.ok(pred[i*4] >= 0 && pred[i*4] <= w && pred[i*4+1] >= 0 && pred[i*4+1] <= h, `predator ${i} left the tank`);
    assert.ok(Math.hypot(pred[i*4+2], pred[i*4+3]) <= DEFAULTS.predSpeed + 1e-6);
  }
});

test('two predators locked on the same bird push apart instead of overlapping', () => {
  const w = 600, h = 400, np = 2;
  const pred = Float32Array.from([300, 200, 1, 0, 304, 200, 1, 0]); // 4px apart, same heading
  const b = Float32Array.from([500, 200, 0, 0]);                    // one bird both will chase
  for (let s = 0; s < 60; s++) stepPredators(pred, np, b, 1, w, h, DEFAULTS);
  const gap = Math.hypot(pred[0] - pred[4], pred[1] - pred[5]);
  assert.ok(gap > 4, `predators converged instead of separating (gap ${gap.toFixed(1)})`);
});

test('the pointer moves the predators with the same polarity as the flock', () => {
  const w = 900, h = 600, none = new Float32Array(0);
  // the pointer sits off to one side of the heading: dead ahead or behind would
  // only change speed, and the min-speed clamp would undo that
  const flee = Float32Array.from([400, 300, DEFAULTS.predSpeed, 0]);
  stepPredators(flee, 1, none, 0, w, h, DEFAULTS, { x: 400, y: 380, attract: false });
  assert.ok(flee[3] < 0, `a pointer below should push the predator up (vy ${flee[3]})`);

  const chase = Float32Array.from([400, 300, DEFAULTS.predSpeed, 0]);
  stepPredators(chase, 1, none, 0, w, h, DEFAULTS, { x: 400, y: 380, attract: true });
  assert.ok(chase[3] > 0, `as bait it should pull the predator down (vy ${chase[3]})`);
});

test('a pointer beyond the predator radius leaves it alone', () => {
  const w = 2000, h = 1200, none = new Float32Array(0);
  const pred = Float32Array.from([1000, 600, DEFAULTS.predSpeed, 0]);
  stepPredators(pred, 1, none, 0, w, h, DEFAULTS, { x: 1000, y: 600 + DEFAULTS.predMouseRadius + 50, attract: false });
  assert.equal(pred[3], 0, 'no vertical deflection from a pointer out of range');
});

test('a bird inside a predator radius gains velocity away from it', () => {
  const w = 600, h = 400;
  const bird = Float32Array.from([300, 200, 0, 0]);
  const calm = Float32Array.from(bird);
  stepBoids(calm, 1, w, h, DEFAULTS, null);
  stepBoids(bird, 1, w, h, DEFAULTS, [{ x: 260, y: 200, radius: DEFAULTS.predRadius, weight: DEFAULTS.wPred }]);
  assert.ok(bird[2] > calm[2], 'a predator to the left should push the bird right');
  assert.ok(bird[0] > calm[0], 'and it should end up further right than if left alone');
});

test('boids spatial hash matches brute force, mouse and wall forces included', () => {
  const n = 40, w = 400, h = 100; // h / perception(60) -> 2 rows, so the edge cells carry most of the flock
  const a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { a[i*4] = (i * 37) % w; a[i*4+1] = (i * 53) % h; a[i*4+2] = ((i % 5) - 2) * 0.7; a[i*4+3] = ((i % 3) - 1) * 0.9; }
  const c = Float32Array.from(a);
  const mouse = { x: 180, y: 40, attract: false };
  stepBoids(a, n, w, h, DEFAULTS, [mouse]);
  // brute-force reference with identical rules and the same in-place (sequential) velocity update
  const p = DEFAULTS, r2 = p.perception ** 2, s2 = p.separation ** 2;
  const margin = Math.max(1, Math.min(p.margin, w / 2, h / 2));
  for (let i = 0; i < n; i++) {
    const x = c[i*4], y = c[i*4+1]; let sx=0, sy=0, ax=0, ay=0, cx=0, cy=0, cnt=0;
    for (let j = 0; j < n; j++) { if (j === i) continue; const dx = c[j*4]-x, dy = c[j*4+1]-y;
      const d2 = dx*dx+dy*dy; if (d2 > r2 || d2 === 0) continue; cnt++; ax += c[j*4+2]; ay += c[j*4+3]; cx += dx; cy += dy;
      if (d2 < s2) { const f = 1 - Math.sqrt(d2)/p.separation; sx -= dx*f; sy -= dy*f; } }
    let vx = c[i*4+2], vy = c[i*4+3];
    if (cnt) { vx += (ax/cnt - vx)*p.wAli + (cx/cnt)*p.wCoh; vy += (ay/cnt - vy)*p.wAli + (cy/cnt)*p.wCoh; }
    vx += sx*p.wSep; vy += sy*p.wSep;
    const mdx = x - mouse.x, mdy = y - mouse.y, md = Math.hypot(mdx, mdy);
    if (md < p.mouseRadius && md > 0) { const f = (1 - md/p.mouseRadius)*p.wMouse; vx += mdx/md*f; vy += mdy/md*f; }
    if (x < margin) vx += p.wEdge * (1 - x/margin); else if (x > w - margin) vx -= p.wEdge * (1 - (w-x)/margin);
    if (y < margin) vy += p.wEdge * (1 - y/margin); else if (y > h - margin) vy -= p.wEdge * (1 - (h-y)/margin);
    const sp = Math.hypot(vx, vy) || 1e-6, cl = Math.min(p.maxSpeed, Math.max(p.minSpeed, sp))/sp;
    c[i*4+2] = vx*cl; c[i*4+3] = vy*cl;
  }
  for (let i = 0; i < n; i++) { // move and reflect, as the second pass of stepBoids does
    let x = c[i*4] + c[i*4+2], y = c[i*4+1] + c[i*4+3], vx = c[i*4+2], vy = c[i*4+3];
    if (x < 0) { x = -x; vx = -vx; } else if (x > w) { x = 2*w - x; vx = -vx; }
    if (y < 0) { y = -y; vy = -vy; } else if (y > h) { y = 2*h - y; vy = -vy; }
    c[i*4] = x; c[i*4+1] = y; c[i*4+2] = vx; c[i*4+3] = vy;
  }
  for (let i = 0; i < n; i++) {
    assert.ok(Math.abs(a[i*4+2] - c[i*4+2]) < 1e-4 && Math.abs(a[i*4+3] - c[i*4+3]) < 1e-4, `boid ${i} velocity differs`);
    assert.ok(Math.abs(a[i*4] - c[i*4]) < 1e-4 && Math.abs(a[i*4+1] - c[i*4+1]) < 1e-4, `boid ${i} position differs`);
  }
});
