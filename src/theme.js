// Shared palettes — the single source of truth for colour in this project.
// Sims read these through env.theme and re-read on setTheme(); the UI shell reads
// them as CSS custom properties, which applyCssTheme() writes. styles.css holds a
// copy of the dark values as a first-paint fallback only.
export const THEMES = {
  dark: {
    name: 'dark',
    bg: '#070b10', bg2: '#0c1219', ink: '#d7e6e2', muted: '#8fa3b0',
    accent: '#35e0a0', cool: '#48b6ff', blue: '#3d7bff', danger: '#ff8080',
    hi: '#eafcff', dim: '#1a2530',
    line: 'rgba(120,224,190,0.16)', panel: 'rgba(7,11,16,0.78)',
  },
  light: {
    name: 'light',
    bg: '#eef4f2', bg2: '#e2ebe8', ink: '#0d1b1a', muted: '#4a5c5b',
    accent: '#0d9e6d', cool: '#0e7490', blue: '#2563eb', danger: '#b42318',
    hi: '#062b33', dim: '#cddbd6',
    line: 'rgba(13,27,26,0.16)', panel: 'rgba(238,244,242,0.85)',
  },
};

const CSS_VARS = ['bg', 'bg2', 'ink', 'muted', 'accent', 'cool', 'blue', 'danger', 'dim', 'line', 'panel'];

export function applyCssTheme(t) {
  const s = document.documentElement.style;
  CSS_VARS.forEach((k) => s.setProperty(`--${k}`, t[k]));
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Canvas fade fills, derived from the palette so they cannot drift from it.
export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Pack an [r,g,b] (0..255) into a little-endian ABGR uint32 for Uint32Array ImageData writes.
export function packRGB([r, g, b]) {
  return (255 << 24) | (b << 16) | (g << 8) | r;
}
