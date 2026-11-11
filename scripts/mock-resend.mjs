/**
 * Local-only stand-in for the Resend API, so /api/contact can be tested without sending real email.
 *
 *   1. Create .dev.vars (git-ignored):
 *        RESEND_API_KEY=re_mock
 *        RESEND_API_URL=http://127.0.0.1:8799/emails
 *   2. npm run mock:resend      (terminal 1)
 *   3. npm run dev:pages        (terminal 2)  → http://localhost:8788/contact
 *
 * Every request is printed here. A message whose subject contains "FAILTEST" gets a 500 so the
 * error path can be exercised.
 */
import http from 'node:http';

const PORT = 8799;
http
  .createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
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
  .listen(PORT, '127.0.0.1', () => console.log(`[mock-resend] listening on http://127.0.0.1:${PORT}/emails (no email is sent)`));
