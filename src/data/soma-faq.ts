/**
 * SOMA by GEPER — FAQ content.
 *
 * Everything SOMA says lives in this file; the interface (src/components/soma/) contains no
 * answers. SOMA is a fixed list of questions and answers, not an AI assistant: nothing here is
 * generated, and nothing is looked up elsewhere.
 *
 * The 20 questions and answers below are GEPER's approved initial FAQ content, entered as supplied.
 * Do not reword an answer, or add a claim, without GEPER's approval.
 *
 * To change content: edit this file only. Keep each `id` stable and unique; `followUps` must name
 * other entries' ids (test/soma.test.ts enforces both). `keywords` are the words a visitor might
 * type to find an entry. Mark a new entry `draft: true` until its wording is approved, and the
 * notebook will say so beside it.
 */

export interface SomaTopic {
  id: string;
  title: string;
  /** One short line shown under the topic title. */
  hint: string;
  /** Extra words that should lead a typed search to this topic's entries. */
  keywords: string[];
}

export interface SomaLink {
  label: string;
  /** Internal path ("/research") or a full URL. */
  href: string;
}

export interface SomaEntry {
  id: string;
  /** A topic's `id`. */
  topic: string;
  question: string;
  /** Answer paragraphs, plain text. */
  answer: string[];
  /** Words and short phrases a visitor might type to find this entry. */
  keywords: string[];
  /** Ids of related entries, offered after the answer (2–3 reads best). */
  followUps: string[];
  /** Optional pages to point the visitor to after the answer. */
  links?: SomaLink[];
  /** True while the wording is awaiting approval. */
  draft?: boolean;
}

/** Interface copy that is spoken by SOMA itself. */
export const somaCopy = {
  welcome: ['Hello, I’m SOMA, GEPER’s FAQ notebook.'],
  topicsPrompt: 'Choose a topic to begin:',
  questionsPrompt: (topicTitle: string) => `Questions about ${topicTitle}:`,
  relatedPrompt: 'You may also want to read:',
  searchPrompt: 'These entries may help. Choose one:',
  noMatch:
    'I don’t have an entry for that. I can only answer the questions written in this notebook, so please choose a topic below, or contact GEPER directly.',
  draftNote: 'Draft entry: the wording has not been approved yet.',
  contactPrompt: 'Not what you needed? Contact GEPER:',
  contactLead: 'For anything not covered here, write to GEPER and the team will reply.',
  inputLabel: 'Look up a word in the notebook',
  inputPlaceholder: 'Type a word, e.g. research',
  inputHint: 'SOMA matches your words to its written questions. It does not interpret free-form questions.',
} as const;

export const somaTopics: SomaTopic[] = [
  { id: 'about', title: 'About GEPER', hint: 'Who we are', keywords: ['geper', 'company', 'about'] },
  { id: 'bij', title: 'BIJ AI', hint: 'Our interpretation engine', keywords: ['bij', 'engine'] },
  { id: 'technology', title: 'Technology and Research', hint: 'Methods and research areas', keywords: ['technology', 'technical', 'tech', 'research', 'science'] },
  { id: 'clinical', title: 'Clinical Platform', hint: 'Hospital-facing software', keywords: ['clinical', 'platform'] },
  { id: 'partnerships', title: 'Partnerships and Contact', hint: 'Working with GEPER', keywords: ['partnership', 'partnerships', 'partner', 'contact', 'collaboration'] },
];

export const somaEntries: SomaEntry[] = [
  /* ------------------------------------------------------------ About GEPER */
  {
    id: 'about-what',
    topic: 'about',
    question: 'What is GEPER?',
    answer: [
      'GEPER (Genomic Expert Platform) is a biotechnology-focused platform being developed to support genomic data analysis, interpretation, and research. Its goal is to bring computational genomics, bioinformatics, and advanced computational methods together in a structured platform.',
    ],
    keywords: ['geper', 'company', 'platform', 'genomic expert platform', 'biotechnology', 'introduction'],
    followUps: ['about-name', 'about-mission', 'bij-what'],
  },
  {
    id: 'about-name',
    topic: 'about',
    question: 'What does GEPER stand for?',
    answer: [
      'GEPER stands for Genomic Expert Platform. The name represents our vision of making genomic analysis and interpretation more accessible through an integrated computational platform.',
    ],
    keywords: ['stand', 'stands', 'name', 'acronym', 'abbreviation', 'meaning', 'genomic expert platform'],
    followUps: ['about-what', 'about-problem', 'about-mission'],
  },
  {
    id: 'about-problem',
    topic: 'about',
    question: 'What problem is GEPER trying to solve?',
    answer: [
      'Genomic analysis involves multiple stages, tools, datasets, and sources of scientific evidence. GEPER aims to organize these complex processes into a more structured workflow, helping researchers and clinical organizations work with genomic information more efficiently.',
    ],
    keywords: ['problem', 'solve', 'solving', 'challenge', 'why', 'workflow', 'complex', 'tools', 'datasets', 'evidence'],
    followUps: ['about-mission', 'bij-what', 'tech-pipeline'],
  },
  {
    id: 'about-mission',
    topic: 'about',
    question: 'What is the mission of GEPER?',
    answer: [
      'Our mission is to advance genomic research and computational biotechnology by developing accessible, structured, and evidence-oriented technologies that support better understanding of genomic data.',
    ],
    keywords: ['mission', 'vision', 'goal', 'goals', 'purpose', 'aim', 'objective'],
    followUps: ['about-problem', 'about-audience', 'tech-research'],
  },
  {
    id: 'about-audience',
    topic: 'about',
    question: 'Who can benefit from GEPER?',
    answer: [
      'GEPER is being developed with researchers, biotechnology professionals, genomic laboratories, healthcare organizations, and institutions working with genomic data in mind.',
    ],
    keywords: ['benefit', 'benefits', 'users', 'audience', 'customers', 'researchers', 'professionals', 'laboratories', 'healthcare', 'institutions'],
    followUps: ['clinical-who', 'partner-institutions', 'partner-contact'],
  },

  /* ----------------------------------------------------------------- BIJ AI */
  {
    id: 'bij-what',
    topic: 'bij',
    question: 'What is BIJ AI?',
    answer: [
      'BIJ AI is GEPER’s genomic interpretation engine. It is being developed to bring together genomic analysis, biological context, scientific evidence, and computational methods within a structured interpretation workflow.',
    ],
    keywords: ['bij', 'bij ai', 'engine', 'interpretation', 'genomic interpretation', 'introduction'],
    followUps: ['bij-how', 'bij-different', 'bij-availability'],
  },
  {
    id: 'bij-how',
    topic: 'bij',
    question: 'How does BIJ AI work?',
    answer: [
      'The planned workflow begins with raw sequencing data in FASTQ format. Computational processing and analysis take place upstream, with variant data such as VCF generated downstream. The interpretation workflow then brings together relevant annotations, databases, and evidence to support genomic interpretation.',
    ],
    keywords: ['work', 'works', 'working', 'workflow', 'process', 'steps', 'fastq', 'vcf', 'sequencing', 'annotations'],
    followUps: ['bij-formats', 'tech-pipeline', 'bij-what'],
  },
  {
    id: 'bij-different',
    topic: 'bij',
    question: 'What makes BIJ AI different?',
    answer: [
      'BIJ AI is being developed as part of a broader genomic platform rather than as an isolated prediction tool. Its approach focuses on connecting genomic data processing, evidence gathering, variant interpretation, and reporting within a structured workflow.',
    ],
    keywords: ['different', 'difference', 'unique', 'special', 'compare', 'comparison', 'approach', 'isolated', 'prediction', 'advantage'],
    followUps: ['bij-what', 'tech-pipeline', 'tech-technologies'],
  },
  {
    id: 'bij-formats',
    topic: 'bij',
    question: 'Which data formats does BIJ AI work with?',
    answer: [
      'The intended upstream workflow begins with FASTQ sequencing data. VCF is used downstream for variant representation and interpretation. The exact supported formats and processing capabilities depend on the implemented pipeline version.',
    ],
    keywords: ['format', 'formats', 'data', 'files', 'file', 'input', 'supported', 'fastq', 'vcf'],
    followUps: ['bij-how', 'tech-pipeline', 'bij-availability'],
  },
  {
    id: 'bij-availability',
    topic: 'bij',
    question: 'Is BIJ AI available to the public?',
    answer: [
      'BIJ AI is currently in development and not publicly available. GEPER will share availability and access information through its official website when it is ready.',
    ],
    keywords: ['available', 'availability', 'public', 'launch', 'release', 'access', 'soon', 'when', 'use', 'try', 'demo'],
    followUps: ['bij-what', 'partner-contact', 'clinical-what'],
  },

  /* ------------------------------------------------ Technology and Research */
  {
    id: 'tech-technologies',
    topic: 'technology',
    question: 'What technologies does GEPER work with?',
    answer: [
      'GEPER’s technical direction includes bioinformatics pipelines, computational genomics, machine learning, deep learning, genomic databases, and evidence-based variant interpretation methods.',
    ],
    keywords: ['technologies', 'technology', 'tools', 'stack', 'bioinformatics', 'machine learning', 'deep learning', 'databases', 'computational genomics'],
    followUps: ['tech-models', 'tech-pipeline', 'tech-research'],
  },
  {
    id: 'tech-models',
    topic: 'technology',
    question: 'Which genomic and AI models does GEPER explore?',
    answer: [
      'GEPER has explored models and research tools including DNABERT-2, HyenaDNA, Nucleotide Transformer, ESM-2, RNA-FM, and AlphaMissense. These technologies have different roles in DNA, RNA, protein, and variant-related research. Their exploration should not be interpreted as a claim that every model is deployed in BIJ AI.',
    ],
    keywords: ['models', 'model', 'ai models', 'explore', 'dnabert', 'hyenadna', 'nucleotide transformer', 'esm', 'rna-fm', 'alphamissense', 'language models'],
    followUps: ['tech-technologies', 'tech-research', 'bij-what'],
  },
  {
    id: 'tech-pipeline',
    topic: 'technology',
    question: 'How does GEPER’s genomic pipeline work?',
    answer: [
      'The intended workflow connects sequencing data processing with downstream genomic analysis. After upstream processing and variant calling, variants can move through annotation, evidence gathering using resources such as ClinVar and gnomAD, ACMG/AMP-oriented assessment, pharmacogenomic analysis, and reporting. The exact stages available depend on the current pipeline implementation.',
    ],
    keywords: ['pipeline', 'genomic pipeline', 'stages', 'annotation', 'variant calling', 'clinvar', 'gnomad', 'acmg', 'amp', 'pharmacogenomic', 'pharmacogenomics', 'reporting'],
    followUps: ['bij-how', 'tech-models', 'clinical-what'],
  },
  {
    id: 'tech-research',
    topic: 'technology',
    question: 'What are GEPER’s research areas?',
    answer: [
      'GEPER’s research direction includes computational genomics, genomic language models, DNA and RNA analysis, protein-level analysis, variant interpretation, and the application of computational methods to biotechnology.',
    ],
    keywords: ['research', 'research areas', 'areas', 'focus', 'topics', 'computational genomics', 'language models', 'dna', 'rna', 'protein', 'variant interpretation'],
    followUps: ['tech-technologies', 'tech-models', 'partner-researchers'],
  },

  /* ------------------------------------------------------ Clinical Platform */
  {
    id: 'clinical-what',
    topic: 'clinical',
    question: 'What is the GEPER Clinical Platform?',
    answer: [
      'The GEPER Clinical Platform is the hospital-facing software interface being developed to organize clinical genomic workflows. Its planned workflow includes patient records, test orders, sample tracking, quality control, interpretation, review, and reporting.',
    ],
    keywords: ['clinical', 'clinical platform', 'hospital', 'hospitals', 'patient', 'records', 'orders', 'sample tracking', 'quality control', 'software', 'interface'],
    followUps: ['clinical-who', 'bij-what', 'partner-hospital-lab'],
  },
  {
    id: 'clinical-who',
    topic: 'clinical',
    question: 'Who can use the GEPER Clinical Platform?',
    answer: [
      'The platform is being designed for healthcare organizations and authorized professionals involved in genomic testing workflows, including clinical teams and laboratory personnel. Access will depend on the platform’s release and organization onboarding.',
    ],
    keywords: ['users', 'use', 'access', 'authorized', 'authorised', 'onboarding', 'healthcare', 'clinical teams', 'laboratory personnel', 'professionals'],
    followUps: ['clinical-what', 'partner-hospital-lab', 'partner-contact'],
  },

  /* ------------------------------------------------ Partnerships and Contact */
  {
    id: 'partner-institutions',
    topic: 'partnerships',
    question: 'Does GEPER work with hospitals and laboratories?',
    answer: [
      'GEPER is interested in engaging with hospitals, diagnostic laboratories, research institutions, and biotechnology organizations to explore opportunities in genomic technology and research collaboration.',
    ],
    keywords: ['work', 'working', 'diagnostic', 'engage', 'engaging', 'organizations', 'research institutions', 'biotechnology'],
    followUps: ['partner-hospital-lab', 'partner-researchers', 'partner-contact'],
  },
  {
    id: 'partner-hospital-lab',
    topic: 'partnerships',
    question: 'How can a hospital or laboratory partner with GEPER?',
    answer: [
      'Hospitals and laboratories interested in exploring a collaboration can contact GEPER through the official website or email contact@geper.in. Our team can discuss the organization’s requirements and potential areas of collaboration.',
    ],
    keywords: ['partner', 'partnership', 'hospital', 'laboratory', 'collaborate', 'collaboration', 'requirements'],
    followUps: ['partner-institutions', 'clinical-what', 'partner-contact'],
  },
  {
    id: 'partner-researchers',
    topic: 'partnerships',
    question: 'Can researchers or institutions collaborate with GEPER?',
    answer: [
      'Yes. GEPER welcomes conversations with researchers, academic institutions, and biotechnology organizations interested in computational genomics, bioinformatics, and related research. Contact us with a brief description of your research interests and proposed collaboration.',
    ],
    keywords: ['researchers', 'researcher', 'academic', 'university', 'institutions', 'collaborate', 'collaboration', 'research interests', 'proposal'],
    followUps: ['tech-research', 'partner-institutions', 'partner-contact'],
  },
  {
    id: 'partner-contact',
    topic: 'partnerships',
    question: 'How can I contact GEPER?',
    answer: [
      'You can reach GEPER through the contact form on our official website or by emailing contact@geper.in. For collaboration, institutional inquiries, or general questions, please include a brief description of your request so the appropriate team can respond.',
    ],
    keywords: ['contact', 'email', 'reach', 'form', 'inquiry', 'enquiry', 'write', 'message', 'get in touch', 'question', 'questions'],
    followUps: ['partner-institutions', 'about-what', 'bij-availability'],
  },
];
