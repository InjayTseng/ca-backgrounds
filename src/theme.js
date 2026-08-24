// Shared palettes. Sims read these through env.theme and re-read on setTheme().
export const THEMES = {
  dark: {
    name: 'dark',
    bg: '#070b10', bg2: '#0c1219', ink: '#d7e6e2', muted: '#6e8290',
    accent: '#35e0a0', cool: '#48b6ff', warm: '#3d7bff', moss: '#8bc34a', dim: '#1a2530',
  },
  light: {
    name: 'light',
    bg: '#eef4f2', bg2: '#e2ebe8', ink: '#0d1b1a', muted: '#5c6f6e',
    accent: '#0d9e6d', cool: '#0e7490', warm: '#2563eb', moss: '#4f7a28', dim: '#cddbd6',
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
