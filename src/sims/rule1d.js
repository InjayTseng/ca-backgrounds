import { stepRow, seedRow } from '../core/rule1d.js';
import { hexToRgb, packRGB, mix } from '../theme.js';

const INIT = { 30: 'seed', 90: 'seed', 110: 'random', 184: 'random', 54: 'random', 73: 'random' };

export default {
  id: 'rule1d',
  num: '01',
  title: 'Rule 110',
  week: 'W1',
  tag: '一維 · 決定性 · 永不死',
  options: { rule: { label: 'Rule', values: [30, 90, 110, 184, 54, 73], value: 110 } },
  concept: {
    rule: '每個細胞只看左、中、右三格，查一張 8 筆的表決定下一格。256 條 rule 全部寫得出來，110 是其中一條，而且被證明是圖靈完備的。',
    why: '背景是一張往上捲的時空圖：每一幀算一列、推一列。一維所以便宜到不像話，決定性所以永遠不會「死」或「爆」，只會一直生成。Rule 110 的滑翔子在週期背景上互相碰撞，看久了會發現它根本是一台機器。',
    dies: '幾乎不會。決定性、無限生成；90 從單點種子長出 Sierpinski 碎形，30 長出混沌三角（繞一圈自撞後變成滿版亂流），110 和 184 從隨機列開始。線性規則在特定寬度會歸零，所以有一條「整列死掉就撒雜訊」的保險。',
    cost: '一條 canvas，每幀 O(寬度)。幾乎零。',
    interact: '點一下：在該欄注入一個擾動，看它往下游傳播。',
    refs: ['Wolfram, A New Kind of Science, Ch.2–3', 'Cook 2004, Universality in Elementary Cellular Automata'],
  },
  create(canvas, env) {
    const ctx = canvas.getContext('2d', { alpha: false });
    let cs = 3, cols = 0, rows = 0, row, nextRow, rule = 110, stripe, stripe32, acc = 0, gen = 0, theme = env.theme;
    let inkA, inkB, bgC;
    function colors() {
      const t = theme;
      bgC = hexToRgb(t.bg);
      inkA = hexToRgb(t.accent); inkB = hexToRgb(t.ink);
    }
    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      cs = Math.max(2, Math.round(3 * dpr));
      cols = Math.ceil(canvas.width / cs) | 1; rows = Math.ceil(canvas.height / cs); // odd ring: rule 90 on 2^k cells dies in k steps
      stripe = ctx.createImageData(cols * cs, cs); stripe32 = new Uint32Array(stripe.data.buffer);
      ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      reseed();
    }
    function reseed() {
      row = seedRow(cols, INIT[rule] || 'random'); nextRow = new Uint8Array(cols); gen = 0;
      ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    function drawStripe() {
      // alternate two inks by generation parity so the fresh row has a faint shimmer
      const ink = packRGB(mix(inkA, inkB, 0.25 + 0.25 * Math.sin(gen * 0.05)));
      const bg = packRGB(bgC), W = cols * cs;
      for (let x = 0; x < cols; x++) {
        const v = row[x] ? ink : bg;
        for (let k = 0; k < cs; k++) stripe32[x * cs + k] = v;
      }
      for (let y = 1; y < cs; y++) stripe32.copyWithin(y * W, 0, W);
      ctx.putImageData(stripe, 0, canvas.height - cs);
    }
    function frame(mul) {
      acc += mul;
      let n = 0;
      while (acc >= 1 && n < 8) {
        acc -= 1; n++;
        ctx.drawImage(canvas, 0, -cs);
        stepRow(row, rule, nextRow); [row, nextRow] = [nextRow, row]; gen++;
        if (gen % 64 === 0 && !row.some((v) => v)) { row = seedRow(cols, 'random'); } // linear rules can annihilate; restart from noise
        drawStripe();
      }
      if (n) { // slow fade of history so the eye is drawn to the fresh edge
        ctx.fillStyle = theme.name === 'dark' ? 'rgba(11,13,16,0.005)' : 'rgba(243,239,230,0.005)';
        ctx.fillRect(0, 0, canvas.width, canvas.height - cs);
      }
    }
    colors(); resize();
    return {
      frame, resize, reseed,
      setTheme(t) { theme = t; colors(); reseed(); },
      setOption(k, v) { if (k === 'rule') { rule = +v; reseed(); } },
      pointer(p) { if (p.down && !p.leave) { const x = Math.floor(p.x * (canvas.width / canvas.clientWidth) / cs); for (let i = -2; i <= 2; i++) row[(x + i + cols) % cols] ^= 1; } },
      stats: () => `rule ${rule} · ${cols} cells · gen ${gen}`,
      destroy() {},
    };
  },
};
