/**
 * Node server for hosts that run a long-lived process (e.g. a Render Web Service).
 * Serves the built site from ./dist and handles POST /api/contact with the same handler
 * the Cloudflare Worker uses (worker/contact.ts). Needs Node >= 22.18 (native TypeScript
 * type stripping). Run `npm run build` first, then `npm start`.
 *
 * Behaviour matches the Cloudflare deployment: the security and caching headers come from the
 * same generated dist/_headers file, `.html` and trailing-slash URLs redirect to the
 * extensionless canonical URL, and text responses are compressed.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { brotliCompressSync, gzipSync, constants as zc } from 'node:zlib';
import { handleContactRequest } from './worker/contact.ts';

const DIST = resolve(process.cwd(), 'dist');
const PORT = Number(process.env.PORT) || 10000;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4', '.webm': 'video/webm', '.avif': 'image/avif',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.svg', '.webmanifest']);

const env = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
  CONTACT_TO: process.env.CONTACT_TO,
  CONTACT_FROM: process.env.CONTACT_FROM,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  // Local testing only (see scripts/mock-resend.mjs); never set in production.
  RESEND_API_URL: process.env.RESEND_API_URL,
  TURNSTILE_VERIFY_URL: process.env.TURNSTILE_VERIFY_URL,
};

/* ---------------------------------------------------------------- _headers */

/** Parses the Cloudflare `_headers` format: a URL pattern line, then indented `Name: value` lines. */
function loadHeaderRules(file) {
  if (!existsSync(file)) return [];
  const rules = [];
  let current = null;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const pattern = line.trim();
      const re = new RegExp('^' + pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:[A-Za-z]\w*/g, '[^/]+')).join('.*') + '$');
      current = { re, headers: [] };
      rules.push(current);
    } else if (current) {
      const i = line.indexOf(':');
      if (i > 0) current.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    }
  }
  return rules;
}
const headerRules = loadHeaderRules(join(DIST, '_headers'));

function headersFor(pathname) {
  const out = {};
  for (const rule of headerRules) {
    if (!rule.re.test(pathname)) continue;
    for (const [k, v] of rule.headers) {
      const key = k.toLowerCase();
      out[key] = out[key] ? `${out[key]}, ${v}` : v;
    }
  }
  return out;
}

/* ------------------------------------------------------------------- files */

async function resolveFile(pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch { return null; }
  if (p.includes('\0')) return null;
  const clean = p === '/' ? '/index' : p;
  const base = resolve(join(DIST, clean));
  if (base !== DIST && !base.startsWith(DIST + sep)) return null; // path traversal guard
  if (base.endsWith(`${sep}_headers`)) return null; // config file, never served
  for (const f of [base, base + '.html', join(base, 'index.html')]) {
    try { if ((await stat(f)).isFile()) return f; } catch { /* try next */ }
  }
  return null;
}

/* Built files never change while the process runs, so compressed copies are cached. */
const cache = new Map();
async function load(file) {
  let entry = cache.get(file);
  if (!entry) {
    const raw = await readFile(file);
    const ext = extname(file);
    entry = { raw, etag: `"${createHash('sha1').update(raw).digest('base64url').slice(0, 27)}"` };
    if (COMPRESSIBLE.has(ext) && raw.length > 1024) {
      entry.br = brotliCompressSync(raw, { params: { [zc.BROTLI_PARAM_QUALITY]: 9 } });
      entry.gzip = gzipSync(raw, { level: 9 });
    }
    cache.set(file, entry);
  }
  return entry;
}

/* ---------------------------------------------------------------------- api */

async function readBody(req, limit = 25_000) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) break; chunks.push(c); }
  return Buffer.concat(chunks);
}

/* The contact handler rate-limits by client IP. Proxies append to X-Forwarded-For, so the
   right-most entry is the one added by the host's own proxy; earlier entries are client-supplied
   and must not be trusted (they would let anyone dodge the limit). */
function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return fwd.at(-1) || req.socket.remoteAddress || 'unknown';
}

async function handleApi(req, res, url) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  headers.set('CF-Connecting-IP', clientIp(req));
  const body = req.method === 'POST' ? await readBody(req) : undefined;
  const request = new Request(url, { method: req.method, headers, body });
  const response = url.pathname === '/api/contact'
    ? await handleContactRequest(request, env)
    : new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

/* ------------------------------------------------------------------ server */

const server = createServer(async (req, res) => {
  try {
    const proto = String(req.headers['x-forwarded-proto'] ?? 'http').split(',')[0].trim();
    const url = new URL(req.url ?? '/', `${proto}://${req.headers.host ?? 'localhost'}`);

    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end();
    }

    // One URL per page: /index.html, /about.html and /about/ redirect permanently to /about.
    const canonical = url.pathname.replace(/\/index(\.html)?$/, '/').replace(/\.html$/, '').replace(/(.)\/+$/, '$1');
    if (canonical !== url.pathname) {
      res.writeHead(301, { Location: canonical + url.search, 'Cache-Control': 'public, max-age=3600' });
      return res.end();
    }

    let file = await resolveFile(url.pathname);
    let status = 200;
    if (!file) { file = join(DIST, '404.html'); status = 404; }
    const ext = extname(file);
    const entry = await load(file);

    const headers = {
      'content-type': TYPES[ext] ?? 'application/octet-stream',
      'cache-control': ext === '.html' ? 'public, max-age=0, must-revalidate' : 'public, max-age=3600',
      etag: entry.etag,
      vary: 'Accept-Encoding',
      ...headersFor(status === 404 ? '/404' : url.pathname),
    };

    if (status === 200 && req.headers['if-none-match'] === entry.etag) {
      res.writeHead(304, headers); return res.end();
    }

    const accept = String(req.headers['accept-encoding'] ?? '');
    let body = entry.raw;
    if (entry.br && /\bbr\b/.test(accept)) { body = entry.br; headers['content-encoding'] = 'br'; }
    else if (entry.gzip && /\bgzip\b/.test(accept)) { body = entry.gzip; headers['content-encoding'] = 'gzip'; }
    headers['content-length'] = String(body.length);

    res.writeHead(status, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (e) {
    console.error('server error', e);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`geper-website listening on :${PORT}`));

// Let in-flight requests finish when the host stops or replaces the instance.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8_000).unref();
  });
}
