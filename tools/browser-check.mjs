#!/usr/bin/env node
// Browser smoke test over the Chrome DevTools Protocol. Zero dependencies: node's
// built-in fetch + WebSocket, and whatever Chrome is installed.
//
// Loads the page, walks every sim through the hash router, and fails if anything
// reached the console as an error: an uncaught exception, console.error, or a
// resource that 404'd. main.js has no unit tests; this is its safety net.
//
//   node tools/browser-check.mjs                       # all six sims, dark, en
//   node tools/browser-check.mjs --theme light --lang zh --reduced
//   node tools/browser-check.mjs --width 375 --height 667 --shots /tmp/shots
//   node tools/browser-check.mjs --url http://localhost:8790/embed.html --sims '' --eval 'document.querySelector("ca-background").sim'
//
// Options
//   --url URL        page to load               (default http://localhost:8788/)
//   --sims a,b       sims to walk, '' for none  (default all six)
//   --width/--height viewport in CSS px         (default 1280x800)
//   --theme dark|light, --lang en|zh            seeded into localStorage before load
//   --reduced        emulate prefers-reduced-motion: reduce
//   --shots DIR      write DIR/<sim>.png after each sim settles
//   --eval JS        evaluate after each sim (or once, with --sims '') and print the result
//   --settle MS      how long a sim runs before it is inspected (default 1500)
//   --chrome PATH    Chrome binary
//   --warn           also fail on console.warn
//   --flags "..."    extra Chrome flags, e.g. "--disable-3d-apis" to test the no-WebGL path

import { spawn } from 'node:child_process';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = parseArgs(process.argv.slice(2));
const URL_ = args.url ?? 'http://localhost:8788/';
const SIMS = args.sims === undefined ? ['rule1d', 'life', 'cyclic', 'boids', 'lenia', 'nca'] : args.sims.split(',').filter(Boolean);
const W = +(args.width ?? 1280), H = +(args.height ?? 800);
const SETTLE = +(args.settle ?? 1500);
const CHROME = args.chrome ?? process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9222 + Math.floor(Math.random() * 500);

const profile = await mkdtemp(join(tmpdir(), 'ca-check-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', // WebGL2 without a GPU
  `--window-size=${W},${H}`, ...(args.flags ? args.flags.split(' ').filter(Boolean) : []), 'about:blank',
], { stdio: 'ignore' });
process.on('exit', () => { chrome.kill(); rm(profile, { recursive: true, force: true }).catch(() => {}); });

const browserWs = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl, 10000, 'Chrome did not open its DevTools port');
const cdp = await connect(browserWs);
const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
const page = (method, params = {}) => cdp.send(method, params, sessionId);

const problems = [];
cdp.on('Runtime.exceptionThrown', (p) => problems.push(`exception: ${p.exceptionDetails.exception?.description ?? p.exceptionDetails.text}`));
cdp.on('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error' || (args.warn && p.type === 'warning')) problems.push(`console.${p.type}: ${p.args.map(fmt).join(' ')}`);
});
cdp.on('Log.entryAdded', (p) => { if (p.entry.level === 'error') problems.push(`${p.entry.source}: ${p.entry.text} ${p.entry.url ?? ''}`); });

await page('Runtime.enable');
await page('Log.enable');
await page('Page.enable');
await page('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 760 });
if (args.reduced) await page('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
const seed = [];
if (args.theme) seed.push(`localStorage.setItem('ca.theme', ${JSON.stringify(args.theme)})`);
if (args.lang) seed.push(`localStorage.setItem('ca.lang', ${JSON.stringify(args.lang)})`);
if (seed.length) await page('Page.addScriptToEvaluateOnNewDocument', { source: `try { ${seed.join(';')} } catch {}` });

const loaded = new Promise((res) => cdp.once('Page.loadEventFired', res));
await page('Page.navigate', { url: URL_ });
await loaded;

if (args.shots) await mkdir(args.shots, { recursive: true });
const rows = [];
let failed = false;

async function inspect(label) {
  await sleep(SETTLE);
  const info = await evaluate(`(() => {
    const s = window.__ca; if (!s) return { site: false };
    return { site: true, sim: s.sim?.id, mounted: !!s.ctrl, paused: s.paused, error: s.lastError,
             stats: (() => { try { return s.ctrl?.stats(); } catch (e) { return 'stats threw: ' + e.message; } })(),
             card: document.querySelector('#card .error')?.textContent ?? null };
  })()`);
  const extra = args.eval ? await evaluate(args.eval) : undefined;
  if (args.shots) {
    const { data } = await page('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(args.shots, `${label}.png`), Buffer.from(data, 'base64'));
  }
  rows.push({ label, ...info, extra, problems: problems.slice(rowStart) });
  rowStart = problems.length;
}

let rowStart = 0;
if (SIMS.length === 0) {
  await inspect('page');
} else {
  for (const id of SIMS) {
    await evaluate(`location.hash = ${JSON.stringify(id)}`);
    try {
      await waitFor(async () => {
        const ok = await evaluate(`window.__ca?.sim?.id === ${JSON.stringify(id)} && (!!window.__ca.ctrl || !!window.__ca.lastError)`);
        return ok ? true : undefined;
      }, 15000, `${id} never mounted`);
    } catch (e) { problems.push(e.message); }
    await inspect(id);
  }
}

for (const r of rows) {
  const state = r.site === false ? 'no window.__ca' : r.mounted ? 'mounted' : `NOT mounted${r.error ? ` (${r.error.code ?? r.error.message})` : ''}`;
  console.log(`${r.label.padEnd(8)} ${state.padEnd(28)} ${r.stats ?? ''}${r.paused ? ' · paused' : ''}`);
  if (r.card) console.log(`         card error: ${r.card}`);
  if (r.extra !== undefined) console.log(`         eval: ${typeof r.extra === 'string' ? r.extra : JSON.stringify(r.extra)}`);
  for (const p of r.problems) { console.log(`         ✗ ${p}`); failed = true; }
  if (r.site !== false && !r.mounted && SIMS.length) failed = true;
}
console.log(failed ? '\nFAIL' : '\nOK');
process.exit(failed ? 1 : 0);

// ---------------------------------------------------------------------------

async function evaluate(expression) {
  const { result, exceptionDetails } = await page('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (exceptionDetails) throw new Error(`eval failed: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
  return result.value;
}

function fmt(a) { return a.value !== undefined ? String(a.value) : a.description ?? a.type; }

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map(), handlers = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(`${m.error.message} (${m.error.code})`)) : res(m.result);
    } else if (m.method) {
      for (const h of handlers.get(m.method) ?? []) h(m.params);
    }
  };
  return {
    send(method, params = {}, sessionId) {
      const msg = { id: ++id, method, params };
      if (sessionId) msg.sessionId = sessionId;
      return new Promise((res, rej) => { pending.set(msg.id, { res, rej }); ws.send(JSON.stringify(msg)); });
    },
    on(method, h) { handlers.set(method, [...(handlers.get(method) ?? []), h]); },
    once(method, h) { const w = (p) => { handlers.set(method, (handlers.get(method) ?? []).filter((x) => x !== w)); h(p); }; this.on(method, w); },
  };
}

async function waitFor(fn, ms, what) {
  const t0 = Date.now();
  for (;;) {
    try { const v = await fn(); if (v !== undefined) return v; } catch { /* not yet */ }
    if (Date.now() - t0 > ms) throw new Error(what);
    await sleep(100);
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const flag = k === 'reduced' || k === 'warn';
    out[k] = flag ? true : argv[++i] ?? '';
  }
  return out;
}
