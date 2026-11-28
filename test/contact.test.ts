/**
 * Tests for the contact API (worker/contact.ts) and the Worker router (worker/index.ts).
 * Run with `npm test` (Node's built-in runner; TypeScript is stripped natively).
 * No network: Resend and Turnstile are replaced by a stub fetch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleContact, handleContactRequest, type Env } from '../worker/contact.ts';
import worker from '../worker/index.ts';

const ORIGIN = 'https://geper.in';
let ipCounter = 0;
const nextIp = () => `203.0.113.${++ipCounter}`;

const VALID = {
  name: 'Ada Example',
  email: 'ada@example.org',
  organization: 'Example Lab',
  inquiryType: 'research',
  message: 'We would like to discuss a research collaboration on variant interpretation.',
  website: '',
  submissionId: 'test-submission-0001',
  turnstileToken: 'tok-valid',
};

type Call = { url: string; init: RequestInit };

/** A stub fetch that records calls and answers Turnstile and Resend as configured. */
function stub(opts: { resend?: () => Response; siteverify?: () => Response; throwOn?: 'resend' | 'siteverify' } = {}) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('siteverify')) {
      if (opts.throwOn === 'siteverify') throw new TypeError('network down');
      return opts.siteverify?.() ?? Response.json({ success: true, action: 'contact', hostname: 'geper.in' });
    }
    if (opts.throwOn === 'resend') throw new TypeError('network down');
    return opts.resend?.() ?? Response.json({ id: 'email-123' });
  }) as typeof fetch;
  return { impl, calls, resendCalls: () => calls.filter((c) => c.url.includes('resend')), verifyCalls: () => calls.filter((c) => c.url.includes('siteverify')) };
}

const env = (extra: Partial<Env> = {}): Env => ({ RESEND_API_KEY: 're_test', TURNSTILE_SECRET_KEY: 'ts-secret', CONTACT_FROM: 'GEPER Website <website@notify.geper.in>', ...extra });

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  const text = JSON.stringify(body);
  return new Request(`${ORIGIN}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': nextIp(), 'Content-Length': String(text.length), ...headers },
    body: text,
  });
}

function formRequest(fields: Record<string, string>, headers: Record<string, string> = {}) {
  const text = new URLSearchParams(fields).toString();
  return new Request(`${ORIGIN}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN, 'CF-Connecting-IP': nextIp(), ...headers },
    body: text,
  });
}

/* ------------------------------------------------------------------ routing */

test('router: POST /api/contact reaches the contact handler (a broken import would fail here)', async () => {
  const res = await worker.fetch(jsonRequest({}), { ASSETS: { fetch: async () => new Response('asset') } });
  assert.equal(res.status, 400);
  assert.ok((await res.json()).errors);
});

test('router: unknown /api path answers JSON 404', async () => {
  const res = await worker.fetch(new Request(`${ORIGIN}/api/nope`), { ASSETS: { fetch: async () => new Response('asset') } });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'not_found' });
});

test('router: an unexpected exception becomes a JSON 500, never a bare platform error', async () => {
  const res = await worker.fetch(new Request(`${ORIGIN}/somewhere`), { ASSETS: { fetch: async () => { throw new Error('boom'); } } });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: 'internal_error' });
});

test('router: GET /api/contact is 405 with Allow: POST', async () => {
  const res = await handleContactRequest(new Request(`${ORIGIN}/api/contact`), env());
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('Allow'), 'POST');
});

/* ---------------------------------------------------------- JSON contract */

test('valid JSON submission is emailed to contact@geper.in and returns 202 with an id', async () => {
  const s = stub();
  const res = await handleContact(jsonRequest(VALID), env(), s.impl);
  assert.equal(res.status, 202);
  assert.deepEqual(await res.json(), { id: 'email-123' });
  const [call] = s.resendCalls();
  const sent = JSON.parse(String(call.init.body));
  assert.deepEqual(sent.to, ['contact@geper.in']);
  assert.equal(sent.from, 'GEPER Website <website@notify.geper.in>');
  assert.equal(sent.reply_to, VALID.email);
  assert.match(sent.subject, /Research collaboration — Ada Example/);
  assert.equal((call.init.headers as Record<string, string>)['Idempotency-Key'], 'geper-contact-test-submission-0001');
});

test('responses carry security headers', async () => {
  const res = await handleContact(jsonRequest({}), env(), stub().impl);
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(res.headers.get('Strict-Transport-Security') ?? '', /max-age=\d+/);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

test('missing fields give 400 with a message per field and send nothing', async () => {
  const s = stub();
  const res = await handleContact(jsonRequest({ name: '', email: 'x', inquiryType: 'nope', message: 'short' }), env(), s.impl);
  assert.equal(res.status, 400);
  const { errors } = await res.json();
  assert.deepEqual(Object.keys(errors).sort(), ['email', 'inquiryType', 'message', 'name']);
  assert.equal(s.calls.length, 0);
});

test('too many links in the message is rejected', async () => {
  const res = await handleContact(jsonRequest({ ...VALID, message: 'see http://a.example http://b.example http://c.example http://d.example now' }), env(), stub().impl);
  assert.equal(res.status, 400);
  assert.match((await res.json()).errors.message, /links/);
});

test('honeypot filled: pretends success, sends nothing', async () => {
  const s = stub();
  const res = await handleContact(jsonRequest({ ...VALID, website: 'http://spam.example' }), env(), s.impl);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(s.calls.length, 0);
});

test('foreign Origin is refused', async () => {
  const res = await handleContact(jsonRequest(VALID, { Origin: 'https://evil.example' }), env(), stub().impl);
  assert.equal(res.status, 403);
});

test('unsupported content type is 415', async () => {
  const req = new Request(`${ORIGIN}/api/contact`, { method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: ORIGIN }, body: 'hi' });
  assert.equal((await handleContact(req, env(), stub().impl)).status, 415);
});

test('oversized body is 413', async () => {
  const res = await handleContact(jsonRequest({ ...VALID, message: 'x'.repeat(25_000) }), env(), stub().impl);
  assert.equal(res.status, 413);
});

test('malformed JSON is 400', async () => {
  const req = new Request(`${ORIGIN}/api/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: '{nope' });
  assert.deepEqual(await (await handleContact(req, env(), stub().impl)).json(), { error: 'bad_json' });
});

test('sixth message from one IP within ten minutes is rate limited', async () => {
  const ip = nextIp();
  let last: Response | undefined;
  for (let i = 0; i < 6; i++) last = await handleContact(jsonRequest(VALID, { 'CF-Connecting-IP': ip }), env(), stub().impl, 1_000_000 + i);
  assert.equal(last!.status, 429);
  assert.equal(last!.headers.get('Retry-After'), '600');
});

test('missing Resend key is 503 not_configured', async () => {
  const res = await handleContact(jsonRequest(VALID), env({ RESEND_API_KEY: undefined }), stub().impl);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'not_configured' });
});

test('Resend rejection is 502, Resend rate limit is 503, network failure is 502', async () => {
  assert.equal((await handleContact(jsonRequest(VALID), env(), stub({ resend: () => new Response('nope', { status: 422 }) }).impl)).status, 502);
  assert.equal((await handleContact(jsonRequest(VALID), env(), stub({ resend: () => new Response('slow down', { status: 429 }) }).impl)).status, 503);
  const down = await handleContact(jsonRequest(VALID), env(), stub({ throwOn: 'resend' }).impl);
  assert.equal(down.status, 502);
  assert.deepEqual(await down.json(), { error: 'provider_unreachable' });
});

/* ---------------------------------------------------------------- Turnstile
   Verification fails closed: every path that is not a clear "Cloudflare confirmed this token"
   refuses the message, and nothing is emailed. */

const TS = { TURNSTILE_SECRET_KEY: 'ts-secret' };
const GOOD = { success: true, action: 'contact', hostname: 'geper.in' };
const verifyWith = (body: unknown, status = 200) => () => Response.json(body as object, { status });

async function expectRefused(res: Response, status: number, code: string, s: ReturnType<typeof stub>) {
  assert.equal(res.status, status);
  assert.deepEqual(await res.json(), { error: code });
  assert.equal(s.resendCalls().length, 0, 'nothing may be emailed');
}

test('Turnstile: valid token is verified server-side, then the message is sent', async () => {
  const s = stub();
  const res = await handleContact(jsonRequest({ ...VALID, turnstileToken: 'tok-1' }), env(TS), s.impl);
  assert.equal(res.status, 202);
  const form = new URLSearchParams(String(s.verifyCalls()[0].init.body));
  assert.equal(form.get('secret'), 'ts-secret');
  assert.equal(form.get('response'), 'tok-1');
  assert.ok(form.get('remoteip'));
  assert.equal(s.resendCalls().length, 1);
});

test('Turnstile: secret missing → 503 not_configured, siteverify never called, nothing emailed', async () => {
  for (const TURNSTILE_SECRET_KEY of [undefined, '', '   ']) {
    const s = stub();
    const res = await handleContact(jsonRequest(VALID), env({ TURNSTILE_SECRET_KEY }), s.impl);
    await expectRefused(res, 503, 'not_configured', s);
    assert.equal(s.verifyCalls().length, 0);
  }
});

test('Turnstile: secret missing is also refused for a native form post', async () => {
  const s = stub();
  const res = await handleContact(formRequest(VALID), env({ TURNSTILE_SECRET_KEY: '' }), s.impl);
  assert.equal(res.status, 503);
  assert.equal(s.resendCalls().length, 0);
});

test('Turnstile: no token → 403 and nothing is emailed', async () => {
  for (const turnstileToken of ['', undefined]) {
    const s = stub();
    const res = await handleContact(jsonRequest({ ...VALID, turnstileToken }), env(TS), s.impl);
    await expectRefused(res, 403, 'verification_failed', s);
    assert.equal(s.verifyCalls().length, 0, 'no token means Cloudflare is not even asked');
  }
});

test('Turnstile: invalid, expired or reused token (success:false) → 403', async () => {
  for (const code of ['invalid-input-response', 'timeout-or-duplicate']) {
    const s = stub({ siteverify: verifyWith({ success: false, 'error-codes': [code] }) });
    await expectRefused(await handleContact(jsonRequest(VALID), env(TS), s.impl), 403, 'verification_failed', s);
  }
});

test('Turnstile: only an explicit success:true passes (truthy look-alikes and junk are refused)', async () => {
  for (const reply of [{ ...GOOD, success: 'true' }, { ...GOOD, success: 1 }, {}, [], null, 'ok']) {
    const s = stub({ siteverify: verifyWith(reply) });
    await expectRefused(await handleContact(jsonRequest(VALID), env(TS), s.impl), 403, 'verification_failed', s);
  }
});

test('Turnstile: wrong or missing action → 403', async () => {
  for (const action of ['login', '', undefined]) {
    const s = stub({ siteverify: verifyWith({ ...GOOD, action }) });
    await expectRefused(await handleContact(jsonRequest(VALID), env(TS), s.impl), 403, 'verification_failed', s);
  }
});

test('Turnstile: wrong or missing hostname → 403', async () => {
  for (const hostname of ['evil.example', 'geper.in.evil.example', 'notgeper.in', '', undefined]) {
    const s = stub({ siteverify: verifyWith({ ...GOOD, hostname }) });
    await expectRefused(await handleContact(jsonRequest(VALID), env(TS), s.impl), 403, 'verification_failed', s);
  }
});

test('Turnstile: hostname is matched case-insensitively and ALLOWED_ORIGINS hosts are accepted', async () => {
  const upper = stub({ siteverify: verifyWith({ ...GOOD, hostname: 'GEPER.IN' }) });
  assert.equal((await handleContact(jsonRequest(VALID), env(TS), upper.impl)).status, 202);
  const extra = stub({ siteverify: verifyWith({ ...GOOD, hostname: 'www.geper.in' }) });
  const res = await handleContact(jsonRequest(VALID, { Origin: 'https://www.geper.in' }), env({ ...TS, ALLOWED_ORIGINS: 'https://www.geper.in' }), extra.impl);
  assert.equal(res.status, 202);
});

test('Turnstile: siteverify unreachable → 503, nothing emailed', async () => {
  const s = stub({ throwOn: 'siteverify' });
  await expectRefused(await handleContact(jsonRequest(VALID), env(TS), s.impl), 503, 'verification_unavailable', s);
});

test('Turnstile: siteverify answers with an HTTP error or unparseable body → refused, nothing emailed', async () => {
  for (const status of [500, 502, 429]) {
    const s = stub({ siteverify: verifyWith(GOOD, status) });
    await expectRefused(await handleContact(jsonRequest(VALID), env(TS), s.impl), 503, 'verification_unavailable', s);
  }
  const garbage = stub({ siteverify: () => new Response('<html>oops</html>', { status: 200 }) });
  await expectRefused(await handleContact(jsonRequest(VALID), env(TS), garbage.impl), 403, 'verification_failed', garbage);
});

test('Turnstile: refusals never echo the secret, the token or internals', async () => {
  const cases = [
    await handleContact(jsonRequest({ ...VALID, turnstileToken: 'tok-SENSITIVE' }), env(TS), stub({ siteverify: verifyWith({ success: false, 'error-codes': ['invalid-input-secret'] }) }).impl),
    await handleContact(jsonRequest(VALID), env(TS), stub({ throwOn: 'siteverify' }).impl),
    await handleContact(jsonRequest(VALID), env({ TURNSTILE_SECRET_KEY: '' }), stub().impl),
  ];
  for (const res of cases) {
    const text = await res.text();
    assert.match(text, /^\{"error":"[a-z_]+"\}$/);
    assert.ok(!/ts-secret|tok-SENSITIVE|re_test|invalid-input-secret/.test(text));
  }
});

test('Turnstile: validation errors still come first, and the message is never sent on a refusal', async () => {
  const s = stub({ siteverify: verifyWith({ success: false }) });
  const bad = await handleContact(jsonRequest({ ...VALID, email: 'not-an-email' }), env(TS), s.impl);
  assert.equal(bad.status, 400);
  assert.equal(s.verifyCalls().length, 0);
});

/* ------------------------------------------------------- input hardening */

test('subject and body: bidi overrides, zero-width and separator characters are stripped; joiners are kept', async () => {
  const s = stub();
  const name = 'Ada\u202e Lovelace\u200b\u2066x\u2069\ufeff';
  const res = await handleContact(jsonRequest({ ...VALID, name, message: VALID.message + '\u202e hidden \u200f' }), env(), s.impl);
  assert.equal(res.status, 202);
  const sent = JSON.parse(String(s.resendCalls()[0].init.body));
  assert.equal(sent.subject, '[GEPER website] Research collaboration — Ada Lovelacex');
  assert.ok(!/[\u202a-\u202e\u2066-\u2069\u200b\u200e\u200f\ufeff\u2028\u2029]/.test(sent.subject + sent.text + sent.html));
  const indic = await handleContact(jsonRequest({ ...VALID, name: 'क\u200dष' }), env(), stub().impl);
  assert.equal(indic.status, 202);
});

test('types: numbers, arrays and objects are treated as missing, never coerced into text', async () => {
  for (const bad of [123, ['Ada'], { toString: 'x' }, true]) {
    const s = stub();
    const res = await handleContact(jsonRequest({ ...VALID, name: bad }), env(), s.impl);
    assert.equal(res.status, 400);
    assert.ok((await res.json()).errors.name);
    assert.equal(s.calls.length, 0);
  }
  const s = stub();
  const res = await handleContact(jsonRequest({ ...VALID, message: ['x'.repeat(40)] }), env(), s.impl);
  assert.equal(res.status, 400);
  assert.equal(s.calls.length, 0);
});

test('types: a non-string honeypot value is treated as a bot (nothing sent)', async () => {
  const s = stub();
  const res = await handleContact(jsonRequest({ ...VALID, website: ['x'] }), env(), s.impl);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(s.calls.length, 0);
});

test('size: an oversized body is refused with 413 even when Content-Length is missing or lies', async () => {
  const big = JSON.stringify({ ...VALID, message: 'x'.repeat(30_000) });
  const noLength = new Request(`${ORIGIN}/api/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': nextIp() }, body: big });
  const s1 = stub();
  assert.equal((await handleContact(noLength, env(), s1.impl)).status, 413);
  const lying = new Request(`${ORIGIN}/api/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': nextIp(), 'Content-Length': '100' }, body: big });
  assert.equal((await handleContact(lying, env(), stub().impl)).status, 413);
  assert.equal(s1.calls.length, 0);
});

test('size: a chunked upload is cut off as soon as it passes the limit, not read to the end', async () => {
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled += 1;
      if (pulled > 1000) { controller.close(); return; }
      controller.enqueue(new TextEncoder().encode('x'.repeat(1_000)));
    },
  });
  const req = new Request(`${ORIGIN}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': nextIp() },
    body: stream,
    duplex: 'half',
  } as RequestInit);
  const s = stub();
  assert.equal((await handleContact(req, env(), s.impl)).status, 413);
  assert.ok(pulled < 100, `body was read far past the 20 000 byte limit (${pulled} chunks)`);
  assert.equal(s.calls.length, 0);
});

test('size: a body just under the limit is still accepted', async () => {
  const res = await handleContact(jsonRequest({ ...VALID, message: 'y'.repeat(3_900) }), env(), stub().impl);
  assert.equal(res.status, 202);
});

/* ------------------------------------------- native form posts (no JavaScript) */

test('form post: success redirects (303) to /message-sent — nothing in the URL', async () => {
  const fields = { ...VALID, 'cf-turnstile-response': 'tok' };
  const res = await handleContact(formRequest(fields), env(TS), stub().impl);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('Location'), '/message-sent');
});

test('form post: validation errors come back as an HTML page listing them', async () => {
  const res = await handleContact(formRequest({ name: '', email: 'bad', inquiryType: '', message: '' }), env(), stub().impl);
  assert.equal(res.status, 400);
  assert.match(res.headers.get('Content-Type') ?? '', /text\/html/);
  assert.match(res.headers.get('Content-Security-Policy') ?? '', /default-src 'none'/);
  const html = await res.text();
  assert.match(html, /Enter your name\./);
  assert.match(html, /Back button/);
});

test('form post without a Turnstile token explains how to email instead', async () => {
  const res = await handleContact(formRequest({ ...VALID, turnstileToken: '' }), env(TS), stub().impl);
  assert.equal(res.status, 403);
  const html = await res.text();
  assert.match(html, /mailto:contact@geper\.in/);
  assert.match(html, /needs JavaScript/);
});

test('form post honeypot also redirects to the confirmation, sending nothing', async () => {
  const s = stub();
  const res = await handleContact(formRequest({ ...VALID, website: 'spam' }), env(), s.impl);
  assert.equal(res.status, 303);
  assert.equal(s.calls.length, 0);
});
