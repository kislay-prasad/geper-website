/**
 * GEPER website Worker.
 *
 * Static pages are served by Workers Static Assets straight from ./dist and never reach this
 * code. wrangler.jsonc sends only /api/* here (assets.run_worker_first).
 */
import { handleContactRequest, json, type Env as ContactEnv } from './contact.ts';

interface Env extends ContactEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const { pathname } = new URL(request.url);

      if (pathname === '/api/contact') return await handleContactRequest(request, env);

      // Any other /api/* path is not an API we serve: answer 404 in JSON, not a page.
      if (pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);

      // Safety net: anything else (should not arrive here) is served from the static assets.
      return await env.ASSETS.fetch(request);
    } catch (e) {
      // An uncaught exception would otherwise surface as Cloudflare's bare "error 1101" page,
      // which the contact form cannot interpret and which leaves no clue in the response.
      console.error('worker: unhandled error', e instanceof Error ? e.stack ?? e.message : String(e));
      return json({ error: 'internal_error' }, 500);
    }
  },
};
