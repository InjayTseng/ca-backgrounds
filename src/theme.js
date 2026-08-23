// Shared palettes. Sims read these through env.theme and re-read on setTheme().
export const THEMES = {
  dark: {
    name: 'dark',
    bg: '#0b0d10', bg2: '#11151a', ink: '#e8e3d6', muted: '#7c8592',
    accent: '#e8b04b', cool: '#6fd3e8', warm: '#ff7a59', moss: '#8bc34a', dim: '#252a32',
  },
  light: {
    name: 'light',
    bg: '#f3efe6', bg2: '#e9e3d6', ink: '#1b1a17', muted: '#6b6860',
    accent: '#b8761a', cool: '#1f7a8c', warm: '#c0392b', moss: '#4f7a28', dim: '#d6cfbf',
  },
};

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Pack an [r,g,b] (0..255) into a little-endian ABGR uint32 for Uint32Array ImageData writes.
export function packRGB([r, g, b]) {
  return (255 << 24) | (b << 16) | (g << 8) | r;
}
