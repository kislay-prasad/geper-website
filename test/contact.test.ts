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
      return opts.siteverify?.() ?? Response.json({ success: true, action: 'contact' });
    }
    if (opts.throwOn === 'resend') throw new TypeError('network down');
    return opts.resend?.() ?? Response.json({ id: 'email-123' });
  }) as typeof fetch;
  return { impl, calls, resendCalls: () => calls.filter((c) => c.url.includes('resend')), verifyCalls: () => calls.filter((c) => c.url.includes('siteverify')) };
}

const env = (extra: Partial<Env> = {}): Env => ({ RESEND_API_KEY: 're_test', CONTACT_FROM: 'GEPER Website <website@notify.geper.in>', ...extra });

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

/* ---------------------------------------------------------------- Turnstile */

const TS = { TURNSTILE_SECRET_KEY: 'ts-secret' };

test('Turnstile: no token → 403 and nothing is emailed', async () => {
  const s = stub();
  const res = await handleContact(jsonRequest(VALID), env(TS), s.impl);
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'verification_failed' });
  assert.equal(s.resendCalls().length, 0);
});

test('Turnstile: valid token is verified server-side, then the message is sent', async () => {
  const s = stub();
  const res = await handleContact(jsonRequest({ ...VALID, turnstileToken: 'tok-1' }), env(TS), s.impl);
  assert.equal(res.status, 202);
  const verify = s.verifyCalls()[0];
  const form = new URLSearchParams(String(verify.init.body));
  assert.equal(form.get('secret'), 'ts-secret');
  assert.equal(form.get('response'), 'tok-1');
  assert.ok(form.get('remoteip'));
  assert.equal(s.resendCalls().length, 1);
});

test('Turnstile: rejected token or wrong action → 403', async () => {
  const rejected = await handleContact(jsonRequest({ ...VALID, turnstileToken: 't' }), env(TS), stub({ siteverify: () => Response.json({ success: false, 'error-codes': ['invalid-input-response'] }) }).impl);
  assert.equal(rejected.status, 403);
  const wrongAction = await handleContact(jsonRequest({ ...VALID, turnstileToken: 't' }), env(TS), stub({ siteverify: () => Response.json({ success: true, action: 'login' }) }).impl);
  assert.equal(wrongAction.status, 403);
});

test('Turnstile: siteverify unreachable → 503, nothing emailed', async () => {
  const s = stub({ throwOn: 'siteverify' });
  const res = await handleContact(jsonRequest({ ...VALID, turnstileToken: 't' }), env(TS), s.impl);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'verification_unavailable' });
  assert.equal(s.resendCalls().length, 0);
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
  const res = await handleContact(formRequest(VALID), env(TS), stub().impl);
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
