# ca-interactive — Living Backgrounds

**Live: https://ca.davidyc.com**

Six families of cellular automata, each running as a full-page web background animation, in one page with six tabs. Every tab ships with a concept card: what the rule is, why it works as a background, whether it dies, what it costs, and how the pointer interacts with it. English / 中文 toggle built in (`L`).

The page opens on **04 Boids** — the calmest of the six — unless the URL carries a hash (`/#lenia`).

Zero build step, zero runtime dependencies, MIT.

| # | Tab | Engine | Dies? |
|---|---|---|---|
| 01 | Rule 110 (switchable 30/90/184/54/73) | Canvas 2D, one row per frame | No |
| 02 | Life + trails (Life / HighLife / Day & Night) | Canvas 2D + decay trails + glider rain | Yes — watchdog |
| 03 | Cyclic CA (Spirals 3/5/8/M, CCA 1/1/14/N, Turbulent, 313) | Canvas 2D | No |
| 04 | Boids | Canvas 2D, spatial hash, reflecting walls | No |
| 05 | Lenia (Orbium) | WebGL2 fragment shader, R=13 ring kernel | Yes — replenish/reseed watchdog |
| 06 | Neural CA (self-healing lizard) | WebGL2 MRT, inference of PyTorch-trained weights | No |

Tabs 01–03 live on a torus; Boids is the exception — the window is a closed tank, so a bird banks away from a wall as it nears it and reflects off the glass if it still arrives.

## Run it

```sh
npm run serve          # python3 -m http.server 8787
open http://localhost:8787/
```

ES modules need http; opening the file directly won't work.

Keyboard: `1–6` switch tabs · `H` hide the UI (background only) · `R` reseed · `Space` pause · `T` theme · `L` language.

## Layout

```
index.html / styles.css      shell: tabs, concept card, toolbar, first-paint token fallback
src/main.js                  hash router, 30fps loop, visibility / reduced-motion, pointer, UI
src/i18n.js                  UI strings (en + zh) + the English overlay for the sim cards
src/theme.js                 dark / light palettes — the source of truth for colour
src/gl.js                    WebGL2 helpers (programs, float textures, FBOs, fullscreen quad)
src/core/*.js                pure, testable step cores: rule1d, life, cyclic, boids
src/sims/*.js                six sim modules implementing one shared interface, plus orbium.js (pattern data)
tools/og.py                  regenerates og.png, the social-card image
_headers                     Cache-Control for the deployed assets
nca/train.py                 Growing-NCA trainer (PyTorch, MPS) -> nca/weights.json + target.png
test/core.test.mjs           node --test
```

Each sim module exports:

```js
{ id, num, title, engine, tag,
  options?: { key: { label, values, labels?, value } },   // label/labels in Chinese; English in EN_SIMS
  concept: { rule, why, dies, cost, interact, refs },     // Chinese; English overlay in EN_SIMS
  load?(),                       // async preload (NCA fetches its weights, once per session)
  create(canvas, env, extra) => { frame(mul), resize(), reseed(), setTheme(t), setOption(k, v), pointer(p), stats(), destroy() } }
```

`main.js` resolves the two languages **field by field**, so a partial `EN_SIMS` entry falls back
per string rather than dropping the whole card. Errors thrown from `load()`/`create()` may carry a
`code` (`noWebGL2`, `noFloat`, `noWeights`) that maps to a translated, visitor-facing message.

## NCA weights

`nca/weights.json` is produced by `nca/train.py` (6000 iters, ~20 min on Apple silicon). To grow a different emoji:

```sh
uv venv nca/.venv -p 3.12 && uv pip install --python nca/.venv/bin/python torch numpy pillow
nca/.venv/bin/python nca/train.py --emoji 🦎 --iters 6000
```

The contract shared between the trainer and the WebGL shader (channel order, perception layout, alive mask, fire rate) is documented in the docstring at the top of `train.py`; change one side and you must change the other.

## Deploy

```sh
npm run deploy         # builds dist/ and deploys via Cloudflare Workers static assets
```

The custom domain is configured in `wrangler.jsonc`; deploying requires a wrangler login on the account that owns the zone.

## Verify

```sh
npm test               # 12 suites over the pure cores, incl. a boids hash-vs-brute-force equivalence test
```

CI runs the same command on every push and pull request (`.github/workflows/test.yml`). Contributions
are welcome: fork, branch, keep `npm test` green, and open a PR describing what changed and why.

Visual verification is manual: the page exposes `window.__ca`, so when the tab is hidden (rAF frozen) you can still drive `__ca.ctrl.frame(1)` by hand. All six tabs were screenshot-verified in Chrome — Rule 110 gliders, Life trails, both cyclic spiral regimes, boids flocking and reflecting off the walls, a lone Orbium stable for 2,500 steps, and the NCA growing eight lizards then healing erased patches within 300 steps — in both themes and both languages.

## Known limits

- The whole loop pauses while the tab is hidden — deliberate; a background should not burn battery unseen.
- Lenia: colliding Orbiums occasionally blow up into a full-grid labyrinth. The watchdog reads total mass every 3 s, replenishes when thin, reseeds when exploded (roughly once every 1–2 minutes). Flow Lenia (mass-conserving) would fix this at the root; not implemented.
- Lenia / NCA need WebGL2 + `EXT_color_buffer_float`; without it Lenia falls back to 8-bit (visibly crunchy) and the NCA refuses to run with a translated explanation. Lenia's downgrade is *not* announced on the card — the only signal is `rgba8` in the stats line.
- The NCA was trained on a 64×64 zero-padded grid; on the page, neighbouring tiles share an open boundary and rely on seed spacing to stay apart. Stable in observation, but out of the training distribution.

## 中文摘要

六種細胞自動機家族做成同一頁六個分頁的網頁背景動畫，每頁附理念卡（規則、為何適合當背景、會不會死、成本、互動）。介面中英雙語（`L` 切換）。零 build、零依賴。預設開在 04 Boids，視窗是一只魚缸——鳥靠近邊界會提前轉開，撞上就反彈。06 的 Neural CA 權重由 `nca/train.py` 在本機訓練（Growing NCA，Mordvintsev 2020），塞進 WebGL2 fragment shader 推論，擦掉會自己長回來。

## License

MIT. The Orbium pattern comes from Bert Chan's Lenia (github.com/Chakazul/Lenia, MIT); source noted in `src/sims/orbium.js`.
