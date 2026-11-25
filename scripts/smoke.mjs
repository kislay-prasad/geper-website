/**
 * smoke.mjs — quick post-deploy check of a running site. Sends no email: the only POST is an
 * empty form that the API must reject with 400.
 *   npm run smoke                 → checks https://geper.in
 *   npm run smoke -- http://localhost:8787
 */
const BASE = (process.argv[2] || 'https://geper.in').replace(/\/$/, '');
const failures = [];
const ok = (cond, msg) => { if (!cond) failures.push(msg); console.log(`${cond ? '✓' : '✗'} ${msg}`); };

const get = (path, init) => fetch(BASE + path, { redirect: 'manual', ...init });

for (const path of ['/', '/technology', '/research', '/platform', '/about', '/contact', '/privacy', '/terms']) {
  const res = await get(path);
  const html = await res.text();
  ok(res.status === 200, `${path} returns 200 (got ${res.status})`);
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1] ?? '';
  ok(canonical && !/\.html$/.test(canonical) && new URL(canonical).pathname === path, `${path} canonical is ${canonical || '(none)'}`);
  if (path === '/') {
    ok(!!res.headers.get('content-security-policy'), '/ sends a Content-Security-Policy');
    ok(/max-age=\d+/.test(res.headers.get('strict-transport-security') ?? ''), '/ sends Strict-Transport-Security');
    ok(res.headers.get('x-content-type-options') === 'nosniff', '/ sends X-Content-Type-Options: nosniff');
  }
}

const missing = await get('/this-page-does-not-exist');
ok(missing.status === 404, `unknown page returns 404 (got ${missing.status})`);

for (const path of ['/sitemap.xml', '/robots.txt', '/favicon.ico', '/og/geper-og.png']) {
  const res = await get(path);
  ok(res.status === 200, `${path} returns 200 (got ${res.status})`);
}

const html = await (await get('/')).text();
const asset = /\/_astro\/[^"']+\.(?:js|css)/.exec(html)?.[0];
if (asset) {
  const cc = (await get(asset)).headers.get('cache-control') ?? '';
  ok(/immutable/.test(cc), `${asset} is cached as immutable (${cc})`);
}

const apiGet = await get('/api/contact');
ok(apiGet.status === 405, `GET /api/contact is 405 (got ${apiGet.status})`);
const apiPost = await get('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: '{}' });
const body = await apiPost.json().catch(() => null);
ok(apiPost.status === 400 && !!body?.errors, `POST /api/contact with an empty form is rejected with 400 field errors (got ${apiPost.status})`);

if (failures.length) {
  console.error(`\nsmoke: ${failures.length} check(s) failed against ${BASE}`);
  process.exit(1);
}
console.log(`\nsmoke: all checks passed against ${BASE}`);
