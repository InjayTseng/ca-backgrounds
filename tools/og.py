"""Render og.png — the social-card image — as a rule 90 spacetime diagram with the
wordmark set on top of it.

Rule 90 from a single seed grows the Sierpinski gasket: the most legible CA
picture there is at social-card size, and one of the rules tab 01 offers. Fully
deterministic, so re-running reproduces the committed file. Colours are the dark
palette from src/theme.js; if that palette moves, update BG/ACCENT/COOL/INK/MUTED
and re-run.

Fonts: the site's own faces (Fraunces, IBM Plex Mono). The TTFs are fetched into
tools/.cache/ on first run — the web build ships woff2, which Pillow cannot read.

    nca/.venv/bin/python tools/og.py
"""
import os
import urllib.request

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H, CELL = 1200, 630, 6
BG, ACCENT, COOL = (0x07, 0x0B, 0x10), (0x35, 0xE0, 0xA0), (0x48, 0xB6, 0xFF)
INK, MUTED = (0xD7, 0xE6, 0xE2), (0x8F, 0xA3, 0xB0)
RULE = 90

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
GF = "https://raw.githubusercontent.com/google/fonts/main/ofl/"
FONTS = {
    "Fraunces.ttf": GF + "fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf",
    "Fraunces-Italic.ttf": GF + "fraunces/Fraunces-Italic%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf",
    "IBMPlexMono-Regular.ttf": GF + "ibmplexmono/IBMPlexMono-Regular.ttf",
}


def font(name, size, **axes):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        urllib.request.urlretrieve(FONTS[name], path)
    f = ImageFont.truetype(path, size)
    if axes:
        names = [a["name"].decode() if isinstance(a["name"], bytes) else a["name"] for a in f.get_variation_axes()]
        f.set_variation_by_axes([axes.get(n, a["default"]) for n, a in zip(names, f.get_variation_axes())])
    return f


cols, rows = W // CELL, H // CELL
# Compute on a grid wide enough that the gasket's arms never wrap, then crop the
# centre: a wrapped arm would fold back and break the self-similarity.
full = 2 * rows + cols
row = np.zeros(full, dtype=np.uint8)
row[full // 2] = 1

grid = np.zeros((rows, full), dtype=np.uint8)
for y in range(rows):
    grid[y] = row
    left, right = np.roll(row, 1), np.roll(row, -1)
    row = (RULE >> ((left << 2) | (row << 1) | right)) & 1
grid = grid[:, (full - cols) // 2:(full - cols) // 2 + cols]

# Live cells ramp accent -> cool down the page; dead cells stay background.
ramp = np.linspace(0, 1, rows)[:, None, None]
live = np.array(ACCENT) * (1 - ramp) + np.array(COOL) * ramp
img = np.where(grid[:, :, None] == 1, live, np.array(BG))

# Fade the oldest generations back into the background so the fresh edge leads.
# The floor stays high enough that the top of the gasket survives feed-size downscaling.
depth = np.clip(np.linspace(0.55, 1.0, rows) ** 0.8, 0, 1)[:, None, None]
img = np.array(BG) + (img - np.array(BG)) * depth

# Vignette: pull the corners down so the centre carries the eye.
yy, xx = np.mgrid[0:rows, 0:cols]
r = np.hypot((xx / cols - 0.5) * 2, (yy / rows - 0.5) * 2) / np.sqrt(2)
vig = np.clip(1.0 - 0.45 * r**1.6, 0, 1)[:, :, None]
img = np.array(BG) + (img - np.array(BG)) * vig

out = Image.fromarray(img.clip(0, 255).astype(np.uint8)).resize((W, H), Image.NEAREST)

# A scrim rising from the bottom edge so the wordmark reads over the fractal.
scrim = np.zeros((H, W, 4), dtype=np.uint8)
scrim[:, :, :3] = BG
t = np.clip((np.arange(H) - H * 0.48) / (H * 0.52), 0, 1) ** 1.4
scrim[:, :, 3] = (t * 235)[:, None]
out = Image.alpha_composite(out.convert("RGBA"), Image.fromarray(scrim, "RGBA")).convert("RGB")

# Wordmark: CA/BG in Fraunces, the slash in the accent and italic, as on the page;
# the tagline underneath in Plex Mono.
draw = ImageDraw.Draw(out)
x, base = 64, H - 150
mark = font("Fraunces.ttf", 118, opsz=144, wght=600)
slash = font("Fraunces-Italic.ttf", 118, opsz=144, wght=300)
for text, f, colour in (("CA", mark, INK), ("/", slash, ACCENT), ("BG", mark, INK)):
    draw.text((x, base), text, font=f, fill=colour, anchor="ls")
    x += draw.textlength(text, font=f) + (2 if text == "/" else 0)
draw.text((66, base + 58), "Living Backgrounds", font=font("Fraunces-Italic.ttf", 40, opsz=48, wght=300), fill=INK, anchor="ls")
draw.text((66, base + 102), "six families of cellular automata as living web backgrounds  ·  ca.davidyc.com",
          font=font("IBMPlexMono-Regular.ttf", 22), fill=MUTED, anchor="ls")

out.save(os.path.join(HERE, "..", "og.png"), optimize=True)
print(f"og.png {out.size[0]}x{out.size[1]}")
