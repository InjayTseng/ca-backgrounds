// Boids (Reynolds 1987): separation, alignment, cohesion. Toroidal space.
// `b` is a flat Float32Array [x, y, vx, vy, ...]; spatial hash keeps it O(n).
export const DEFAULTS = {
  perception: 60, separation: 22, maxSpeed: 2.4, minSpeed: 1.0,
  wSep: 0.08, wAli: 0.05, wCoh: 0.012, wMouse: 0.35, mouseRadius: 140,
};

export function stepBoids(b, n, w, h, p = DEFAULTS, mouse = null) {
  const cs = p.perception, gw = Math.max(1, Math.ceil(w / cs)), gh = Math.max(1, Math.ceil(h / cs));
  const head = new Int32Array(gw * gh).fill(-1), next = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const gx = Math.min(gw - 1, (b[i * 4] / cs) | 0), gy = Math.min(gh - 1, (b[i * 4 + 1] / cs) | 0);
    const c = gy * gw + gx; next[i] = head[c]; head[c] = i;
  }
  const r2 = cs * cs, s2 = p.separation * p.separation, cells = new Int32Array(9);
  for (let i = 0; i < n; i++) {
    const x = b[i * 4], y = b[i * 4 + 1];
    let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, cnt = 0;
    const gx = (x / cs) | 0, gy = (y / cs) | 0;
    let nc = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const c = (((gy + oy) % gh + gh) % gh) * gw + (((gx + ox) % gw + gw) % gw);
      let dup = false; for (let q = 0; q < nc; q++) if (cells[q] === c) { dup = true; break; } // grids < 3 wide alias cells
      if (dup) continue;
      cells[nc++] = c;
      for (let j = head[c]; j !== -1; j = next[j]) {
        if (j === i) continue;
        let dx = b[j * 4] - x, dy = b[j * 4 + 1] - y;
        if (dx > w / 2) dx -= w; else if (dx < -w / 2) dx += w;
        if (dy > h / 2) dy -= h; else if (dy < -h / 2) dy += h;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2 || d2 === 0) continue;
        cnt++; ax += b[j * 4 + 2]; ay += b[j * 4 + 3]; cx += dx; cy += dy;
        if (d2 < s2) { const f = 1 - Math.sqrt(d2) / p.separation; sx -= dx * f; sy -= dy * f; }
      }
    }
    let vx = b[i * 4 + 2], vy = b[i * 4 + 3];
    if (cnt) {
      vx += (ax / cnt - vx) * p.wAli + (cx / cnt) * p.wCoh;
      vy += (ay / cnt - vy) * p.wAli + (cy / cnt) * p.wCoh;
    }
    vx += sx * p.wSep; vy += sy * p.wSep;
    if (mouse) {
      let dx = x - mouse.x, dy = y - mouse.y; const d = Math.hypot(dx, dy);
      if (d < p.mouseRadius && d > 0) { const f = (1 - d / p.mouseRadius) * p.wMouse * (mouse.attract ? -1 : 1); vx += dx / d * f; vy += dy / d * f; }
    }
    const sp = Math.hypot(vx, vy) || 1e-6;
    const cl = Math.min(p.maxSpeed, Math.max(p.minSpeed, sp)) / sp;
    b[i * 4 + 2] = vx * cl; b[i * 4 + 3] = vy * cl;
  }
  for (let i = 0; i < n; i++) {
    b[i * 4] = ((b[i * 4] + b[i * 4 + 2]) % w + w) % w;
    b[i * 4 + 1] = ((b[i * 4 + 1] + b[i * 4 + 3]) % h + h) % h;
  }
}
