import { THEMES, applyCssTheme } from './theme.js';
import { STR, EN_SIMS } from './i18n.js';
import rule1d from './sims/rule1d.js';
import life from './sims/life.js';
import cyclic from './sims/cyclic.js';
import boids from './sims/boids.js';
import lenia from './sims/lenia.js';
import nca from './sims/nca.js';

const SIMS = [rule1d, life, cyclic, boids, lenia, nca];
const DEFAULT_SIM = 'boids'; // the calmest of the six: what a first visit should open on
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
  speed: 1, paused: false, userPaused: false, errorPaused: false, forceMotion: false,
  raf: 0, last: 0, fpsAcc: 0, fpsN: 0, fps: 0, lastStats: 0,
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
};

function setTheme(name) {
  state.theme = name;
  document.documentElement.dataset.theme = name;
  applyCssTheme(THEMES[name]);
  store.set('ca.theme', name);
  state.ctrl?.setTheme(THEMES[name]);
  $('#theme').textContent = name === 'dark' ? '☾ dark' : '☀ light';
}

const T = () => STR[state.lang];

// English overlays the Chinese originals field by field, so a partial entry in
// EN_SIMS falls back per string instead of dropping the whole object.
function simText(sim) {
  const en = state.lang === 'en' ? EN_SIMS[sim.id] : null;
  const c = sim.concept;
  return {
    tag: en?.tag ?? sim.tag,
    rule: en?.concept?.rule ?? c.rule,
    why: en?.concept?.why ?? c.why,
    dies: en?.concept?.dies ?? c.dies,
    cost: en?.concept?.cost ?? c.cost,
    interact: en?.concept?.interact ?? c.interact,
    refs: en?.concept?.refs ?? c.refs,
    optLabel: (k) => en?.options?.[k]?.label ?? sim.options[k].label,
    optValue: (k, v) => en?.options?.[k]?.labels?.[v] ?? sim.options[k].labels?.[v] ?? v,
  };
}

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
  $('#motion').textContent = T().motion;
  $('#pause').setAttribute('aria-label', T().pause);
  $('.ui-hint').textContent = T().showUI;
  syncCardToggle();
  if (state.sim) renderCard(state.sim, state.lastError);
}

function buildTabs() {
  const nav = $('#tabs');
  nav.innerHTML = SIMS.map((s) => `
    <button class="tab" id="tab-${s.id}" data-id="${s.id}" role="tab" aria-controls="card" aria-selected="false" tabindex="-1">
      <span class="num">${s.num}</span>
      <span class="name">${s.title}</span>
      <span class="engine">${s.engine}</span>
    </button>`).join('');
  nav.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => (location.hash = b.dataset.id)));
  nav.addEventListener('keydown', (e) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, Home: -SIMS.length, End: SIMS.length }[e.key];
    if (!step) return;
    e.preventDefault();
    const from = Math.max(0, SIMS.findIndex((s) => s.id === state.sim?.id));
    const to = Math.min(SIMS.length - 1, Math.max(0, from + step));
    location.hash = SIMS[to].id;
    $(`#tab-${SIMS[to].id}`).focus(); // tabs are never rebuilt, so focus survives the mount
  });
}

// Roving tabindex: only the selected tab is in the tab order (ARIA tabs pattern).
function syncTabs() {
  $('#tabs').querySelectorAll('.tab').forEach((b) => {
    const on = b.dataset.id === state.sim?.id;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
}

function syncCardToggle() {
  const open = !document.body.classList.contains('card-collapsed');
  const btn = $('#card-toggle');
  btn.textContent = `${T().concept} ${open ? '▾' : '▸'}`;
  btn.setAttribute('aria-expanded', String(open));
}

// `err` is { code?, message? }: a code picks a translated, visitor-facing string,
// and anything without one falls back to the raw message.
function renderCard(sim, err) {
  state.lastError = err ?? null;
  const t = T(), x = simText(sim);
  const error = err ? (t[err.code] ?? err.message) : null;
  const opts = Object.entries(sim.options || {}).map(([key, o]) => `
    <div class="opt"><span class="lbl">${x.optLabel(key)}</span>
      ${o.values.map((v) => `<button class="chip" data-key="${key}" data-val="${v}" aria-pressed="${String(v) === String(o.value)}">${x.optValue(key, v)}</button>`).join('')}
    </div>`).join('');
  $('#card').innerHTML = `
    <div class="card-head">
      <span class="num">${sim.num}</span>
      <h1>${sim.title}</h1>
      <span class="engine">${sim.engine}</span>
    </div>
    <p class="tagline">${x.tag}</p>
    ${error ? `<p class="error">${error}</p>` : ''}
    <dl class="spec">
      <dt>${t.rule}</dt><dd>${x.rule}</dd>
      <dt>${t.why}</dt><dd>${x.why}</dd>
      <dt>${t.dies}</dt><dd>${x.dies}</dd>
      <dt>${t.cost}</dt><dd>${x.cost}</dd>
      <dt>${t.interact}</dt><dd>${x.interact}</dd>
    </dl>
    ${sim.id === 'nca' && !error ? `<img class="target" src="nca/target.png" alt="training target" title="${t.target}">` : ''}
    <div class="opts">${opts}</div>
    <ul class="refs">${x.refs.map((r) => `<li>${r}</li>`).join('')}</ul>
    <div class="stats" id="stats"></div>`;
  // collapsed (the mobile default) still has to say the background is interactive
  $('#card-brief').innerHTML = `<p class="tagline">${x.tag}</p><p class="brief-interact">${x.interact}</p>`;
  $('#card').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
    sim.options[b.dataset.key].value = b.dataset.val;
    state.ctrl?.setOption(b.dataset.key, b.dataset.val);
    b.parentElement.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
  }));
}

let mountSeq = 0;
async function mount(id) {
  const my = ++mountSeq;
  const sim = SIMS.find((s) => s.id === id) || SIMS.find((s) => s.id === DEFAULT_SIM);
  if (state.ctrl) { state.ctrl.destroy(); state.ctrl = null; }
  state.canvas?.remove();
  state.sim = sim;
  setPaused({ error: false }); // a previous sim's crash must not freeze this one
  syncTabs();
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
      setPaused({ error: true }); renderCard(sim, { code: 'lostContext' });
    });
    if (state.reduced) for (let i = 0; i < 120; i++) ctrl.frame(1); // settle into something worth looking at, then hold
  } catch (e) {
    console.error(e); error = { code: e.code, message: e.message };
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
    try { state.ctrl.frame(state.speed); }
    catch (e) { console.error(e); setPaused({ error: true }); renderCard(state.sim, { message: e.message }); }
  }
  if (t - state.lastStats > 400 && state.ctrl) {
    state.lastStats = t;
    const el = $('#stats'); if (el) el.textContent = `${state.fps} fps · ${state.ctrl.stats()}${state.paused ? ' · paused' : ''}`;
  }
}

// One writer for `paused`, derived from the three things that can pause the loop.
function setPaused({ user, error } = {}) {
  if (user !== undefined) state.userPaused = user;
  if (error !== undefined) state.errorPaused = error;
  state.paused = state.userPaused || state.errorPaused || document.hidden;
  const btn = $('#pause');
  btn.textContent = state.paused ? '▶' : '❚❚';
  btn.setAttribute('aria-pressed', String(state.paused));
}

function bindUI() {
  $('#theme').addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark'));
  $('#lang').addEventListener('click', () => setLang(state.lang === 'en' ? 'zh' : 'en'));
  $('#speed').addEventListener('input', (e) => { state.speed = Math.pow(2, +e.target.value); $('#speedv').textContent = state.speed.toFixed(2) + '×'; });
  $('#pause').addEventListener('click', () => setPaused({ user: !state.userPaused, error: false }));
  $('#reseed').addEventListener('click', () => state.ctrl?.reseed());
  $('#hide').addEventListener('click', toggleUI);
  $('.ui-hint').addEventListener('click', toggleUI); // without this, hiding the UI is a dead end on touch
  $('#card-toggle').addEventListener('click', () => { document.body.classList.toggle('card-collapsed'); syncCardToggle(); });
  window.addEventListener('hashchange', () => mount(location.hash.slice(1)));
  let resizeT = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => state.ctrl?.resize(), 150); });
  document.addEventListener('visibilitychange', () => setPaused());
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
    $('#motion').addEventListener('click', () => { state.forceMotion = !state.forceMotion; $('#motion').setAttribute('aria-pressed', String(state.forceMotion)); });
  }
}

function toggleUI() {
  document.body.classList.toggle('ui-hidden');
}

setTheme(state.theme);
buildTabs();
bindUI();
setLang(state.lang);
setPaused();
mount(location.hash.slice(1) || DEFAULT_SIM);
state.raf = requestAnimationFrame(loop);
window.__ca = state; // debug hook: drive frames by hand when rAF is throttled (e.g. hidden tab)
