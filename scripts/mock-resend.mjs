/**
 * Local-only stand-in for the Resend API and Turnstile's siteverify, so /api/contact can be
 * tested end to end without sending real email.
 *
 *   1. Create .dev.vars (git-ignored):
 *        RESEND_API_KEY=re_mock
 *        RESEND_API_URL=http://127.0.0.1:8799/emails
 *        TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
 *        TURNSTILE_VERIFY_URL=http://127.0.0.1:8799/siteverify
 *   2. npm run mock:resend      (terminal 1)
 *   3. PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA npm run dev:worker   (terminal 2)
 *      → http://localhost:8787/contact  (Cloudflare's test site key always passes)
 *
 * Every request is printed here. A message whose subject contains "FAILTEST" gets a 500 so the
 * error path can be exercised; a Turnstile token equal to "fail" is rejected.
 */
import http from 'node:http';

const PORT = 8799;
http
  .createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (req.url?.startsWith('/siteverify')) {
        const form = new URLSearchParams(raw);
        const token = form.get('response') ?? '';
        const success = !!token && token !== 'fail';
        console.log(`[mock-turnstile] siteverify token=${token.slice(0, 24) || '-'} remoteip=${form.get('remoteip') ?? '-'} → ${success ? 'pass' : 'fail'}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(success ? { success: true, action: 'contact', hostname: 'localhost' } : { success: false, 'error-codes': ['invalid-input-response'] }));
      }
      let body = {};
      try { body = JSON.parse(raw); } catch {}
      console.log(`[mock-resend] ${req.method} ${req.url}\n  to: ${body.to}\n  reply_to: ${body.reply_to}\n  subject: ${body.subject}\n  idempotency-key: ${req.headers['idempotency-key'] ?? '-'}`);
      if (String(body.subject ?? '').includes('FAILTEST')) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end('{"message":"mock failure"}');
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: `mock_${Date.now()}` }));
    });
  })
  .listen(PORT, '127.0.0.1', () => console.log(`[mock-resend] listening on http://127.0.0.1:${PORT}/emails and /siteverify (no email is sent)`));
