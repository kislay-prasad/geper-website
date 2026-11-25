/**
 * verify-dist.mjs — fails the build if the built site contains:
 *   1. Temporary Stitch/prototype dependencies (CDN Tailwind, googleusercontent images, template tokens, Google icon font)
 *   2. Placeholder/broken navigation (href="#" in nav/footer, links to pages that were not built)
 *   3. Missing local assets referenced by <img>, <script>, <link>
 *   4. Unsupported claims that must never appear in production copy
 *   5. Canonical URLs that are not the served URL, missing social image, sitemap, robots.txt,
 *      favicon.ico, or a dist/_headers without a Content-Security-Policy
 * Run automatically by `npm run build`.
 */
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

/* 2 ─ Claims that must not exist in production copy (HTML text only) */
const FORBIDDEN_CLAIMS = [
  [/\bHIPAA\b/i, 'HIPAA claim'],
  [/\bGDPR[- ]compliant\b/i, 'GDPR compliance claim'],
  [/\bcompliant\b/i, 'compliance claim'],
  [/\bencrypt(ed|ion)\b/i, 'encryption claim'],
  [/\bGraphQL\b/i, 'API claim (GraphQL)'],
  [/\bRESTful\b/i, 'API claim (RESTful)'],
  [/\b(LIMS|EHR)\b/, 'integration claim (LIMS/EHR)'],
  [/\bpetabyte/i, 'scale claim'],
  [/\bmicrosecond/i, 'latency claim'],
  [/\bproprietary (neural|dataset|data|model|AI)/i, 'proprietary technology/data claim'],
  [/\bprotein folding\b/i, 'protein-folding claim'],
  [/\bclinically validated\b(?!\.| and)/i, 'clinical validation claim (allowed only in negation)'],
  [/\bFDA[- ](approved|cleared)\b/i, 'regulatory claim'],
  [/\bCE[- ]marked\b/i, 'regulatory claim'],
  [/\bcertified medical device\b(?!\.)/i, 'device claim (allowed only in negation)'],
  [/\bcoming soon\b/i, 'vague "coming soon" copy'],
  [/\bavailable\b[^.]{0,60}\bsoon\b/i, 'vague availability-date copy ("available … soon")'],
  [/\bSystems Operational\b/i, 'fake live status'],
  [/\bGlobal (HQ|Headquarters)\b/i, 'fake HQ claim'],
  [/\bwet[- ]lab\b/i, 'wet-lab claim'],
  [/\bsynthetic biology\b/i, 'synthetic-biology claim'],
  [/\b\d{1,3}\s?(of|\/)\s?\d{1,3}\s+(ACMG|criteria)\b/i, 'criterion count'],
  [/\b(AlphaMissense|SpliceBERT|SpliceFormer|HyenaDNA|Enformer|Borzoi|ESM-?2|RNA-FM|MMSplice|Evo ?2)\b/, 'specific model-integration claim'],
  [/\b(gnomAD|ClinVar|ClinGen|dbSNP|UniProt|InterPro|Orphanet|MaveDB)\b/, 'specific database-integration claim'],
  [/\b(FreeBayes|BWA|FASTQ|BAM|CRAM|VCF)\b/, 'pipeline implementation detail'],
  [/\b\d+(\.\d+)?\s?%/, 'percentage figure (benchmark/validation numbers are not allowed)'],
];
// Negation phrases that are explicitly allowed in copy.
const ALLOWED_PHRASES = [
  /not (been )?clinically validated/i,
  /is not a certified medical device/i,
  /not clinically validated/i,
];
const textOf = (h) => h
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;/g, ' ')
  .replace(/\s+/g, ' ');
for (const f of html) {
  let text = textOf(readFileSync(f, 'utf8'));
  for (const a of ALLOWED_PHRASES) text = text.replace(a, ' ');
  for (const [re, label] of FORBIDDEN_CLAIMS) {
    const m = text.match(re);
    if (m) fail(f, `forbidden claim: ${label} — "${m[0]}"`);
  }
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
