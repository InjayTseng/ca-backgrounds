"""Render og.png — the social-card image — as a rule 90 spacetime diagram.

Rule 90 from a single seed grows the Sierpinski gasket: the most legible CA
picture there is at social-card size, and one of the rules tab 01 offers. Fully
deterministic, so re-running reproduces the committed file. Colours are the dark
palette from src/theme.js; if that palette moves, update BG/ACCENT/COOL and re-run.

    nca/.venv/bin/python tools/og.py
"""
import numpy as np
from PIL import Image

W, H, CELL = 1200, 630, 3
BG, ACCENT, COOL = (0x07, 0x0B, 0x10), (0x35, 0xE0, 0xA0), (0x48, 0xB6, 0xFF)
RULE = 90

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
depth = np.clip(np.linspace(0.35, 1.0, rows) ** 0.8, 0, 1)[:, None, None]
img = np.array(BG) + (img - np.array(BG)) * depth

# Vignette: pull the corners down so the centre carries the eye.
yy, xx = np.mgrid[0:rows, 0:cols]
r = np.hypot((xx / cols - 0.5) * 2, (yy / rows - 0.5) * 2) / np.sqrt(2)
vig = np.clip(1.0 - 0.55 * r**1.6, 0, 1)[:, :, None]
img = np.array(BG) + (img - np.array(BG)) * vig

out = Image.fromarray(img.clip(0, 255).astype(np.uint8)).resize((W, H), Image.NEAREST)
out.save("og.png", optimize=True)
print(f"og.png {out.size[0]}x{out.size[1]}")
