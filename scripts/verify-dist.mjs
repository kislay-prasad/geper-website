/**
 * verify-dist.mjs — fails the build if the built site contains:
 *   1. Temporary Stitch/prototype dependencies (CDN Tailwind, googleusercontent images, template tokens, Google icon font)
 *   2. Placeholder/broken navigation (href="#" in nav/footer, links to pages that were not built)
 *   3. Missing local assets referenced by <img>, <script>, <link>
 *   4. Unsupported claims that must never appear in production copy (rules in claims.ts), in page text
 *      and in SOMA's lazy-loaded FAQ data (with only GEPER's approved terminology set aside there)
 *   5. Canonical URLs that are not the served URL, missing social image, sitemap, robots.txt,
 *      favicon.ico, or a dist/_headers without a Content-Security-Policy
 * Run automatically by `npm run build`.
 */
import { scanClaims, SOMA_APPROVED_TERMS } from './claims.ts';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, resolve } from 'node:path';

const DIST = resolve(process.cwd(), 'dist');
if (!existsSync(DIST)) { console.error('verify-dist: dist/ not found — run astro build first'); process.exit(1); }

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(DIST);
const html = files.filter((f) => extname(f) === '.html');
const textFiles = files.filter((f) => ['.html', '.css', '.js', '.mjs', '.txt', '.xml'].includes(extname(f)));

const failures = [];
const fail = (file, msg) => failures.push(`${relative(DIST, file)}: ${msg}`);

/* 1 ─ Stitch / prototype remnants (any text asset) */
const FORBIDDEN_SOURCES = [
  [/cdn\.tailwindcss\.com/i, 'Tailwind CDN script'],
  [/googleusercontent\.com/i, 'hotlinked Stitch image (googleusercontent)'],
  [/\{\{DATA:[A-Z_]+:[A-Z0-9_]+\}\}/, 'Stitch template token'],
  [/STITCH_THREEJS_(START|END)/, 'Stitch Three.js marker'],
  [/Material\+Symbols/i, 'Material Symbols icon font'],
  [/fonts\.googleapis\.com/i, 'Google Fonts request (fonts must be self-hosted)'],
  [/ajax\.googleapis\.com\/ajax\/libs\/threejs/i, 'Three.js from CDN'],
  [/aida-public/i, 'Stitch asset path'],
];
for (const f of textFiles) {
  const s = readFileSync(f, 'utf8');
  for (const [re, label] of FORBIDDEN_SOURCES) if (re.test(s)) fail(f, `forbidden: ${label}`);
}

/* 2 ─ Claims that must not exist in production copy (HTML text only; rules live in claims.ts) */
const textOf = (h) => h
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;/g, ' ')
  .replace(/\s+/g, ' ');
for (const f of html) {
  // Pages are checked against every rule, with no approved-terminology exceptions.
  for (const hit of scanClaims(textOf(readFileSync(f, 'utf8')))) fail(f, `forbidden claim: ${hit.label} — "${hit.match}"`);
}

/* 2b ─ SOMA's FAQ. Its text is delivered in a lazy-loaded script, so the page scan above never sees
   it; the same rules are applied to the data it is built from, with only GEPER's approved terminology
   set aside (SOMA_APPROVED_TERMS in claims.ts). What ships is then checked against what was checked. */
{
  const { somaEntries, somaTopics, somaCopy } = await import('../src/data/soma-faq.ts');
  const visible = [];
  for (const e of somaEntries) {
    visible.push([`SOMA ${e.id} (question)`, e.question]);
    visible.push([`SOMA ${e.id} (answer)`, e.answer.join(' ')]);
    for (const l of e.links ?? []) visible.push([`SOMA ${e.id} (link)`, l.label]);
  }
  for (const t of somaTopics) visible.push([`SOMA topic ${t.id}`, `${t.title} ${t.hint}`]);
  for (const [k, v] of Object.entries(somaCopy)) visible.push([`SOMA copy.${k}`, typeof v === 'function' ? v('Topic') : [].concat(v).join(' ')]);
  for (const [where, text] of visible) {
    for (const hit of scanClaims(text, { approvedTerms: SOMA_APPROVED_TERMS })) failures.push(`${where}: forbidden claim: ${hit.label} — "${hit.match}"`);
  }
  for (const e of somaEntries) {
    if (e.draft) failures.push(`SOMA ${e.id}: still marked draft`);
  }
  const chunks = files.filter((f) => /soma-panel\.[^/\\]+\.js$/.test(f));
  if (chunks.length !== 1) failures.push(`SOMA: expected one built notebook chunk, found ${chunks.length}`);
  else {
    const built = readFileSync(chunks[0], 'utf8');
    // Compare the opening ASCII run of each answer: the build may escape the typographic apostrophes.
    for (const e of somaEntries) {
      const probe = e.answer[0].match(/^[\x20-\x7e]+/)[0].slice(0, 40);
      if (!built.includes(probe)) failures.push(`SOMA ${e.id}: the built notebook does not contain the answer that was validated`);
    }
  }
  console.log(`verify-dist: SOMA FAQ checked — ${somaEntries.length} entries, ${visible.length} visible strings, approved terms: ${SOMA_APPROVED_TERMS.map((t) => t.term).join(', ')}`);
}

/* 3 ─ Links and assets */
const builtRoutes = new Set(html.map((f) => '/' + relative(DIST, f).replace(/\\/g, '/').replace(/index\.html$/, '').replace(/\.html$/, '')).map((r) => (r === '/' ? '/' : r.replace(/\/$/, ''))));
const assetPaths = new Set(files.map((f) => '/' + relative(DIST, f).replace(/\\/g, '/')));

for (const f of html) {
  const s = readFileSync(f, 'utf8');
  // href="#" is only tolerated on the form's fallback link, which is set by script before it is shown.
  for (const m of s.matchAll(/<a\b[^>]*href="#"[^>]*>/g)) {
    if (!/data-fallback-link/.test(m[0])) fail(f, `placeholder link: ${m[0].slice(0, 80)}`);
  }
  for (const m of s.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const url = m[1];
    if (/^(https?:|mailto:|tel:|#|data:)/.test(url)) continue;
    const [pathOnly] = url.split(/[?#]/);
    if (!pathOnly) continue; // pure "?topic=..."
    const clean = pathOnly.replace(/\/$/, '') || '/';
    if (/\.[a-z0-9]+$/i.test(clean)) {
      if (!assetPaths.has(clean)) fail(f, `missing asset: ${url}`);
    } else if (!builtRoutes.has(clean)) {
      fail(f, `broken internal link: ${url}`);
    }
  }
  // srcset
  for (const m of s.matchAll(/srcset="([^"]+)"/g)) {
    for (const part of m[1].split(',')) { const p = part.trim().split(/\s+/)[0]; if (p && !assetPaths.has(p)) fail(f, `missing srcset asset: ${p}`); }
  }
}

/* 4 ─ Required routes */
for (const r of ['/', '/technology', '/research', '/platform', '/about', '/contact', '/privacy', '/terms', '/404', '/message-sent']) {
  if (!builtRoutes.has(r)) failures.push(`required route not built: ${r}`);
}

/* 5 ─ Canonical URLs, social metadata and generated files */
for (const f of html) {
  const s = readFileSync(f, 'utf8');
  const rel = relative(DIST, f).replace(/\\/g, '/');
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(s)?.[1];
  if (rel === '404.html') {
    if (canonical) fail(f, 'the 404 page must not declare a canonical URL');
  } else if (!canonical) {
    fail(f, 'missing canonical URL');
  } else if (/\.html$|\/index$/.test(canonical)) {
    fail(f, `canonical URL is not the URL the page is served at: ${canonical}`);
  }
  const ogImage = /<meta property="og:image" content="([^"]+)"/.exec(s)?.[1];
  if (!ogImage) fail(f, 'missing og:image');
  else if (!assetPaths.has(new URL(ogImage).pathname)) fail(f, `og:image file not built: ${ogImage}`);
}
for (const required of ['/sitemap.xml', '/robots.txt', '/favicon.ico']) {
  if (!assetPaths.has(required)) failures.push(`required file not built: ${required}`);
}
const headersFile = join(DIST, '_headers');
if (!existsSync(headersFile) || !/Content-Security-Policy:/.test(readFileSync(headersFile, 'utf8'))) {
  failures.push('dist/_headers missing or has no Content-Security-Policy (scripts/gen-headers.mjs must run first)');
}

if (failures.length) {
  console.error(`\nverify-dist: ${failures.length} problem(s)\n` + failures.map((x) => '  ✗ ' + x).join('\n') + '\n');
  process.exit(1);
}
console.log(`verify-dist: OK — ${html.length} pages, ${files.length} files, no Stitch remnants, no forbidden claims, no broken links, canonical URLs and headers in place.`);
