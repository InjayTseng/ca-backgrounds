import { THEMES } from './theme.js';
import { STR, EN_SIMS } from './i18n.js';
import rule1d from './sims/rule1d.js';
import life from './sims/life.js';
import cyclic from './sims/cyclic.js';
import boids from './sims/boids.js';
import lenia from './sims/lenia.js';
import nca from './sims/nca.js';

const SIMS = [rule1d, life, cyclic, boids, lenia, nca];
const FPS = 30;
const $ = (s, r = document) => r.querySelector(s);

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked (iframe, private mode) */ } },
};
const MOBILE = matchMedia('(max-width: 760px)');
const state = {
  sim: null, ctrl: null, canvas: null, theme: (store.get('ca.theme') in THEMES) ? store.get('ca.theme') : 'dark',
  lang: store.get('ca.lang') === 'zh' ? 'zh' : 'en', lastError: null,
  speed: 1, paused: false, hidden: false, raf: 0, last: 0, fpsAcc: 0, fpsN: 0, fps: 0, lastStats: 0,
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
};

function setTheme(name) {
  state.theme = name;
  document.documentElement.dataset.theme = name;
  store.set('ca.theme', name);
  state.ctrl?.setTheme(THEMES[name]);
  $('#theme').textContent = name === 'dark' ? '☾ dark' : '☀ light';
}

const T = () => STR[state.lang];
const simText = (sim) => state.lang === 'en' && EN_SIMS[sim.id] ? EN_SIMS[sim.id] : { tag: sim.tag, concept: sim.concept };

function setLang(lang) {
  state.lang = lang;
  store.set('ca.lang', lang);
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
  $('.brand-text .t1').textContent = T().t1;
  $('.brand-text .t2').textContent = T().t2;
  $('.toolbar .keys').textContent = T().keys;
  $('#reseed').textContent = T().reseed;
  $('#hide').textContent = T().hide;
  $('#lang').textContent = T().langBtn;
  $('#card-toggle').textContent = T().concept + ' ▸';
  if (state.sim) renderCard(state.sim, state.lastError);
}

function renderTabs() {
  const nav = $('#tabs');
  nav.innerHTML = SIMS.map((s) => `
    <button class="tab" id="tab-${s.id}" data-id="${s.id}" role="tab" aria-controls="card" aria-selected="${state.sim?.id === s.id}">
      <span class="num">${s.num}</span>
      <span class="name">${s.title}</span>
      <span class="week">${s.week}</span>
    </button>`).join('');
  nav.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => (location.hash = b.dataset.id)));
}

function renderCard(sim, error) {
  state.lastError = error ?? null;
  const t = T();
  const { tag, concept: c } = simText(sim);
  const opts = Object.entries(sim.options || {}).map(([key, o]) => `
    <div class="opt"><span class="lbl">${o.label}</span>
      ${o.values.map((v) => `<button class="chip" data-key="${key}" data-val="${v}" aria-pressed="${String(v) === String(o.value)}">${o.labels?.[v] ?? v}</button>`).join('')}
    </div>`).join('');
  $('#card').innerHTML = `
    <div class="card-head">
      <span class="num">${sim.num}</span>
      <h1>${sim.title}</h1>
      <span class="week">${sim.week}</span>
    </div>
    <p class="tagline">${tag}</p>
    ${error ? `<p class="error">${error}</p>` : ''}
    <dl class="spec">
      <dt>${t.rule}</dt><dd>${c.rule}</dd>
      <dt>${t.why}</dt><dd>${c.why}</dd>
      <dt>${t.dies}</dt><dd>${c.dies}</dd>
      <dt>${t.cost}</dt><dd>${c.cost}</dd>
      <dt>${t.interact}</dt><dd>${c.interact}</dd>
    </dl>
    ${sim.id === 'nca' && !error ? `<img class="target" src="nca/target.png" alt="training target" title="${t.target}">` : ''}
    <div class="opts">${opts}</div>
    <ul class="refs">${sim.concept.refs.map((r) => `<li>${r}</li>`).join('')}</ul>
    <div class="stats" id="stats"></div>`;
  $('#card').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
    sim.options[b.dataset.key].value = b.dataset.val;
    state.ctrl?.setOption(b.dataset.key, b.dataset.val);
    b.parentElement.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', x === b));
  }));
}

let mountSeq = 0;
async function mount(id) {
  const my = ++mountSeq;
  const sim = SIMS.find((s) => s.id === id) || SIMS[0];
  if (state.ctrl) { state.ctrl.destroy(); state.ctrl = null; }
  state.canvas?.remove();
  state.sim = sim;
  renderTabs();
  const canvas = document.createElement('canvas');
  canvas.className = 'stage';
  $('#stage').appendChild(canvas);
  $('#card').setAttribute('aria-labelledby', `tab-${sim.id}`);
  state.canvas = canvas;
  document.title = `${sim.num} ${sim.title} — Living Backgrounds`;
  let error = null;
  try {
    const extra = sim.load ? await sim.load() : undefined;
    if (my !== mountSeq) return; // a later mount superseded this one while weights were loading
    const ctrl = sim.create(canvas, { theme: THEMES[state.theme] }, extra);
    state.ctrl = ctrl;
    Object.entries(sim.options ?? {}).forEach(([k, o]) => ctrl.setOption(k, o.value)); // chips persist across tab switches
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      if (state.canvas !== canvas) return; // our own destroy() -> loseContext() on a tab switch, not a real loss
      state.paused = true; renderCard(sim, 'WebGL context lost (GPU reset?). Switch tabs to rebuild.');
    });
    if (state.reduced) for (let i = 0; i < 120; i++) ctrl.frame(1); // settle into something worth looking at, then hold
  } catch (e) {
    console.error(e); error = e.message;
    canvas.style.display = 'none';
  }
  if (my === mountSeq) renderCard(sim, error);
}

function loop(t) {
  state.raf = requestAnimationFrame(loop);
  const dt = t - state.last;
  if (dt < 1000 / FPS - 1) return;
  state.last = t;
  state.fpsAcc += dt; state.fpsN++;
  if (state.fpsAcc > 500) { state.fps = Math.round(1000 * state.fpsN / state.fpsAcc); state.fpsAcc = 0; state.fpsN = 0; }
  if (state.ctrl && !state.paused && !(state.reduced && !state.forceMotion)) {
    try { state.ctrl.frame(state.speed); } catch (e) { console.error(e); state.paused = true; }
  }
  if (t - state.lastStats > 400 && state.ctrl) {
    state.lastStats = t;
    const el = $('#stats'); if (el) el.textContent = `${state.fps} fps · ${state.ctrl.stats()}${state.paused ? ' · paused' : ''}`;
  }
}

function bindUI() {
  $('#theme').addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark'));
  $('#lang').addEventListener('click', () => setLang(state.lang === 'en' ? 'zh' : 'en'));
  $('#speed').addEventListener('input', (e) => { state.speed = Math.pow(2, +e.target.value); $('#speedv').textContent = state.speed.toFixed(2) + '×'; });
  $('#pause').addEventListener('click', () => { state.userPaused = !state.userPaused; state.paused = state.userPaused; $('#pause').textContent = state.paused ? '▶' : '❚❚'; });
  $('#reseed').addEventListener('click', () => state.ctrl?.reseed());
  $('#hide').addEventListener('click', toggleUI);
  $('#card-toggle').addEventListener('click', () => document.body.classList.toggle('card-collapsed'));
  window.addEventListener('hashchange', () => mount(location.hash.slice(1)));
  window.addEventListener('resize', () => state.ctrl?.resize());
  document.addEventListener('visibilitychange', () => { state.paused = document.hidden || !!state.userPaused; $('#pause').textContent = state.paused ? '▶' : '❚❚'; });
  if (MOBILE.matches) document.body.classList.add('card-collapsed');
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return;
    const k = e.key.toLowerCase();
    if (k >= '1' && k <= '6') location.hash = SIMS[+k - 1].id;
    else if (k === 'h') toggleUI();
    else if (k === 'r') state.ctrl?.reseed();
    else if (k === ' ') { e.preventDefault(); $('#pause').click(); }
    else if (k === 't') setTheme(state.theme === 'dark' ? 'light' : 'dark');
    else if (k === 'l') setLang(state.lang === 'en' ? 'zh' : 'en');
  });
  const overUI = (e) => e.target instanceof Element && e.target.closest('.ui');
  const pointer = (e, down) => {
    if (!state.ctrl) return;
    if (overUI(e)) { state.ctrl.pointer({ x: -1, y: -1, down: false, leave: true }); return; } // sims must treat leave as "no pointer"
    state.ctrl.pointer({ x: e.clientX, y: e.clientY, down, leave: false });
  };
  window.addEventListener('pointermove', (e) => pointer(e, e.buttons > 0));
  window.addEventListener('pointerdown', (e) => pointer(e, true));
  // pointerleave does not bubble; listen on the root element (window never sees it in the bubble phase)
  document.documentElement.addEventListener('pointerleave', () => state.ctrl?.pointer({ x: -1, y: -1, down: false, leave: true }));
  if (state.reduced) {
    $('#motion').hidden = false;
    $('#motion').addEventListener('click', () => { state.forceMotion = !state.forceMotion; $('#motion').setAttribute('aria-pressed', state.forceMotion); });
  }
}

function toggleUI() {
  state.hidden = !state.hidden;
  document.body.classList.toggle('ui-hidden', state.hidden);
}

setTheme(state.theme);
bindUI();
setLang(state.lang);
mount(location.hash.slice(1) || SIMS[0].id);
state.raf = requestAnimationFrame(loop);
window.__ca = state; // debug hook: drive frames by hand when rAF is throttled (e.g. hidden tab)
