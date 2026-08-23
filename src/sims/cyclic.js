import { stepCyclic, PRESETS } from '../core/cyclic.js';
import { hexToRgb, packRGB, mix } from '../theme.js';

export default {
  id: 'cyclic',
  num: '03',
  title: 'Cyclic CA',
  week: '加映',
  tag: '二維 · 螺旋永續 · 不在學程',
  options: { preset: { label: 'Preset', values: Object.keys(PRESETS), labels: Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.label])), value: 'spirals' } },
  concept: {
    rule: 'k 種顏色排成一圈。一格若有足夠多的鄰居拿著「下一色」，它就跟著變成下一色。規則只有這一句，沒有出生沒有死亡。範圍、門檻、顏色數三個參數決定它長成螺旋還是湍流。',
    why: '從雜訊開始會經過三個相：碎屑 → 液滴（局部同步的色塊互相吞）→ 螺旋（一旦出現缺陷就自我維持的波源）。螺旋一旦形成就永遠轉下去，這正是背景要的：有變化、沒結局。Griffeath 1988 年用它證明「激發介質」不需要化學。',
    dies: '不會。螺旋是拓撲缺陷，沒有外力不會消失。',
    cost: '每幀 O(格數 × 鄰域大小)，4px 格子。R3 的 Moore 鄰域是 48 格，JS 還撐得住。',
    interact: '滑鼠移動：在游標處撒一把雜訊，會長出新的螺旋中心。',
    refs: ['Griffeath, Cyclic cellular automata (1988)', 'Fisch, Gravner, Griffeath 1991'],
  },
  create(canvas, env) {
    const ctx = canvas.getContext('2d', { alpha: false });
    const off = document.createElement('canvas'); const octx = off.getContext('2d');
    let w = 0, h = 0, a, b, img, px, theme = env.theme, preset = PRESETS.spirals, k = preset.k, gen = 0, acc = 0, lut;
    function buildLut() {
      // muted: every stop is pulled most of the way toward the background so it reads as texture, not signal
      const bg = hexToRgb(theme.bg), soft = (c, t) => mix(bg, hexToRgb(c), t);
      const c0 = soft(theme.bg2, 1), c1 = soft(theme.cool, 0.42), c2 = soft(theme.accent, 0.48), c3 = soft(theme.warm, 0.4);
      lut = new Uint32Array(k);
      for (let i = 0; i < k; i++) {
        const t = i / k; // bg -> cool -> accent -> warm -> bg, a closed ramp so state 0 and k-1 meet
        const c = t < 0.25 ? mix(c0, c1, t / 0.25) : t < 0.5 ? mix(c1, c2, (t - 0.25) / 0.25) : t < 0.75 ? mix(c2, c3, (t - 0.5) / 0.25) : mix(c3, c0, (t - 0.75) / 0.25);
        lut[i] = packRGB(c.map(Math.round));
      }
    }
    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(canvas.clientWidth * dpr); canvas.height = Math.floor(canvas.clientHeight * dpr);
      const cell = 4 * dpr;
      w = Math.ceil(canvas.width / cell); h = Math.ceil(canvas.height / cell);
      off.width = w; off.height = h; img = octx.createImageData(w, h); px = new Uint32Array(img.data.buffer);
      ctx.imageSmoothingEnabled = true;
      reseed();
    }
    function reseed() {
      a = new Uint8Array(w * h); b = new Uint8Array(w * h); gen = 0;
      for (let i = 0; i < a.length; i++) a[i] = (Math.random() * k) | 0;
    }
    function noise(cx, cy, r) {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r)
        a[(((cy + y) % h + h) % h) * w + (((cx + x) % w + w) % w)] = (Math.random() * k) | 0;
    }
    function render() {
      for (let i = 0; i < a.length; i++) px[i] = lut[a[i]];
      octx.putImageData(img, 0, 0);
      ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
    }
    function frame(mul) {
      acc += mul * 0.6;
      let n = 0;
      while (acc >= 1 && n < 4) { acc -= 1; n++; stepCyclic(a, b, w, h, k, preset.threshold, preset.off); [a, b] = [b, a]; gen++; }
      render();
    }
    buildLut(); resize();
    return {
      frame, resize, reseed,
      setTheme(t) { theme = t; buildLut(); },
      setOption(key, v) { if (key === 'preset') { preset = PRESETS[v]; k = preset.k; buildLut(); reseed(); } },
      pointer(p) { const s = w / canvas.clientWidth; noise(Math.floor(p.x * s), Math.floor(p.y * s), 5); },
      stats: () => `${preset.label} · ${w}×${h} · gen ${gen}`,
      destroy() {},
    };
  },
};
