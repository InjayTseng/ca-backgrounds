import { getGL, program, drawQuad, texture, upload, framebuffer, bind, rgb } from '../gl.js';
import { ORBIUM } from './orbium.js';

const R = ORBIUM.R; // 13
const ORB_MASS = ORBIUM.cells.flat().reduce((a, b) => a + b, 0);

function buildKernel() {
  const n = 2 * R + 1, k = new Float32Array(n * n);
  let sum = 0;
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    const d = Math.hypot(x, y) / R;
    const v = d < 1 ? Math.exp(-Math.pow((d - 0.5) / 0.15, 2) / 2) : 0;
    k[(y + R) * n + (x + R)] = v; sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  return k;
}

const UPDATE_FS = `#version 300 es
precision highp float;
uniform sampler2D uState, uKernel;
uniform ivec2 uSize;
uniform float uMu, uSigma, uDt;
out vec4 o;
const int R = ${R};
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float u = 0.0;
  for (int dy = -R; dy <= R; dy++) {
    for (int dx = -R; dx <= R; dx++) {
      float k = texelFetch(uKernel, ivec2(dx + R, dy + R), 0).r;
      ivec2 q = (p + ivec2(dx, dy) + uSize) % uSize;
      u += k * texelFetch(uState, q, 0).r;
    }
  }
  float a = texelFetch(uState, p, 0).r;
  float z = (u - uMu) / uSigma;
  float g = 2.0 * exp(-0.5 * z * z) - 1.0;
  a = clamp(a + uDt * g, 0.0, 1.0);
  o = vec4(a, u, 0.0, 1.0);
}`;

const RENDER_FS = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform vec3 uC0, uC1, uC2;
in vec2 vUv;
out vec4 o;
void main() {
  vec2 s = texture(uState, vUv).rg;
  float a = s.r, u = s.g;
  vec3 c = mix(uC0, uC1, smoothstep(0.0, 0.5, a));
  c = mix(c, uC2, smoothstep(0.45, 1.0, a));
  c += uC1 * u * 0.8 * (1.0 - a);           // faint halo from the neighbourhood potential
  o = vec4(c, 1.0);
}`;

export default {
  id: 'lenia',
  num: '05',
  title: 'Lenia',
  engine: 'WebGL2',
  tag: '連續 · 會死 · 最像活的',
  options: { density: { label: '生物數', values: ['solo', 'few', 'many'], labels: { solo: '一隻', few: '少量', many: '很多' }, value: 'few' } },
  concept: {
    rule: 'Game of Life 的連續版：狀態是 0–1 的實數，鄰域是半徑 13 的環形 kernel，生長函數是一個鐘形曲線——鄰域「剛剛好」才長，太多太少都退。Orbium 是這組參數下第一隻被發現的生物。',
    why: '這是整個清單裡最像「活的」東西：軟體生物帶著自己的身體在格子上滑，互相繞、互相吞。背景要的模糊、發光、慢速它天生就有。代價是它會死——撞牆、兩隻合體，就散成霧。所以這裡有 watchdog：質量掉到閾值以下就重播種。Flow Lenia（2023）用質量守恆從根本解掉這件事。',
    dies: '會。每 3 秒讀回一次總質量：太低就在空曠處補一隻，爆成迷宮就整格重播。',
    cost: '每格每步 27×27 的 kernel 與狀態各 729 次 texel 讀取，只能 GPU。160 列的網格在 M 系列上很輕，Intel 內顯會吃力。',
    interact: '點或拖：在該處放一隻新的 Orbium（隨機朝向）。',
    refs: ['Chan 2019, Lenia: Biology of Artificial Life', 'Plantec et al. 2023, Flow Lenia', 'github.com/Chakazul/Lenia'],
  },
  create(canvas, env) {
    const { gl, floatRender } = getGL(canvas);
    const fmt = floatRender ? 'rgba16f' : 'rgba8';
    const upd = program(gl, UPDATE_FS), ren = program(gl, RENDER_FS);
    const kernelTex = texture(gl, 2 * R + 1, 2 * R + 1, 'r32f', buildKernel());
    let W = 0, H = 0, state = [], fbs = [], cur = 0, theme = env.theme, steps = 0, acc = 0, frames = 0, density = 'few', lastSpawn = 0, resets = 0, spawns = 0, targetCount = 0;
    const palette = () => [rgb(theme.bg), rgb(theme.cool), rgb(theme.hi)];

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(canvas.clientWidth * dpr); canvas.height = Math.floor(canvas.clientHeight * dpr);
      H = 160; W = Math.max(64, Math.round(H * canvas.clientWidth / Math.max(1, canvas.clientHeight)));
      state.forEach((t) => gl.deleteTexture(t.tex)); fbs.forEach((f) => gl.deleteFramebuffer(f));
      state = [0, 1].map(() => texture(gl, W, H, fmt, null, gl.LINEAR));
      fbs = state.map((t) => framebuffer(gl, [t]));
      reseed();
    }
    function orbiumPatch(rot, flip) {
      const c = ORBIUM.cells, n = 20, out = new Float32Array(n * n * 4);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        let sx = x, sy = y;
        if (flip) sx = n - 1 - sx;
        for (let r = 0; r < rot; r++) { const t = sx; sx = n - 1 - sy; sy = t; }
        out[(y * n + x) * 4] = c[sy][sx];
      }
      return fmt === 'rgba8' ? Uint8Array.from(out, (v) => Math.round(v * 255)) : out;
    }
    function spawn(x, y) {
      if (x < 0 || y < 0 || x + 20 > W || y + 20 > H) return;
      upload(gl, state[cur], x, y, 20, 20, orbiumPatch((Math.random() * 4) | 0, Math.random() < 0.5));
    }
    function reseed() {
      const zeros = fmt === 'rgba8' ? new Uint8Array(W * H * 4) : new Float32Array(W * H * 4);
      state.forEach((t) => upload(gl, t, 0, 0, W, H, zeros));
      const count = density === 'solo' ? 1 : Math.max(2, Math.round((W * H) / (density === 'many' ? 3200 : 9000)));
      targetCount = count;
      const placed = [];
      for (let tries = 0; tries < count * 20 && placed.length < count; tries++) {
        const x = (Math.random() * (W - 20)) | 0, y = (Math.random() * (H - 20)) | 0;
        if (placed.every(([px, py]) => Math.hypot(px - x, py - y) > 26)) { placed.push([x, y]); spawn(x, y); }
      }
      steps = 0;
    }
    function step() {
      const next = 1 - cur;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbs[next]);
      gl.viewport(0, 0, W, H);
      gl.useProgram(upd.prog);
      gl.uniform1i(upd.u.uState, bind(gl, 0, state[cur]));
      gl.uniform1i(upd.u.uKernel, bind(gl, 1, kernelTex));
      gl.uniform2i(upd.u.uSize, W, H);
      gl.uniform1f(upd.u.uMu, ORBIUM.m); gl.uniform1f(upd.u.uSigma, ORBIUM.s); gl.uniform1f(upd.u.uDt, 1 / ORBIUM.T);
      drawQuad(gl);
      cur = next; steps++;
    }
    // Read the whole state back (cheap at this size) so the watchdog can both
    // measure total mass and find an empty spot to drop a replacement creature.
    function readState() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbs[cur]);
      try {
        if (fmt === 'rgba8') { const b = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b); return { at: (i) => b[i * 4] / 255 }; }
        const b = new Float32Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, b); return { at: (i) => b[i * 4] };
      } catch { return null; }
    }
    function watchdog() {
      const st = readState(); if (!st) return;
      let m = 0; for (let i = 0; i < W * H; i++) m += st.at(i);
      if (m > W * H * 0.06) { resets++; reseed(); return; }           // collision blew up into a labyrinth
      if (m >= targetCount * ORB_MASS * 0.6) return;
      for (let t = 0; t < 24; t++) {                                   // population thinned out: replenish in an empty 32x32 window
        const x = (Math.random() * (W - 32)) | 0, y = (Math.random() * (H - 32)) | 0;
        let local = 0;
        for (let yy = y; yy < y + 32; yy += 2) for (let xx = x; xx < x + 32; xx += 2) local += st.at(yy * W + xx);
        if (local < 0.2) { spawn(x + 6, y + 6); spawns++; return; }
      }
    }
    function render() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(ren.prog);
      gl.uniform1i(ren.u.uState, bind(gl, 0, state[cur]));
      const [c0, c1, c2] = palette();
      gl.uniform3fv(ren.u.uC0, c0); gl.uniform3fv(ren.u.uC1, c1); gl.uniform3fv(ren.u.uC2, c2);
      drawQuad(gl);
    }
    function frame(mul) {
      acc += mul; frames++;
      let n = 0;
      while (acc >= 1 && n < 6) { acc -= 1; n++; step(); }
      if (frames % 90 === 0) watchdog();
      render();
    }
    resize();
    return {
      frame, resize, reseed,
      setTheme(t) { theme = t; },
      setOption(k, v) { if (k === 'density') { density = v; reseed(); } },
      pointer(p) {
        if (!p.down || p.leave) return;
        const now = performance.now(); if (now - lastSpawn < 220) return; lastSpawn = now;
        const x = Math.round(p.x / canvas.clientWidth * W) - 10, y = Math.round((1 - p.y / canvas.clientHeight) * H) - 10;
        spawn(x, y);
      },
      stats: () => `${W}×${H} · R=${R} μ=${ORBIUM.m} σ=${ORBIUM.s} · step ${steps} · +${spawns} −${resets} · ${fmt}`,
      destroy() { gl.getExtension('WEBGL_lose_context')?.loseContext(); },
    };
  },
};
