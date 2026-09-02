import { stepBoids, stepPredators, DEFAULTS } from '../core/boids.js';
import { rgba } from '../theme.js';
import { fitCanvas } from '../canvas.js';

const NPRED = 2;

export default {
  id: 'boids',
  num: '04',
  title: 'Boids',
  engine: 'Canvas 2D',
  tag: 'agent · 三條規則 · 鳥群自己出現',
  options: { mood: { label: '游標', values: ['repel', 'attract'], labels: { repel: '驅趕', attract: '吸引' }, value: 'repel' } },
  concept: {
    rule: '每隻鳥只看半徑內的鄰居，做三件事：別撞到（分離）、朝同方向（對齊）、往中心靠（凝聚）。沒有領袖，沒有全域資訊。視窗就是一只魚缸：靠近邊界會提前轉開，真的撞上就反彈。缸裡另有兩隻掠食者，各自鎖定看得到的最近一隻鳥追過去。',
    why: '從格子走到 agent：規則還是局部的，但載體從「格」變成會動的「個體」。鳥群、魚群、人群疏散全是這套。當背景最安全，因為它永遠不會收斂也不會爆炸——只是速度和密度要壓低，不然搶眼。掠食者的轉向刻意調鈍、只比鳥快一點，是缸裡的大魚，不是狩獵紀錄片。',
    dies: '不會。掠食者只驅散不吃掉，所以鳥數恆定；要注意的是太多鳥 + 太大凝聚力會結成一坨。',
    cost: '空間雜湊後 O(n)，300 隻在 2D canvas 上很輕。掠食者對全體鳥做暴力最近搜尋，兩隻的成本相對於鳥群本身可忽略。',
    interact: '游標是第三隻掠食者，連兩隻大魚都怕它；切成誘餌，鳥和掠食者就一起反過來追游標。',
    refs: ['Reynolds 1987, Flocks, Herds, and Schools', 'Downey, Think Complexity, Ch. on ABM'],
  },
  create(canvas, env) {
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, n = 0, b, pred, theme = env.theme, mouse = null, attract = false, dpr = 1, acc = 0;
    function resize() {
      ({ w, h, dpr } = fitCanvas(canvas));
      reseed();
    }
    function reseed() {
      n = Math.max(60, Math.min(420, Math.round((w * h) / 5500)));
      b = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2; b[i*4] = Math.random()*w; b[i*4+1] = Math.random()*h; b[i*4+2] = Math.cos(a)*1.5; b[i*4+3] = Math.sin(a)*1.5; }
      pred = new Float32Array(NPRED * 4);
      for (let i = 0; i < NPRED; i++) {
        const a = Math.random() * Math.PI * 2;
        pred[i*4] = Math.random()*w; pred[i*4+1] = Math.random()*h;
        pred[i*4+2] = Math.cos(a)*DEFAULTS.predSpeed; pred[i*4+3] = Math.sin(a)*DEFAULTS.predSpeed;
      }
      ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const pointer = () => (mouse ? { x: mouse.x, y: mouse.y, attract } : null);
    function threats() {
      const t = mouse ? [{ x: mouse.x, y: mouse.y, attract }] : [];
      for (let i = 0; i < NPRED; i++) t.push({ x: pred[i*4], y: pred[i*4+1], radius: DEFAULTS.predRadius, weight: DEFAULTS.wPred });
      return t;
    }
    function frame(mul) {
      acc += mul;
      let steps = 0;
      while (acc >= 1 && steps < 4) {
        acc -= 1; steps++;
        stepPredators(pred, NPRED, b, n, w, h, DEFAULTS, pointer()); // hunt first, so the flock reacts to where they are now
        stepBoids(b, n, w, h, DEFAULTS, threats());
      }
      acc = Math.min(acc, 1); // a speed above the step budget saturates instead of banking a backlog
      if (!steps) return;
      // motion-blur fade
      ctx.fillStyle = rgba(theme.bg, 0.16);
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.save(); ctx.scale(dpr, dpr);
      ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const x = b[i*4], y = b[i*4+1], vx = b[i*4+2], vy = b[i*4+3];
        const sp = Math.hypot(vx, vy), ux = vx / sp, uy = vy / sp;
        ctx.strokeStyle = i % 7 === 0 ? theme.accent : theme.cool;
        ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.moveTo(x - ux * 7, y - uy * 7); ctx.lineTo(x + ux * 4, y + uy * 4); ctx.stroke();
      }
      // predators: a filled arrowhead, larger and in the danger colour, so they
      // read as a different kind of thing rather than a big bird
      ctx.fillStyle = theme.danger;
      ctx.globalAlpha = 0.9;
      for (let i = 0; i < NPRED; i++) {
        const x = pred[i*4], y = pred[i*4+1], vx = pred[i*4+2], vy = pred[i*4+3];
        const sp = Math.hypot(vx, vy) || 1e-6, ux = vx / sp, uy = vy / sp;
        ctx.beginPath();
        ctx.moveTo(x + ux * 11, y + uy * 11);
        ctx.lineTo(x - ux * 6 - uy * 5, y - uy * 6 + ux * 5);
        ctx.lineTo(x - ux * 6 + uy * 5, y - uy * 6 - ux * 5);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    resize();
    return {
      frame, resize, reseed,
      setTheme(t) { theme = t; ctx.fillStyle = t.bg; ctx.fillRect(0, 0, canvas.width, canvas.height); },
      setOption(k, v) { if (k === 'mood') attract = v === 'attract'; },
      pointer(p) { mouse = { x: p.x, y: p.y }; if (p.leave) mouse = null; },
      stats: () => `${n} boids · ${NPRED} predators · perception ${DEFAULTS.perception}px`,
      destroy() {},
    };
  },
};
