/**
 * Cloudflare Worker handler: POST /api/contact (routed from worker/index.ts; also used by server.mjs)
 *
 * Validates the contact form, checks Turnstile, then asks Resend to email it to GEPER.
 * Success is only reported when Resend accepts the message and returns an id.
 *
 * Two request shapes are accepted:
 *   - application/json from the enhanced form (fetch): answered with JSON, see README.
 *   - application/x-www-form-urlencoded from a native form post (JavaScript off or failed):
 *     answered with a plain HTML page, or a 303 to /message-sent on success. Nothing is
 *     ever put in a URL.
 *
 * Environment (Worker → Settings → Variables and Secrets; locally .dev.vars):
 *   RESEND_API_KEY       (secret, required)
 *   TURNSTILE_SECRET_KEY (secret, recommended; when set, every submission needs a valid token)
 *   CONTACT_TO           (optional, default contact@geper.in)
 *   CONTACT_FROM         (optional, default "GEPER Website <onboarding@resend.dev>";
 *                         configure a verified notify.geper.in sender for production)
 *   ALLOWED_ORIGINS      (optional, comma-separated origins; same-origin is always allowed)
 */

export interface Env {
  RESEND_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  CONTACT_TO?: string;
  CONTACT_FROM?: string;
  ALLOWED_ORIGINS?: string;
  /** Local testing only: point at a mock Resend server. Leave unset in production. */
  RESEND_API_URL?: string;
  /** Local testing only: point at a mock Turnstile siteverify endpoint. Leave unset in production. */
  TURNSTILE_VERIFY_URL?: string;
}

const DEFAULT_TO = 'contact@geper.in';
const DEFAULT_FROM = 'GEPER Website <onboarding@resend.dev>';
const RESEND_URL = 'https://api.resend.com/emails';
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const SENT_PAGE = '/message-sent';
const CATEGORIES: Record<string, string> = {
  research: 'Research collaboration',
  platform: 'Platform / Bij AI discussion',
  data: 'Data partnership',
  press: 'Press and media',
  general: 'General enquiry',
};
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
const MAX_BODY = 20_000;

export const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...extra },
  });

/** Single-line text: drop control characters (blocks header injection), collapse whitespace. */
const oneLine = (v: unknown, max: number) =>
  String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Multi-line text: keep newlines/tabs, drop other control characters, normalise line endings. */
const multiLine = (v: unknown, max: number) =>
  String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* Best-effort per-isolate rate limit. Cloudflare may run several isolates, so this is a
   speed bump, not a guarantee; Turnstile is the real gate against automated sending. */
const hits = new Map<string, number[]>();
const WINDOW_MS = 10 * 60_000;
const MAX_HITS = 5;
function limited(ip: string, now: number) {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_HITS) { hits.set(ip, recent); return true; }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return false;
}

type Verification = 'ok' | 'failed' | 'unavailable';

/** Turnstile server-side check. Without a configured secret the check is skipped (local dev). */
async function verifyTurnstile(env: Env, token: string, ip: string, fetchImpl: typeof fetch): Promise<Verification> {
  if (!env.TURNSTILE_SECRET_KEY) return 'ok';
  if (!token) return 'failed';
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  if (ip && ip !== 'unknown') body.set('remoteip', ip);
  try {
    const res = await fetchImpl(env.TURNSTILE_VERIFY_URL || SITEVERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.error('contact: Turnstile siteverify returned', res.status);
      return 'unavailable';
    }
    const data = (await res.json().catch(() => null)) as { success?: boolean; action?: string; 'error-codes'?: string[] } | null;
    if (!data?.success) {
      console.warn('contact: Turnstile rejected the token', (data?.['error-codes'] ?? []).join(','));
      return 'failed';
    }
    if (data.action && data.action !== 'contact') return 'failed';
    return 'ok';
  } catch (e) {
    console.error('contact: Turnstile siteverify failed', (e as Error).name);
    return 'unavailable';
  }
}

/* ------------------------------------------------------------------ outcomes */

type Outcome =
  | { kind: 'sent'; id: string; email: string }
  | { kind: 'decoy' }
  | { kind: 'invalid'; errors: Record<string, string> }
  | { kind: 'error'; status: number; code: string; headers?: Record<string, string> };

const fail = (status: number, code: string, headers?: Record<string, string>): Outcome => ({ kind: 'error', status, code, headers });

function asJson(o: Outcome): Response {
  switch (o.kind) {
    case 'sent': return json({ id: o.id }, 202);
    case 'decoy': return json({ ok: true }, 200);
    case 'invalid': return json({ errors: o.errors }, 400);
    case 'error': return json({ error: o.code }, o.status, o.headers);
  }
}

/* Plain pages for native form posts. Self-contained: no scripts, no external assets. */
const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

function page(status: number, title: string, paragraphs: string[], list: string[] = [], extra: Record<string, string> = {}): Response {
  const body = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} — GEPER</title>
<style>
  :root { color-scheme: light dark; --bg: #f6f3ec; --ink: #17161a; --ink2: #3b3a42; --accent: #1d4ed8; --line: rgb(38 37 44 / 0.22); }
  @media (prefers-color-scheme: dark) { :root { --bg: #16151a; --ink: #f2efe8; --ink2: #c7c4bd; --accent: #8ab4ff; --line: rgb(235 232 224 / 0.2); } }
  body { margin: 0; background: var(--bg); color: var(--ink2); font: 17px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 38rem; margin: 0 auto; padding: 4rem 1.25rem; }
  p.eyebrow { font: 600 12px/1 ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; color: var(--ink2); margin: 0 0 1rem; }
  h1 { color: var(--ink); font-size: 2rem; line-height: 1.2; margin: 0 0 1.25rem; }
  ul { padding-left: 1.2rem; }
  a { color: var(--accent); text-underline-offset: 4px; }
  nav { margin-top: 2rem; padding-top: 1.25rem; border-top: 1px solid var(--line); display: flex; gap: 1.5rem; flex-wrap: wrap; }
</style>
</head>
<body>
<main>
<p class="eyebrow">GEPER · Contact</p>
<h1>${esc(title)}</h1>
${paragraphs.map((p) => `<p>${p}</p>`).join('\n')}
${list.length ? `<ul>\n${list.map((l) => `<li>${esc(l)}</li>`).join('\n')}\n</ul>` : ''}
<nav><a href="/contact">Back to the contact page</a><a href="/">GEPER home page</a></nav>
</main>
</body>
</html>`;
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': PAGE_CSP,
      'X-Frame-Options': 'DENY',
      ...SECURITY_HEADERS,
      ...extra,
    },
  });
}

function asPage(o: Outcome, contactEmail: string): Response {
  const mail = `<a href="mailto:${esc(contactEmail)}">${esc(contactEmail)}</a>`;
  switch (o.kind) {
    case 'sent':
    case 'decoy':
      // Post/redirect/get: a refresh of the confirmation can never send the message twice.
      return new Response(null, { status: 303, headers: { Location: SENT_PAGE, 'Cache-Control': 'no-store', ...SECURITY_HEADERS } });
    case 'invalid':
      return page(400, 'Some details need correcting', [
        'The message was not sent. Please correct the following, then use your browser’s Back button to return to the form: what you typed should still be there.',
      ], Object.values(o.errors));
    case 'error': {
      if (o.code === 'verification_failed')
        return page(403, 'Please send your message by email', [
          'The contact form runs a short automatic check that needs JavaScript, and that check could not be completed, so the message was not sent.',
          `Please email ${mail}, or turn on JavaScript and try again.`,
        ]);
      if (o.code === 'rate_limited')
        return page(429, 'Too many messages', [
          'Several messages were sent from this connection in a short time, so this one was not sent.',
          `Please try again in a few minutes, or email ${mail}.`,
        ], [], o.headers);
      if (o.status >= 500)
        return page(o.status, 'The message could not be sent', [
          'The mail service is unavailable right now, so the message was not sent.',
          `Please try again shortly, or email ${mail}.`,
        ]);
      return page(o.status, 'The message could not be sent', [`Please try again, or email ${mail}.`]);
    }
  }
}

/* -------------------------------------------------------------------- handler */

export async function handleContact(
  request: Request,
  env: Env,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<Response> {
  const contentType = (request.headers.get('Content-Type') ?? '').toLowerCase();
  const isForm = contentType.includes('application/x-www-form-urlencoded');
  const isJson = contentType.includes('application/json');
  const to = (env.CONTACT_TO || DEFAULT_TO).trim();
  const respond = (o: Outcome) => (isForm ? asPage(o, to) : asJson(o));

  // Origin check: browsers always send Origin on cross-origin POSTs (fetch and native forms).
  const origin = request.headers.get('Origin');
  if (origin) {
    const allowed = new Set([new URL(request.url).origin, ...(env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)]);
    if (!allowed.has(origin)) return respond(fail(403, 'forbidden'));
  }

  if (!isJson && !isForm) return json({ error: 'unsupported_media_type' }, 415);
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (declared > MAX_BODY) return respond(fail(413, 'too_large'));

  let raw: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return respond(fail(413, 'too_large'));
    if (isForm) {
      raw = Object.fromEntries(new URLSearchParams(text));
    } else {
      raw = JSON.parse(text);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('shape');
    }
  } catch {
    return respond(fail(400, 'bad_json'));
  }

  // Spam trap: real visitors never see this field. Pretend success, send nothing.
  if (String(raw.website ?? '').trim() !== '') return respond({ kind: 'decoy' });

  const name = oneLine(raw.name, 120);
  const email = oneLine(raw.email, 200);
  const organization = oneLine(raw.organization, 200);
  const inquiryType = oneLine(raw.inquiryType, 40);
  const message = multiLine(raw.message, 4000);
  const token = oneLine(raw.turnstileToken ?? raw['cf-turnstile-response'], 2048);

  const errors: Record<string, string> = {};
  if (!name) errors.name = 'Enter your name.';
  if (!email) errors.email = 'Enter your email address.';
  else if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address, like name@organisation.org.';
  if (!Object.hasOwn(CATEGORIES, inquiryType)) errors.inquiryType = 'Choose what your enquiry is about.';
  if (!message) errors.message = 'Write a message.';
  else if (message.length < 20) errors.message = 'Add a little more detail: at least 20 characters.';
  else if ((message.match(/https?:\/\//gi) ?? []).length > 3) errors.message = 'Please remove some of the links from your message.';
  if (Object.keys(errors).length) return respond({ kind: 'invalid', errors });

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (limited(ip, now)) return respond(fail(429, 'rate_limited', { 'Retry-After': '600' }));

  if (!env.RESEND_API_KEY) {
    console.error('contact: RESEND_API_KEY is not configured');
    return respond(fail(503, 'not_configured'));
  }

  const verification = await verifyTurnstile(env, token, ip, fetchImpl);
  if (verification === 'failed') return respond(fail(403, 'verification_failed'));
  if (verification === 'unavailable') return respond(fail(503, 'verification_unavailable'));

  const category = CATEGORIES[inquiryType];
  const from = (env.CONTACT_FROM || DEFAULT_FROM).trim();
  const subject = `[GEPER website] ${category} — ${name}`.slice(0, 200);

  const text = [
    `Name: ${name}`,
    `Email: ${email}`,
    organization ? `Organisation: ${organization}` : null,
    `Nature of enquiry: ${category}`,
    '',
    message,
  ].filter((l) => l !== null).join('\n');

  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top">${k}</td><td style="padding:4px 0">${v}</td></tr>`;
  const html =
    `<table style="font:14px/1.5 system-ui,sans-serif">` +
    row('Name', esc(name)) +
    row('Email', esc(email)) +
    (organization ? row('Organisation', esc(organization)) : '') +
    row('Enquiry', esc(category)) +
    `</table><hr style="border:0;border-top:1px solid #ddd;margin:16px 0">` +
    `<div style="font:14px/1.6 system-ui,sans-serif;white-space:pre-wrap">${esc(message)}</div>`;

  // Optional client-generated id lets Resend de-duplicate retries/double submits.
  const submissionId = oneLine(raw.submissionId, 64);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  };
  if (/^[A-Za-z0-9-]{8,64}$/.test(submissionId)) headers['Idempotency-Key'] = `geper-contact-${submissionId}`;

  let res: Response;
  try {
    res = await fetchImpl(env.RESEND_API_URL || RESEND_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ from, to: [to], reply_to: email, subject, text, html }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.error('contact: Resend request failed', (e as Error).name);
    return respond(fail(502, 'provider_unreachable'));
  }

  if (res.status === 200 || res.status === 201) {
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    if (data?.id) return respond({ kind: 'sent', id: data.id, email });
    console.error('contact: Resend accepted but returned no id');
    return respond(fail(502, 'provider_error'));
  }

  // Never forward provider detail (could include account/domain info) to the visitor.
  const detail = await res.text().catch(() => '');
  console.error('contact: Resend rejected', res.status, detail.slice(0, 300));
  return respond(fail(res.status === 429 ? 503 : 502, 'provider_error'));
}

/** Route entry: POST goes to handleContact; every other method gets 405. */
export function handleContactRequest(request: Request, env: Env): Promise<Response> | Response {
  return request.method === 'POST'
    ? handleContact(request, env)
    : json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
}
