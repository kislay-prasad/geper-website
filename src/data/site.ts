export type Status = 'in-development' | 'planned' | 'active' | 'out-of-scope';

export const STATUS_LABEL: Record<Status, string> = {
  'in-development': 'In development',
  planned: 'Planned',
  active: 'Active direction',
  'out-of-scope': 'Outside current scope',
};

/**
 * Public path of a built page. Pages are built as files (about.html), so Astro.url.pathname
 * ends in .html; the site serves them without it: /about.html → /about, /index.html → /.
 */
export const pagePath = (pathname: string) =>
  pathname.replace(/\.html$/, '').replace(/\/index$/, '/').replace(/(.)\/+$/, '$1') || '/';

export const site = {
  name: 'GEPER',
  legalName: 'GEPER CORPORATION',
  tagline: 'Building the Future of Genomic Intelligence.',
  description:
    'GEPER is a computational genomics company building AI systems for interpreting genomic variation and biological complexity.',
  url: import.meta.env.PUBLIC_SITE_URL || 'https://geper.in',
  contactEmail: import.meta.env.PUBLIC_CONTACT_EMAIL || 'contact@geper.in',
  contactEndpoint: import.meta.env.PUBLIC_CONTACT_ENDPOINT || '/api/contact',
  analyticsSrc: import.meta.env.PUBLIC_ANALYTICS_SRC || '',
  founded: '2026',
  copyrightYear: new Date().getFullYear(),
  /* Publication date of each legal page, shown to visitors. Bump the matching
     date whenever that page's wording changes: a stale date is worse than none. */
  privacyUpdated: import.meta.env.PUBLIC_PRIVACY_UPDATED || '2026-11-25',
  termsUpdated: import.meta.env.PUBLIC_TERMS_UPDATED || '2026-09-01',
  /* Public Turnstile site key (safe to publish). The matching secret lives only
     in the Worker as TURNSTILE_SECRET_KEY. Empty disables the widget. */
  turnstileSiteKey: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ?? '0x4AAAAAAGSDpeY3tkky_mSz',
  /* Social preview image (1200×630), relative to the site root. */
  ogImage: '/og/geper-og.png',
  ogImageAlt: 'GEPER — Building the Future of Genomic Intelligence.',
} as const;

export const nav = [
  { href: '/technology', label: 'Technology' },
  { href: '/research', label: 'Research' },
  { href: '/platform', label: 'Platform' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
] as const;

export const footerColumns = [
  {
    heading: 'System',
    links: [
      { href: '/technology', label: 'Technology' },
      { href: '/research', label: 'Research' },
      { href: '/platform', label: 'Platform' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
  },
] as const;

/* GEPER's official social profiles. Only accounts that actually exist belong
   here — an empty platform is worse than an absent one. */
export const socials = [
  { href: 'https://www.instagram.com/gepercorporation/', label: 'GEPER on Instagram', icon: 'instagram' },
  { href: 'https://www.linkedin.com/company/geper/', label: 'GEPER on LinkedIn', icon: 'linkedin' },
] as const;

/** The five-stage system. Used by the pipeline strip, diagrams and the helix narrative. */
export const backbone = [
  {
    id: 'data',
    index: '01',
    short: 'Biological data',
    title: 'Biological data',
    summary: 'Genomic sequences, variants and related biological information.',
  },
  {
    id: 'representation',
    index: '02',
    short: 'Representation',
    title: 'Computational representation',
    summary: 'Biological information expressed in forms that computation can work with.',
  },
  {
    id: 'models',
    index: '03',
    short: 'Models',
    title: 'AI and statistical models',
    summary: 'Machine learning and statistical methods applied to those representations.',
  },
  {
    id: 'interpretation',
    index: '04',
    short: 'Interpretation',
    title: 'Biological interpretation',
    summary: 'Model outputs combined with curated knowledge into evidence-backed conclusions.',
  },
  {
    id: 'output',
    index: '05',
    short: 'Output',
    title: 'Research and clinical output',
    summary: 'Results presented transparently for researchers and, in future, clinical use.',
  },
] as const;

export type BackboneStage = (typeof backbone)[number];
