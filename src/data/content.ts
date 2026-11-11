import type { Status } from './site';

/* -------------------------------------------------------------- HOME */

export const home = {
  eyebrow: 'Computational genomics · Chennai, India',
  headline: 'Building the Future of Genomic Intelligence.',
  explanation:
    'GEPER develops computational systems for interpreting genomic variation, combining genomics, computational biology and artificial intelligence so that biological data becomes understandable, evidence-backed insight for the people who need it.',
  /* The hero visual: how intelligence, biology and people relate in GEPER's work. */
  triad: [
    { id: 'nature', label: 'Biological systems', note: 'Sequence, variation, molecular context' },
    { id: 'ai', label: 'Computational intelligence', note: 'Representation, models, evidence' },
    { id: 'human', label: 'People', note: 'Researchers and clinicians who decide' },
  ],
  narrative: [
    {
      stage: 'data',
      title: 'It starts with sequence',
      body: 'Genomic data arrives as sequence and as variants, positions where an individual differs from a reference, alongside population and molecular context.',
    },
    {
      stage: 'representation',
      title: 'Biology becomes computable',
      body: 'Each variant is placed in context: gene, transcript, protein region, population frequency, conservation. These become structured representations a model can reason over.',
    },
    {
      stage: 'models',
      title: 'Models estimate effect',
      body: 'Machine learning and statistical models estimate what a change might do to splicing, protein function or regulation. Each estimate is one line of evidence, not a verdict.',
    },
    {
      stage: 'interpretation',
      title: 'Evidence is combined',
      body: 'Model estimates are weighed with curated clinical and population knowledge under established frameworks, with the reasoning recorded step by step.',
    },
    {
      stage: 'output',
      title: 'The result is readable',
      body: 'An interpretation a scientist can read, audit and challenge: what was concluded, what supported it, and what remains uncertain.',
    },
  ],
} as const;

/* -------------------------------------------------------- TECHNOLOGY */

export type TechLayer = {
  id: string;
  index: string;
  title: string;
  question: string;
  body: string;
  items: string[];
};

export const technology = {
  eyebrow: 'Technology',
  headline: 'What happens to biological data inside GEPER.',
  lead: 'One idea organises the system: biological data becomes useful when it is represented well, modelled carefully and interpreted against evidence. Five stages carry data from sequence to a readable result.',
  layers: [
    {
      id: 'data',
      index: '01',
      title: 'Biological data',
      question: 'What comes in?',
      body: 'Genomic variants, together with the context needed to make sense of them. A variant is treated as an object with a location, a molecular neighbourhood and a population history, not an isolated string.',
      items: ['Sequences and variants', 'Gene, transcript and protein context', 'Population frequency and conservation', 'Curated biological and clinical knowledge'],
    },
    {
      id: 'representation',
      index: '02',
      title: 'Computational representation',
      question: 'How does biology become computable?',
      body: 'Inputs are normalised and enriched into consistent, structured descriptions, so that two scientists or two models asking about the same variant start from the same definition of it.',
      items: ['Standardised variant description', 'Structured biological annotation', 'Sequence- and protein-level representations', 'Missing information stays explicit'],
    },
    {
      id: 'models',
      index: '03',
      title: 'Modelling',
      question: 'What do the models do?',
      body: 'Machine learning and statistical models estimate the potential effect of a variant. Each model is an instrument with known strengths and blind spots; no single output is treated as a conclusion.',
      items: ['Sequence-based machine learning', 'Statistical and population-genetics methods', 'Established computational-biology techniques', 'Outputs are evidence, not verdicts'],
    },
    {
      id: 'interpretation',
      index: '04',
      title: 'Interpretation',
      question: 'How does evidence become insight?',
      body: 'Model estimates are combined with curated knowledge under published interpretation frameworks. The reasoning is recorded so that a result can be audited: what contributed, how strongly, and what could not be assessed.',
      items: ['Published interpretation frameworks', 'Recorded reasoning and provenance', 'Explicit “not assessed” states', 'Built for expert review'],
    },
    {
      id: 'output',
      index: '05',
      title: 'Output',
      question: 'What comes out?',
      body: 'A readable interpretation intended for qualified reviewers: the conclusion, the evidence behind it, and its limits, presented so that it can be checked and challenged.',
      items: ['Conclusion with supporting evidence', 'Uncertainty stated plainly', 'Designed for human sign-off'],
    },
  ] satisfies TechLayer[],
} as const;

/* ------------------------------------------------------------ RESEARCH */

export type Pillar = {
  index: string;
  title: string;
  question: string;
  /** One line, used by the research-directions selector. Deliberately short. */
  brief: string;
  body: string;
  directions: string[];
  status: Status;
};

/** One stage of the research pipeline explainer. `visual` selects the SVG. */
export type ResearchStage = {
  id: 'data' | 'representation' | 'modelling' | 'interpretation';
  index: string;
  label: string;
  title: string;
  body: string;
  caption: string;
};

export const research = {
  eyebrow: 'Research',
  headline: 'Where Biology Meets Computation.',
  lead: 'Research at GEPER focuses on how biological variation can be represented, modelled and interpreted computationally.',
  /** The four-stage explainer. Each stage is one idea, stated once. */
  pipeline: [
    {
      id: 'data',
      index: '01',
      label: 'Biological data',
      title: 'Variation arrives as sequence.',
      body: 'A variant is a position where an individual differs from a reference. On its own it means little; its meaning comes from the gene, protein and population around it.',
      caption: 'variant + context',
    },
    {
      id: 'representation',
      index: '02',
      label: 'Representation',
      title: 'Biology becomes computable.',
      body: 'Scattered, inconsistently described observations are normalised into structured objects a model can reason over, with missing information marked as missing.',
      caption: 'scattered → structured',
    },
    {
      id: 'modelling',
      index: '03',
      label: 'Modelling',
      title: 'Structure moves through models.',
      body: 'Representations pass through layers of computation that estimate possible effects. Each estimate is one line of evidence, never a verdict on its own.',
      caption: 'layered estimation',
    },
    {
      id: 'interpretation',
      index: '04',
      label: 'Interpretation',
      title: 'Evidence converges.',
      body: 'Sequence, protein, population and curated knowledge are weighed together under published frameworks, and the reasoning behind the result is recorded.',
      caption: 'weighted convergence',
    },
  ] satisfies ResearchStage[],
  pillars: [
    {
      index: '01',
      title: 'Genomic representation',
      question: 'How should sequences and variants be represented so that computation preserves their biological meaning?',
      brief: 'How should sequences and variants be represented so that computation preserves their biological meaning?',
      body: 'A variant means different things depending on its gene, transcript, protein context and population background. This pillar studies how to encode that context consistently, and how to keep representations honest when parts of the picture are missing.',
      directions: ['Consistent, normalised variant description', 'Sequence and protein context as first-class inputs', 'Representing absence and uncertainty explicitly'],
      status: 'active',
    },
    {
      index: '02',
      title: 'Multimodal biological modelling',
      question: 'How can different sources of biological information be combined?',
      brief: 'How can sequence, structure, expression, conservation and population information be combined?',
      body: 'Sequence, structure, expression, conservation and population data each describe a different facet of a variant. This pillar explores how to combine such sources so that the whole is more informative than any single model.',
      directions: ['Combining sequence, protein and population evidence', 'Assessing agreement and disagreement between models', 'Understanding what each modality can and cannot tell us'],
      status: 'active',
    },
    {
      index: '03',
      title: 'Variant interpretation',
      question: 'How can genomic variation be connected to potential biological consequences?',
      brief: 'How can computational evidence be connected to potential biological consequences?',
      body: 'Interpretation is where evidence becomes a conclusion. This pillar focuses on combining computational estimates with curated knowledge under established frameworks, and on making every step of that reasoning traceable.',
      directions: ['Evidence aggregation under published interpretation standards', 'Provenance: recording which evidence supported which conclusion', 'Reporting confidence and its limits'],
      status: 'active',
    },
    {
      index: '04',
      title: 'Predictive biological systems',
      question: 'Can computational models generate useful biological predictions and hypotheses?',
      brief: 'Can computational models generate useful biological predictions and hypotheses?',
      body: 'Beyond interpreting known variation, GEPER is interested in whether models of biological sequence can propose hypotheses worth testing. This is a longer-term direction that depends on the foundations above.',
      directions: ['Hypothesis generation from sequence models', 'Prioritising variants and genes for further study', 'Evaluating predictions against independent evidence'],
      status: 'planned',
    },
  ] satisfies Pillar[],
} as const;

/* ------------------------------------------------------------ PLATFORM */

export const platform = {
  eyebrow: 'Platform',
  headline: 'A computational genomics system, built in layers.',
  lead: 'The platform carries biological data through representation, modelling and interpretation. It is in development and not publicly available today.',
  product: {
    name: 'Bij AI',
    status: 'in-development' as Status,
    tagline: 'Genomic variant intelligence, built for review.',
    what: 'It places each variant in biological and population context, gathers computational and curated evidence, and shows the reasoning behind every interpretation. The final judgement stays with qualified experts.',
    who: ['Clinical genomics and diagnostic laboratories', 'Academic and translational research groups', 'Biotech and pharmaceutical R&D teams'],
    statusFlags: ['In development', 'Not publicly available', 'Not clinically validated'],
    availabilityNote: 'Bij AI is currently in development and will be available to the world soon.',
  },
} as const;

/* --------------------------------------------------------------- ABOUT */

export const about = {
  eyebrow: 'About GEPER',
  headline: 'Building the Future of Genomic Intelligence.',
  lead: 'GEPER is a deep-tech company working at the intersection of genomics, computation and artificial intelligence. We are early, we are building from Chennai, India, and we are building for the long term.',

  why: {
    eyebrow: 'Why we exist',
    statement: 'Genomes are being read far faster than they can be understood.',
    paragraphs: [
      'Sequencing stopped being the hard part. Interpretation did not. The distance between a genome that has been read and a genome that has been understood is where the field now loses most of its value — and it is the distance GEPER exists to close.',
      'That is not a feature or a release. It is a decade-long scientific problem, and we are building a company shaped to work on it for that long.',
    ],
  },

  principles: [
    {
      index: '01',
      title: 'Scientific rigour',
      body: 'We hold claims to the standard of evidence rather than the standard of demonstration. Where something cannot be assessed, we say so instead of quietly leaving it out.',
    },
    {
      index: '02',
      title: 'Clarity over hype',
      body: 'We describe what our systems do and what they do not. A result that cannot show the reasoning behind it is not a result, and we would rather report uncertainty than hide it.',
    },
    {
      index: '03',
      title: 'Responsible innovation',
      body: 'This work touches people’s lives. Expert judgement stays human: what we build is designed to support qualified reviewers, never to stand in for them.',
    },
    {
      index: '04',
      title: 'Long-term thinking',
      body: 'We build on public science, open models and published standards, and we credit them. We would rather be right later than loud now.',
    },
  ],

  ambition: {
    eyebrow: 'Our ambition',
    title: 'To make biology legible to computation, and computation answerable to biology.',
    paragraphs: [
      'Both halves of that sentence matter. Biology has to be represented in a form computation can genuinely reason about; computation has to stay accountable to the biology it claims to explain. Most of the field is set up to do one or the other.',
      'Our ambition is to be a company that can hold both at once — and, over time, one of the places where genomic intelligence is built, with the scientific standards, engineering discipline and patience that requires.',
    ],
  },

  longView: {
    eyebrow: 'The long view',
    statement: 'We are building for what comes next in biology.',
    body: 'If that is the kind of problem you work on — as a researcher, a clinician, a partner or an engineer — we would like to hear from you.',
    cta: 'Contact GEPER',
  },
} as const;

/* ------------------------------------------------------------- CONTACT */

export const contact = {
  eyebrow: 'Contact',
  headline: 'Start a conversation about genomics, computation and AI.',
  lead: 'Whether you are exploring a research collaboration, want to understand the platform, or have a question about GEPER, we would like to hear from you.',
  categories: [
    { value: 'research', label: 'Research collaboration' },
    { value: 'platform', label: 'Platform / Bij AI discussion' },
    { value: 'data', label: 'Data partnership' },
    { value: 'press', label: 'Press and media' },
    { value: 'general', label: 'General enquiry' },
  ],
} as const;
