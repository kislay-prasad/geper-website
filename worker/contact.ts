/**
 * Cloudflare Worker handler: POST /api/contact (routed from worker/index.ts)
 *
 * Validates the contact form, then asks Resend to email it to GEPER.
 * Success is only reported when Resend accepts the message and returns an id.
 *
 * Environment (Worker → Settings → Variables and Secrets; locally .dev.vars):
 *   RESEND_API_KEY  (secret, required)
 *   CONTACT_TO      (optional, default mailgeper@gmail.com)
 *   CONTACT_FROM    (optional, default "GEPER Website <onboarding@resend.dev>";
 *                    switch to e.g. "GEPER Website <contact@geper.in>" once geper.in is verified)
 *   ALLOWED_ORIGINS (optional, comma-separated origins; same-origin is always allowed)
 */

export interface Env {
  RESEND_API_KEY?: string;
  CONTACT_TO?: string;
  CONTACT_FROM?: string;
  ALLOWED_ORIGINS?: string;
  /** Local testing only: point at a mock Resend server. Leave unset in production. */
  RESEND_API_URL?: string;
}

const DEFAULT_TO = 'mailgeper@gmail.com';
const DEFAULT_FROM = 'GEPER Website <onboarding@resend.dev>';
const CATEGORIES: Record<string, string> = {
  research: 'Research collaboration',
  platform: 'Platform / Bij AI discussion',
  data: 'Data partnership',
  press: 'Press and media',
  general: 'General enquiry',
};
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
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
   speed bump, not a guarantee; add a Cloudflare WAF rate-limiting rule for a hard limit. */
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

export async function handleContact(
  request: Request,
  env: Env,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<Response> {
  // Origin check: browsers always send Origin on cross-origin POSTs.
  const origin = request.headers.get('Origin');
  if (origin) {
    const allowed = new Set([new URL(request.url).origin, ...(env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)]);
    if (!allowed.has(origin)) return json({ error: 'forbidden' }, 403);
  }

  if (!(request.headers.get('Content-Type') ?? '').toLowerCase().includes('application/json'))
    return json({ error: 'unsupported_media_type' }, 415);
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (declared > 20_000) return json({ error: 'too_large' }, 413);

  let raw: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 20_000) return json({ error: 'too_large' }, 413);
    raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('shape');
  } catch {
    return json({ error: 'bad_json' }, 400);
  }

  // Spam trap: real visitors never see this field. Pretend success, send nothing.
  if (String(raw.website ?? '').trim() !== '') return json({ ok: true }, 200);

  const name = oneLine(raw.name, 120);
  const email = oneLine(raw.email, 200);
  const organization = oneLine(raw.organization, 200);
  const inquiryType = oneLine(raw.inquiryType, 40);
  const message = multiLine(raw.message, 4000);

  const errors: Record<string, string> = {};
  if (!name) errors.name = 'Enter your name.';
  if (!email) errors.email = 'Enter your email address.';
  else if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address, like name@organisation.org.';
  if (!Object.hasOwn(CATEGORIES, inquiryType)) errors.inquiryType = 'Choose what your enquiry is about.';
  if (!message) errors.message = 'Write a message.';
  else if (message.length < 20) errors.message = 'Add a little more detail: at least 20 characters.';
  else if ((message.match(/https?:\/\//gi) ?? []).length > 3) errors.message = 'Please remove some of the links from your message.';
  if (Object.keys(errors).length) return json({ errors }, 400);

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (limited(ip, now)) return json({ error: 'rate_limited' }, 429, { 'Retry-After': '600' });

  if (!env.RESEND_API_KEY) {
    console.error('contact: RESEND_API_KEY is not configured');
    return json({ error: 'not_configured' }, 503);
  }

  const category = CATEGORIES[inquiryType];
  const to = (env.CONTACT_TO || DEFAULT_TO).trim();
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
    res = await fetchImpl(env.RESEND_API_URL || 'https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify({ from, to: [to], reply_to: email, subject, text, html }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.error('contact: Resend request failed', (e as Error).name);
    return json({ error: 'provider_unreachable' }, 502);
  }

  if (res.status === 200 || res.status === 201) {
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    if (data?.id) return json({ id: data.id }, 202);
    console.error('contact: Resend accepted but returned no id');
    return json({ error: 'provider_error' }, 502);
  }

  // Never forward provider detail (could include account/domain info) to the visitor.
  const detail = await res.text().catch(() => '');
  console.error('contact: Resend rejected', res.status, detail.slice(0, 300));
  return json({ error: 'provider_error' }, res.status === 429 ? 503 : 502);
}

/** Route entry: POST goes to handleContact (unchanged); every other method gets 405. */
export function handleContactRequest(request: Request, env: Env): Promise<Response> | Response {
  return request.method === 'POST'
    ? handleContact(request, env)
    : json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
}
