#!/usr/bin/env node
// Static dev server that applies `_headers` the way Cloudflare does, so Cache-Control
// and the CORS rules the element depends on can be checked before a deploy.
// Zero dependencies.
//
//   node tools/serve.mjs            # http://localhost:8788/
//   node tools/serve.mjs 8790 dist  # another port, another directory

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const PORT = +(process.argv[2] ?? 8788);
const ROOT = process.argv[3] ?? '.';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
};

// _headers: blocks of "/path-pattern" followed by indented "Header: value" lines.
// Patterns support a trailing "*" and every matching block applies, later ones last.
const rules = [];
try {
  let cur = null;
  for (const raw of (await readFile(join(ROOT, '_headers'), 'utf8')).split('\n')) {
    const line = raw.replace(/#.*/, '').trimEnd();
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) { cur = { pattern: line.trim(), headers: [] }; rules.push(cur); }
    else if (cur) { const i = line.indexOf(':'); cur.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]); }
  }
} catch { /* no _headers here */ }
const matches = (pattern, path) => pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : pattern === path;

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = join(ROOT, normalize(path));
  try {
    const st = await stat(file);
    if (!st.isFile()) throw new Error('not a file');
    const body = await readFile(file);
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    for (const r of rules) if (matches(r.pattern, path)) for (const [k, v] of r.headers) res.setHeader(k, v);
    res.writeHead(200); res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end(`404 ${path}\n`);
  }
}).listen(PORT, () => console.log(`serving ${ROOT} at http://localhost:${PORT}/  (${rules.length} _headers rules)`));
