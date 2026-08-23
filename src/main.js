import { THEMES } from './theme.js';
import rule1d from './sims/rule1d.js';
import life from './sims/life.js';
import cyclic from './sims/cyclic.js';
import boids from './sims/boids.js';
import lenia from './sims/lenia.js';
import nca from './sims/nca.js';

const SIMS = [rule1d, life, cyclic, boids, lenia, nca];
const FPS = 30;
const $ = (s, r = document) => r.querySelector(s);

const state = {
  sim: null, ctrl: null, canvas: null, theme: localStorage.getItem('ca.theme') || 'dark',
  speed: 1, paused: false, hidden: false, raf: 0, last: 0, fpsAcc: 0, fpsN: 0, fps: 0, lastStats: 0,
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
};

function setTheme(name) {
  state.theme = name;
  document.documentElement.dataset.theme = name;
  localStorage.setItem('ca.theme', name);
  state.ctrl?.setTheme(THEMES[name]);
  $('#theme').textContent = name === 'dark' ? '☾ dark' : '☀ light';
}

function renderTabs() {
  const nav = $('#tabs');
  nav.innerHTML = SIMS.map((s) => `
    <button class="tab" data-id="${s.id}" role="tab" aria-selected="${state.sim?.id === s.id}">
      <span class="num">${s.num}</span>
      <span class="name">${s.title}</span>
      <span class="week">${s.week}</span>
    </button>`).join('');
  nav.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => (location.hash = b.dataset.id)));
}

function renderCard(sim, error) {
  const c = sim.concept;
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
    <p class="tagline">${sim.tag}</p>
    ${error ? `<p class="error">${error}</p>` : ''}
    <dl class="spec">
      <dt>規則</dt><dd>${c.rule}</dd>
      <dt>為何當背景</dt><dd>${c.why}</dd>
      <dt>會不會死</dt><dd>${c.dies}</dd>
      <dt>成本</dt><dd>${c.cost}</dd>
      <dt>互動</dt><dd>${c.interact}</dd>
    </dl>
    ${sim.id === 'nca' && !error ? `<img class="target" src="nca/target.png" alt="training target" title="訓練目標（64×64）">` : ''}
    <div class="opts">${opts}</div>
    <ul class="refs">${c.refs.map((r) => `<li>${r}</li>`).join('')}</ul>
    <div class="stats" id="stats"></div>`;
  $('#card').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
    sim.options[b.dataset.key].value = b.dataset.val;
    state.ctrl?.setOption(b.dataset.key, b.dataset.val);
    b.parentElement.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', x === b));
  }));
}

async function mount(id) {
  const sim = SIMS.find((s) => s.id === id) || SIMS[0];
  if (state.ctrl) { state.ctrl.destroy(); state.ctrl = null; }
  state.canvas?.remove();
  state.sim = sim;
  renderTabs();
  const canvas = document.createElement('canvas');
  canvas.className = 'stage';
  $('#stage').appendChild(canvas);
  state.canvas = canvas;
  document.title = `${sim.num} ${sim.title} — 會動的背景標本室`;
  let error = null;
  try {
    const extra = sim.load ? await sim.load() : undefined;
    if (state.sim !== sim) return; // switched while loading
    state.ctrl = sim.create(canvas, { theme: THEMES[state.theme] }, extra);
    if (state.reduced) { state.ctrl.frame(40); } // settle into one frame, then stay paused
  } catch (e) {
    console.error(e); error = e.message;
    canvas.getContext('2d')?.clearRect(0, 0, 1, 1);
  }
  renderCard(sim, error);
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
  $('#speed').addEventListener('input', (e) => { state.speed = Math.pow(2, +e.target.value); $('#speedv').textContent = state.speed.toFixed(2) + '×'; });
  $('#pause').addEventListener('click', () => { state.userPaused = !state.userPaused; state.paused = state.userPaused; $('#pause').textContent = state.paused ? '▶' : '❚❚'; });
  $('#reseed').addEventListener('click', () => state.ctrl?.reseed());
  $('#hide').addEventListener('click', toggleUI);
  $('#card-toggle').addEventListener('click', () => document.body.classList.toggle('card-collapsed'));
  window.addEventListener('hashchange', () => mount(location.hash.slice(1)));
  window.addEventListener('resize', () => state.ctrl?.resize());
  document.addEventListener('visibilitychange', () => { state.paused = document.hidden || !!state.userPaused; });
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, button, textarea')) return;
    const k = e.key.toLowerCase();
    if (k >= '1' && k <= '6') location.hash = SIMS[+k - 1].id;
    else if (k === 'h') toggleUI();
    else if (k === 'r') state.ctrl?.reseed();
    else if (k === ' ') { e.preventDefault(); $('#pause').click(); }
    else if (k === 't') setTheme(state.theme === 'dark' ? 'light' : 'dark');
  });
  const pointer = (e, down, leave = false) => {
    if (!state.ctrl) return;
    if (e.target.closest('.ui')) { state.ctrl.pointer({ x: -1e4, y: -1e4, down: false, leave: true }); return; }
    state.ctrl.pointer({ x: e.clientX, y: e.clientY, down, leave });
  };
  window.addEventListener('pointermove', (e) => pointer(e, e.buttons > 0));
  window.addEventListener('pointerdown', (e) => pointer(e, true));
  window.addEventListener('pointerleave', (e) => pointer(e, false, true));
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
mount(location.hash.slice(1) || SIMS[0].id);
state.raf = requestAnimationFrame(loop);
window.__ca = state; // debug hook: drive frames by hand when rAF is throttled (e.g. hidden tab)
