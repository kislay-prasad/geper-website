/**
 * Node server for hosts that run a long-lived process (e.g. a Render Web Service).
 * Serves the built site from ./dist and handles POST /api/contact with the same handler
 * the Cloudflare Worker uses (worker/contact.ts). Needs Node >= 22.18 (native TypeScript
 * type stripping). Run `npm run build` first, then `npm start`.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';
import { handleContactRequest } from './worker/contact.ts';

const DIST = resolve(process.cwd(), 'dist');
const PORT = Number(process.env.PORT) || 10000;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
};

const env = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  CONTACT_TO: process.env.CONTACT_TO,
  CONTACT_FROM: process.env.CONTACT_FROM,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
};

async function readBody(req, limit = 25_000) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) break; chunks.push(c); }
  return Buffer.concat(chunks);
}

async function handleApi(req, res, url) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  // The contact handler reads the client IP from CF-Connecting-IP; behind Render it is X-Forwarded-For.
  const fwd = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown').split(',')[0].trim();
  headers.set('CF-Connecting-IP', fwd);
  const body = req.method === 'POST' ? await readBody(req) : undefined;
  const request = new Request(url, { method: req.method, headers, body });
  const response = url.pathname === '/api/contact'
    ? await handleContactRequest(request, env)
    : new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function resolveFile(pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch { return null; }
  if (p.includes('\0')) return null;
  const clean = p.replace(/\/+$/, '') || '/index';
  const base = resolve(join(DIST, clean === '/' ? '/index' : clean));
  if (base !== DIST && !base.startsWith(DIST + sep)) return null; // path traversal guard
  for (const f of [base, base + '.html', join(base, 'index.html')]) {
    try { if ((await stat(f)).isFile()) return f; } catch { /* try next */ }
  }
  return null;
}

createServer(async (req, res) => {
  try {
    const proto = String(req.headers['x-forwarded-proto'] ?? 'http').split(',')[0];
    const url = new URL(req.url ?? '/', `${proto}://${req.headers.host ?? 'localhost'}`);

    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end();
    }

    let file = await resolveFile(url.pathname);
    let status = 200;
    if (!file) { file = join(DIST, '404.html'); status = 404; }
    const data = await readFile(file);
    const ext = extname(file);
    res.writeHead(status, {
      'Content-Type': TYPES[ext] ?? 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (e) {
    console.error('server error', e);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
}).listen(PORT, '0.0.0.0', () => console.log(`geper-website listening on :${PORT}`));
