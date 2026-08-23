# ca-backgrounds — 會動的背景標本室

六種「細胞自動機家族」的網頁背景動畫，放在同一頁的六個分頁裡，每個分頁附一張理念卡：
規則是什麼、為什麼適合當背景、會不會死、成本、對應 12 週學程的哪一週、滑鼠怎麼互動。

| # | 分頁 | 技術 | 週次 | 會不會死 |
|---|---|---|---|---|
| 01 | Rule 110（30/90/184/54/73 可切） | Canvas 2D，每幀推一列 | W1 | 不會 |
| 02 | Life + trails（Life / HighLife / Day & Night） | Canvas 2D + 拖尾 + 滑翔子雨 | W2 | 會，有 watchdog |
| 03 | Cyclic CA（Spirals 3/5/8/M、CCA 1/1/14/N、Turbulent、313） | Canvas 2D | 加映 | 不會 |
| 04 | Boids | Canvas 2D，空間雜湊 | W7 | 不會 |
| 05 | Lenia（Orbium） | WebGL2 fragment shader，R=13 環形 kernel | W11 | 會，watchdog 補貨／重播 |
| 06 | Neural CA（自癒蜥蜴） | WebGL2 MRT，PyTorch 訓出的 8k 參數權重 | W9–10 | 不會 |

## 跑起來

```sh
npm run serve          # python3 -m http.server 8787
open http://localhost:8787/
```

零 build、零 npm 依賴。ES modules 需要 http，不能直接開檔案。

鍵盤：`1–6` 切分頁、`H` 藏 UI（只剩背景）、`R` 重播種、`Space` 暫停、`T` 切主題。

## 結構

```
index.html / styles.css      殼：分頁、理念卡、工具列、主題 token
src/main.js                  路由（hash）、30fps 迴圈、visibility / reduced-motion、滑鼠、UI
src/theme.js                 深／淺兩組調色
src/gl.js                    WebGL2 小工具（program、float texture、FBO、全螢幕 quad）
src/core/*.js                純函數的 step 核心（可測）：rule1d、life、cyclic、boids
src/sims/*.js                六個 sim 模組，各自實作同一個介面
nca/train.py                 Growing NCA 訓練器（PyTorch，MPS），輸出 nca/weights.json + target.png
test/core.test.mjs           node --test
```

每個 sim 模組 export：

```js
{ id, num, title, week, tag, options?, concept: { rule, why, dies, cost, interact, refs },
  load?(),                       // 非同步前置（NCA 讀權重）
  create(canvas, env, extra) => { frame(mul), resize(), reseed(), setTheme(t), setOption(k, v), pointer(p), stats(), destroy() } }
```

## NCA 權重

`nca/weights.json` 是 `nca/train.py` 訓出來的（6000 iters，M 系列約 20 分鐘）。要換 emoji：

```sh
uv venv nca/.venv -p 3.12 && uv pip install --python nca/.venv/bin/python torch numpy pillow
nca/.venv/bin/python nca/train.py --emoji 🦎 --iters 6000
```

shader 與訓練器共用的契約（channel 順序、perception 排列、alive mask、fire rate）寫在 `train.py` 頂部的 docstring；改一邊要改另一邊。

## 驗證

```sh
npm test                       # 6 個純函數測試（rule 110/30/90、glider、blinker、cyclic、boids）
```

視覺驗證用 Chrome：頁面暴露 `window.__ca`，在分頁為 hidden（rAF 被凍結）時可以手動 `__ca.ctrl.frame(1)` 推進。
2026-08-24 六個分頁都在 Chrome 上截圖確認過：Rule 110 的滑翔子、Life 拖尾、Cyclic 兩種螺旋、Boids 成群、
Lenia 單隻 Orbium 穩定滑 2500 步、NCA 長出 8 隻蜥蜴且擦掉後 300 步內長回來。

## 已知限制

- 分頁在背景時整個迴圈暫停（by design；背景動畫不該在看不見時燒電）。
- Lenia：Orbium 互撞偶爾會爆成全格迷宮，watchdog 每 3 秒查一次總質量，爆了就整格重播；約每 1–2 分鐘一次。Flow Lenia（質量守恆）能根治，未實作。
- Lenia / NCA 需要 WebGL2 + `EXT_color_buffer_float`；沒有的話 Lenia 退到 8-bit（會鈍），NCA 直接報錯。
- NCA 用零邊界訓練，tile 間不互動；把 emoji 放太靠邊會被邊界吃掉。

## 對應的學程

這個 repo 是「細胞自動機 × 複雜系統 12 週學程」的交付物容器：每週的「會動的東西」就是一個分頁。
W1 Rule 110、W2 Life、W7 Boids、W9–10 NCA、W11 Lenia；Cyclic CA 不在學程裡，純粹因為它太適合當背景。
