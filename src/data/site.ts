export type Status = 'in-development' | 'planned' | 'active' | 'out-of-scope';

export const STATUS_LABEL: Record<Status, string> = {
  'in-development': 'In development',
  planned: 'Planned',
  active: 'Active direction',
  'out-of-scope': 'Outside current scope',
};

export const site = {
  name: 'GEPER',
  legalName: 'GEPER CORPORATION',
  tagline: 'Building the Future of Genomic Intelligence.',
  description:
    'GEPER is a computational genomics company building AI systems for interpreting genomic variation and biological complexity.',
  url: import.meta.env.PUBLIC_SITE_URL || 'https://www.geper.example',
  contactEmail: import.meta.env.PUBLIC_CONTACT_EMAIL || 'contact@geper.in',
  contactEndpoint: import.meta.env.PUBLIC_CONTACT_ENDPOINT || '/api/contact',
  analyticsSrc: import.meta.env.PUBLIC_ANALYTICS_SRC || '',
  location: 'Chennai, India',
  founded: '2026',
  copyrightYear: new Date().getFullYear(),
  /* Date this revision of the legal pages was published. Bump it whenever the
     terms change — it is shown to visitors, so a stale value is worse than
     none. Set to an empty string to hide the line entirely. */
  legalUpdated: import.meta.env.PUBLIC_LEGAL_UPDATED || '2026-09-01',
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
