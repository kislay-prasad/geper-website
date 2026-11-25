import type { APIRoute } from 'astro';
import { site } from '@/data/site';

/* Indexable pages only: the legal pages, the 404 and the form confirmation are noindex. */
const PAGES = ['/', '/technology', '/research', '/platform', '/about', '/contact'];

export const GET: APIRoute = () => {
  const urls = PAGES.map((p) => `  <url><loc>${new URL(p, site.url).toString()}</loc></url>`).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
