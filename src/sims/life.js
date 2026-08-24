import { stepLife, stamp, GLIDER, RULES } from '../core/life.js';
import { hexToRgb, packRGB, mix } from '../theme.js';

export default {
  id: 'life',
  num: '02',
  title: 'Life + trails',
  engine: 'Canvas 2D',
  tag: '二維 · 會死 · 要餵',
  options: { rule: { label: '規則', values: Object.keys(RULES), labels: Object.fromEntries(Object.entries(RULES).map(([k, v]) => [k, v.label])), value: 'life' } },
  concept: {
    rule: 'B3/S23：死格有 3 個活鄰居就生，活格有 2 或 3 個就活，其餘死。Conway 1970 年定的四行規則，之後 Guy 找到滑翔子、Gosper 造出槍、2006 年 OTCA metapixel 讓 Life 跑起 Life。',
    why: '經典，但當背景有個致命問題：隨機湯幾百代後就只剩靜物跟振盪子。這裡用兩招救：每格留一條衰減的拖尾（看得見歷史），以及每隔幾秒從邊緣射進一隻滑翔子、丟一塊湯。Day & Night 規則活性高很多，適合不想餵的人。',
    dies: '會。活性低於閾值或停滯 60 代就重播種；平時靠滑翔子雨續命。',
    cost: '每幀 O(格數)，格子 6px，一般螢幕約 4 萬格，2D canvas 足夠。',
    interact: '游標移過或拖曳：在游標處潑一塊隨機湯。',
    refs: ['Gardner 1970, Scientific American', 'ConwayLife.com wiki: Glider, Gosper gun'],
  },
  create(canvas, env) {
    const ctx = canvas.getContext('2d', { alpha: false });
    const off = document.createElement('canvas'); const octx = off.getContext('2d');
    let w = 0, h = 0, a, b, trail, img, px, theme = env.theme, ruleKey = 'life', gen = 0, still = 0, acc = 0, feedT = 0, pop = 0;
    let lut;
    function buildLut() {
      const bg = hexToRgb(theme.bg), hot = mix(bg, hexToRgb(theme.accent), 0.62), warm = mix(bg, hexToRgb(theme.blue), 0.38), cold = hexToRgb(theme.dim);
      lut = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        const t = i / 255;
        const c = t > 0.92 ? mix(warm, hot, (t - 0.92) / 0.08) : mix(bg, mix(cold, warm, 0.55), Math.pow(t / 0.92, 0.8) * 0.75);
        lut[i] = packRGB(c.map(Math.round));
      }
    }
    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(canvas.clientWidth * dpr); canvas.height = Math.floor(canvas.clientHeight * dpr);
      const cell = 6 * dpr;
      w = Math.ceil(canvas.width / cell); h = Math.ceil(canvas.height / cell);
      off.width = w; off.height = h; img = octx.createImageData(w, h); px = new Uint32Array(img.data.buffer);
      ctx.imageSmoothingEnabled = false;
      reseed();
    }
    function reseed() {
      a = new Uint8Array(w * h); b = new Uint8Array(w * h); trail = new Uint8Array(w * h); gen = 0; still = 0;
      for (let i = 0; i < a.length; i++) a[i] = Math.random() < 0.18 ? 1 : 0;
    }
    function feed() {
      // a glider from a random edge plus a small soup patch
      const side = (Math.random() * 4) | 0;
      const ox = side === 0 ? 2 : side === 1 ? w - 5 : (Math.random() * w) | 0;
      const oy = side === 2 ? 2 : side === 3 ? h - 5 : (Math.random() * h) | 0;
      stamp(a, w, h, GLIDER, ox, oy, side === 1 || Math.random() < 0.5, side === 3 || Math.random() < 0.5);
      soup((Math.random() * w) | 0, (Math.random() * h) | 0, 5);
    }
    function soup(cx, cy, r) {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r && Math.random() < 0.45)
        a[(((cy + y) % h + h) % h) * w + (((cx + x) % w + w) % w)] = 1;
    }
    function render() {
      for (let i = 0; i < a.length; i++) {
        trail[i] = a[i] ? 255 : (trail[i] * 0.93) | 0;
        px[i] = lut[trail[i]];
      }
      octx.putImageData(img, 0, 0);
      ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
    }
    function frame(mul) {
      acc += mul * 0.5; feedT += mul;
      let n = 0;
      while (acc >= 1 && n < 4) {
        acc -= 1; n++;
        const { born, survive } = RULES[ruleKey];
        const r = stepLife(a, b, w, h, born, survive); [a, b] = [b, a]; gen++; pop = r.pop;
        still = r.changed < w * h * 0.001 ? still + 1 : 0;
        if (still > 60 || pop < w * h * 0.005) reseed();
      }
      if (feedT > 90) { feedT = 0; if (ruleKey === 'life' || ruleKey === 'highlife') feed(); }
      render();
    }
    buildLut(); resize();
    return {
      frame, resize, reseed,
      setTheme(t) { theme = t; buildLut(); },
      setOption(k, v) { if (k === 'rule') { ruleKey = v; reseed(); } },
      pointer(p) { if (p.leave) return; const s = w / canvas.clientWidth; soup(Math.floor(p.x * s), Math.floor(p.y * s), 4); },
      stats: () => `${RULES[ruleKey].label} · ${w}×${h} · gen ${gen} · pop ${pop}`,
      destroy() {},
    };
  },
};
