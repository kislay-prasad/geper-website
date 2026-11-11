/**
 * GEPER website Worker.
 *
 * Static pages are served by Workers Static Assets straight from ./dist and never reach this
 * code. wrangler.jsonc sends only /api/* here (assets.run_worker_first).
 */
import { handleContactRequest, type Env as ContactEnv } from './contact';

interface Env extends ContactEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/contact') return handleContactRequest(request, env);

    // Any other /api/* path is not an API we serve: answer 404 in JSON, not a page.
    if (pathname.startsWith('/api/'))
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });

    // Safety net: anything else (should not arrive here) is served from the static assets.
    return env.ASSETS.fetch(request);
  },
};
