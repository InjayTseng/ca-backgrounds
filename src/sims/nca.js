import { getGL, program, drawQuad, texture, upload, framebuffer, bind, rgb } from '../gl.js';

// Inference shader for the Growing NCA trained by nca/train.py. Layout contract lives there.
const COMMON = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform ivec2 uSize;
vec4 fetch(sampler2D s, ivec2 p) {
  if (p.x < 0 || p.y < 0 || p.x >= uSize.x || p.y >= uSize.y) return vec4(0.0);
  return texelFetch(s, p, 0);
}
float amax(sampler2D s, ivec2 p) {
  float m = 0.0;
  for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) m = max(m, fetch(s, p + ivec2(dx, dy)).a);
  return m;
}`;

const UPDATE_FS = COMMON + `
uniform sampler2D uS0, uS1, uS2, uS3, uW1, uW2;
uniform float uB1[128];
uniform float uSeed, uFire;
uniform vec3 uDamage;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
layout(location = 3) out vec4 o3;
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void perceive(sampler2D s, ivec2 p, out vec4 id, out vec4 gx, out vec4 gy) {
  vec4 a = fetch(s, p + ivec2(-1, -1)), b = fetch(s, p + ivec2(0, -1)), c = fetch(s, p + ivec2(1, -1));
  vec4 d = fetch(s, p + ivec2(-1,  0)), e = fetch(s, p),                f = fetch(s, p + ivec2(1,  0));
  vec4 g = fetch(s, p + ivec2(-1,  1)), h = fetch(s, p + ivec2(0,  1)), i = fetch(s, p + ivec2(1,  1));
  id = e;
  gx = (c + 2.0 * f + i - a - 2.0 * d - g) / 8.0;
  gy = (g + 2.0 * h + i - a - 2.0 * b - c) / 8.0;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 f[12];
  perceive(uS0, p, f[0], f[4], f[8]);
  perceive(uS1, p, f[1], f[5], f[9]);
  perceive(uS2, p, f[2], f[6], f[10]);
  perceive(uS3, p, f[3], f[7], f[11]);
  float h[128];
  for (int i = 0; i < 128; i++) {
    float acc = uB1[i];
    for (int j = 0; j < 12; j++) acc += dot(texelFetch(uW1, ivec2(j, i), 0), f[j]);
    h[i] = max(acc, 0.0);
  }
  float d[16];
  for (int c = 0; c < 16; c++) {
    float acc = 0.0;
    for (int j = 0; j < 32; j++) acc += dot(texelFetch(uW2, ivec2(j, c), 0), vec4(h[4 * j], h[4 * j + 1], h[4 * j + 2], h[4 * j + 3]));
    d[c] = acc;
  }
  float m = hash(vec2(p) + uSeed) < uFire ? 1.0 : 0.0;
  vec4 n0 = f[0] + vec4(d[0], d[1], d[2], d[3]) * m;
  vec4 n1 = f[1] + vec4(d[4], d[5], d[6], d[7]) * m;
  vec4 n2 = f[2] + vec4(d[8], d[9], d[10], d[11]) * m;
  vec4 n3 = f[3] + vec4(d[12], d[13], d[14], d[15]) * m;
  if (uDamage.z > 0.0 && distance(vec2(p) + 0.5, uDamage.xy) < uDamage.z) { n0 = vec4(0.0); n1 = n0; n2 = n0; n3 = n0; }
  o0 = n0; o1 = n1; o2 = n2; o3 = n3;
}`;

const MASK_FS = COMMON + `
uniform sampler2D uT0, uT1, uT2, uT3, uOld;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
layout(location = 3) out vec4 o3;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float life = (amax(uOld, p) > 0.1 && amax(uT0, p) > 0.1) ? 1.0 : 0.0;
  o0 = texelFetch(uT0, p, 0) * life;
  o1 = texelFetch(uT1, p, 0) * life;
  o2 = texelFetch(uT2, p, 0) * life;
  o3 = texelFetch(uT3, p, 0) * life;
}`;

const RENDER_FS = `#version 300 es
precision highp float;
uniform sampler2D uS0;
uniform vec3 uBg;
uniform float uCropX; // screenAspect / gridAspect (<= 1): show the centre of the wider grid without stretching
in vec2 vUv;
out vec4 o;
void main() {
  vec4 s = texture(uS0, vec2(0.5 + (vUv.x - 0.5) * uCropX, 1.0 - vUv.y));
  float a = clamp(s.a, 0.0, 1.0);
  o = vec4(clamp(s.rgb, 0.0, 1.0) + uBg * (1.0 - a), 1.0);
}`;

export default {
  id: 'nca',
  num: '06',
  title: 'Neural CA',
  week: 'W9–10',
  tag: '學出來的規則 · 自癒 · 只有你做得出來',
  options: { brush: { label: 'Hover', values: ['erase', 'off'], value: 'erase' } },
  concept: {
    rule: '還是 CA：每格只看 3×3 鄰居。但更新規則不是人寫的，是一個 8k 參數的小網路，用「從一個種子長成這張圖、被砍掉還要長回來」當損失函數訓出來的。',
    why: '所有其他分頁的規則都是人定的，這一頁的規則是學出來的，而且目標是穩態——所以它不會死、不會爆，還會自我修復。把滑鼠滑過去擦掉一塊，它會重新長出來。這是 Levin 講的 morphogenesis 在 64×64 格子上的玩具版，也是你網站背景裡唯一「只有你做得出來」的東西。',
    dies: '不會。訓練目標就是穩態；每個 tile 的質量若歸零會自動補一顆種子。',
    cost: '每格每步約 8k 次乘加 + 2k 次 texel 讀。GPU 上 256×128 格很輕。權重由 nca/train.py 訓出（M 系列約 20 分鐘）。',
    interact: '滑鼠掃過：擦掉半徑 6 格，看它長回來。',
    refs: ['Mordvintsev et al. 2020, Growing Neural Cellular Automata (Distill)', 'Niklasson et al. 2021, Self-Organising Textures', 'Kalkhof et al. 2023, Med-NCA'],
  },
  async load() {
    const url = new URL('../../nca/weights.json', import.meta.url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`沒有權重檔（${res.status}）。先跑 nca/train.py，它會寫出 nca/weights.json。`);
    return res.json();
  },
  create(canvas, env, weights) {
    if (!weights) throw new Error('NCA weights not loaded');
    const { gl, floatRender } = getGL(canvas);
    if (!floatRender) { gl.getExtension('WEBGL_lose_context')?.loseContext(); throw new Error('這台機器的 WebGL2 不支援 float render target（EXT_color_buffer_float），NCA 跑不起來。'); }
    const upd = program(gl, UPDATE_FS), msk = program(gl, MASK_FS), ren = program(gl, RENDER_FS);
    const w1 = texture(gl, 12, 128, 'rgba32f', Float32Array.from(weights.w1));
    const w2 = texture(gl, 32, 16, 'rgba32f', Float32Array.from(weights.w2));
    const b1 = Float32Array.from(weights.b1);
    const TILE = weights.grid;
    let W = 0, H = 0, cols = 0, rows = 0, sets = [], fbs = [], cur = 0, tmp = 1, nxt = 2, theme = env.theme;
    let steps = 0, acc = 0, frames = 0, damage = [0, 0, 0], erase = true, seedQueue = [];

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(canvas.clientWidth * dpr); canvas.height = Math.floor(canvas.clientHeight * dpr);
      rows = 2; cols = Math.max(1, Math.ceil((canvas.clientWidth / canvas.clientHeight) * rows));
      W = cols * TILE; H = rows * TILE;
      sets.flat().forEach((t) => gl.deleteTexture(t.tex)); fbs.forEach((f) => gl.deleteFramebuffer(f));
      sets = [0, 1, 2].map(() => [0, 1, 2, 3].map(() => texture(gl, W, H, 'rgba16f')));
      fbs = sets.map((s) => framebuffer(gl, s));
      reseed();
    }
    const cropX = () => Math.min(1, (canvas.clientWidth / canvas.clientHeight) / (W / H));
    function seedTile(i) {
      const tx = i % cols, ty = (i / cols) | 0;
      const x = tx * TILE + (TILE >> 1) + ((Math.random() * 12 - 6) | 0), y = ty * TILE + (TILE >> 1) + ((Math.random() * 12 - 6) | 0);
      const one = new Float32Array([0, 0, 0, 1]), ones = new Float32Array([1, 1, 1, 1]);
      upload(gl, sets[cur][0], x, y, 1, 1, one);
      for (let t = 1; t < 4; t++) upload(gl, sets[cur][t], x, y, 1, 1, ones);
    }
    function reseed() {
      const zeros = new Float32Array(W * H * 4);
      sets.forEach((s) => s.forEach((t) => upload(gl, t, 0, 0, W, H, zeros)));
      seedQueue = Array.from({ length: cols * rows }, (_, i) => i).sort(() => Math.random() - 0.5);
      steps = 0;
    }
    function step() {
      // pass 1: perceive + network + stochastic update -> tmp
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbs[tmp]);
      gl.viewport(0, 0, W, H);
      gl.useProgram(upd.prog);
      ['uS0', 'uS1', 'uS2', 'uS3'].forEach((n, i) => gl.uniform1i(upd.u[n], bind(gl, i, sets[cur][i])));
      gl.uniform1i(upd.u.uW1, bind(gl, 4, w1)); gl.uniform1i(upd.u.uW2, bind(gl, 5, w2));
      gl.uniform1fv(upd.u.uB1, b1);
      gl.uniform2i(upd.u.uSize, W, H);
      gl.uniform1f(upd.u.uSeed, (steps * 7.13) % 1000); gl.uniform1f(upd.u.uFire, weights.fire_rate);
      gl.uniform3fv(upd.u.uDamage, damage);
      drawQuad(gl);
      // pass 2: life mask (pre from old, post from tmp) -> nxt
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbs[nxt]);
      gl.useProgram(msk.prog);
      ['uT0', 'uT1', 'uT2', 'uT3'].forEach((n, i) => gl.uniform1i(msk.u[n], bind(gl, i, sets[tmp][i])));
      gl.uniform1i(msk.u.uOld, bind(gl, 4, sets[cur][0]));
      gl.uniform2i(msk.u.uSize, W, H);
      drawQuad(gl);
      [cur, tmp, nxt] = [nxt, cur, tmp];
      steps++; damage = [0, 0, 0];
    }
    function tileMasses() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbs[cur]);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      const b = new Float32Array(W * H * 4);
      try { gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, b); } catch { return null; }
      const m = new Float32Array(cols * rows);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[((y / TILE) | 0) * cols + ((x / TILE) | 0)] += b[(y * W + x) * 4 + 3];
      return m;
    }
    function render() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(ren.prog);
      gl.uniform1i(ren.u.uS0, bind(gl, 0, sets[cur][0]));
      gl.uniform3fv(ren.u.uBg, rgb(theme.bg));
      gl.uniform1f(ren.u.uCropX, cropX());
      drawQuad(gl);
    }
    function frame(mul) {
      acc += mul; frames++;
      if (seedQueue.length && frames % 40 === 1) seedTile(seedQueue.shift());
      let n = 0;
      while (acc >= 1 && n < 4) { acc -= 1; n++; step(); }
      if (frames % 150 === 0 && !seedQueue.length) {
        const m = tileMasses();
        if (m) m.forEach((v, i) => { if (v < 0.5) seedQueue.push(i); });
      }
      render();
    }
    resize();
    return {
      frame, resize, reseed,
      setTheme(t) { theme = t; },
      setOption(k, v) { if (k === 'brush') erase = v === 'erase'; },
      pointer(p) {
        if (!erase || p.leave) return;
        damage = [(0.5 + (p.x / canvas.clientWidth - 0.5) * cropX()) * W, p.y / canvas.clientHeight * H, 6];
      },
      stats: () => `${W}×${H} · 16 ch · ${weights.iters} iters · loss ${(+weights.loss).toFixed(4)} · step ${steps}`,
      destroy() { gl.getExtension('WEBGL_lose_context')?.loseContext(); },
    };
  },
};
