// Boids (Reynolds 1987): separation, alignment, cohesion.
// The world is a closed tank, not a torus: a bird steers away once it is within
// `margin` of a wall, and reflects off the glass if it still reaches it.
// `b` is a flat Float32Array [x, y, vx, vy, ...]; spatial hash keeps it O(n).
export const DEFAULTS = {
  perception: 60, separation: 22, maxSpeed: 2.4, minSpeed: 1.0,
  wSep: 0.08, wAli: 0.05, wCoh: 0.012, wMouse: 0.35, mouseRadius: 140,
  margin: 90, wEdge: 0.14,
};

export function stepBoids(b, n, w, h, p = DEFAULTS, mouse = null) {
  const cs = p.perception, gw = Math.max(1, Math.ceil(w / cs)), gh = Math.max(1, Math.ceil(h / cs));
  const cell = (v, g) => Math.min(g - 1, Math.max(0, (v / cs) | 0));
  const head = new Int32Array(gw * gh).fill(-1), next = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const c = cell(b[i * 4 + 1], gh) * gw + cell(b[i * 4], gw);
    next[i] = head[c]; head[c] = i;
  }
  const r2 = cs * cs, s2 = p.separation * p.separation;
  const margin = Math.max(1, Math.min(p.margin, w / 2, h / 2)); // a narrow window still needs room to turn
  for (let i = 0; i < n; i++) {
    const x = b[i * 4], y = b[i * 4 + 1];
    let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, cnt = 0;
    const gx = cell(x, gw), gy = cell(y, gh);
    for (let oy = -1; oy <= 1; oy++) {
      const cellY = gy + oy; if (cellY < 0 || cellY >= gh) continue;
      for (let ox = -1; ox <= 1; ox++) {
        const cellX = gx + ox; if (cellX < 0 || cellX >= gw) continue;
        for (let j = head[cellY * gw + cellX]; j !== -1; j = next[j]) {
          if (j === i) continue;
          const dx = b[j * 4] - x, dy = b[j * 4 + 1] - y;
          const d2 = dx * dx + dy * dy;
          if (d2 > r2 || d2 === 0) continue;
          cnt++; ax += b[j * 4 + 2]; ay += b[j * 4 + 3]; cx += dx; cy += dy;
          if (d2 < s2) { const f = 1 - Math.sqrt(d2) / p.separation; sx -= dx * f; sy -= dy * f; }
        }
      }
    }
    let vx = b[i * 4 + 2], vy = b[i * 4 + 3];
    if (cnt) {
      vx += (ax / cnt - vx) * p.wAli + (cx / cnt) * p.wCoh;
      vy += (ay / cnt - vy) * p.wAli + (cy / cnt) * p.wCoh;
    }
    vx += sx * p.wSep; vy += sy * p.wSep;
    if (mouse) {
      const dx = x - mouse.x, dy = y - mouse.y, d = Math.hypot(dx, dy);
      if (d < p.mouseRadius && d > 0) { const f = (1 - d / p.mouseRadius) * p.wMouse * (mouse.attract ? -1 : 1); vx += dx / d * f; vy += dy / d * f; }
    }
    // proportional turn inside the margin does most of the work; the reflection below is the backstop
    if (x < margin) vx += p.wEdge * (1 - x / margin);
    else if (x > w - margin) vx -= p.wEdge * (1 - (w - x) / margin);
    if (y < margin) vy += p.wEdge * (1 - y / margin);
    else if (y > h - margin) vy -= p.wEdge * (1 - (h - y) / margin);
    const sp = Math.hypot(vx, vy) || 1e-6;
    const cl = Math.min(p.maxSpeed, Math.max(p.minSpeed, sp)) / sp;
    b[i * 4 + 2] = vx * cl; b[i * 4 + 3] = vy * cl;
  }
  for (let i = 0; i < n; i++) {
    let x = b[i * 4] + b[i * 4 + 2], y = b[i * 4 + 1] + b[i * 4 + 3];
    let vx = b[i * 4 + 2], vy = b[i * 4 + 3];
    if (x < 0) { x = -x; vx = -vx; } else if (x > w) { x = 2 * w - x; vx = -vx; }
    if (y < 0) { y = -y; vy = -vy; } else if (y > h) { y = 2 * h - y; vy = -vy; }
    b[i * 4] = x < 0 ? 0 : x > w ? w : x;       // a resize can strand a bird outside; clamp rather than ping-pong
    b[i * 4 + 1] = y < 0 ? 0 : y > h ? h : y;
    b[i * 4 + 2] = vx; b[i * 4 + 3] = vy;
  }
}
