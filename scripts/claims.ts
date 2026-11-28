/**
 * Claims validation — the single source of the site's rules about what its copy may say.
 *
 * Used by scripts/verify-dist.mjs (every built page, and SOMA's FAQ data) and tested in
 * test/claims.test.ts. The rules themselves are unchanged from when they lived inside
 * verify-dist.mjs; this file only makes them reusable.
 */

/** Claims that must not exist in production copy. */
export const FORBIDDEN_CLAIMS: Array<[RegExp, string]> = [
  [/\bHIPAA\b/i, 'HIPAA claim'],
  [/\bGDPR[- ]compliant\b/i, 'GDPR compliance claim'],
  [/\bcompliant\b/i, 'compliance claim'],
  [/\bencrypt(ed|ion)\b/i, 'encryption claim'],
  [/\bGraphQL\b/i, 'API claim (GraphQL)'],
  [/\bRESTful\b/i, 'API claim (RESTful)'],
  [/\b(LIMS|EHR)\b/, 'integration claim (LIMS/EHR)'],
  [/\bpetabyte/i, 'scale claim'],
  [/\bmicrosecond/i, 'latency claim'],
  [/\bproprietary (neural|dataset|data|model|AI)/i, 'proprietary technology/data claim'],
  [/\bprotein folding\b/i, 'protein-folding claim'],
  [/\bclinically validated\b(?!\.| and)/i, 'clinical validation claim (allowed only in negation)'],
  [/\bFDA[- ](approved|cleared)\b/i, 'regulatory claim'],
  [/\bCE[- ]marked\b/i, 'regulatory claim'],
  [/\bcertified medical device\b(?!\.)/i, 'device claim (allowed only in negation)'],
  [/\bcoming soon\b/i, 'vague "coming soon" copy'],
  [/\bavailable\b[^.]{0,60}\bsoon\b/i, 'vague availability-date copy ("available … soon")'],
  [/\bSystems Operational\b/i, 'fake live status'],
  [/\bGlobal (HQ|Headquarters)\b/i, 'fake HQ claim'],
  [/\bwet[- ]lab\b/i, 'wet-lab claim'],
  [/\bsynthetic biology\b/i, 'synthetic-biology claim'],
  [/\b\d{1,3}\s?(of|\/)\s?\d{1,3}\s+(ACMG|criteria)\b/i, 'criterion count'],
  [/\b(AlphaMissense|SpliceBERT|SpliceFormer|HyenaDNA|Enformer|Borzoi|ESM-?2|RNA-FM|MMSplice|Evo ?2)\b/, 'specific model-integration claim'],
  [/\b(gnomAD|ClinVar|ClinGen|dbSNP|UniProt|InterPro|Orphanet|MaveDB)\b/, 'specific database-integration claim'],
  [/\b(FreeBayes|BWA|FASTQ|BAM|CRAM|VCF)\b/, 'pipeline implementation detail'],
  [/\b\d+(\.\d+)?\s?%/, 'percentage figure (benchmark/validation numbers are not allowed)'],
];

/** Negation phrases that are explicitly allowed in copy (page text and SOMA alike). */
export const ALLOWED_PHRASES: RegExp[] = [
  /not (been )?clinically validated/i,
  /is not a certified medical device/i,
  /not clinically validated/i,
];

/**
 * Terminology GEPER has approved for SOMA's FAQ answers, and only for them.
 *
 * Some of these names trip the rules above (they name specific models, databases and file formats),
 * and the approved answers use them on purpose. Each is allowed explicitly and by exact name, so a
 * new term, or any other kind of claim, still fails the build. They are NOT allowed in page text:
 * the pages are still checked against every rule with no exceptions.
 *
 * Adding a term here is a content decision for GEPER, not a build fix.
 */
export const SOMA_APPROVED_TERMS: Array<{ term: string; re: RegExp }> = [
  // Named in GEPER's instruction (alongside the product names "Clinical Platform" and
  // "Genomic Expert Platform", which no rule matches and so need no entry):
  { term: 'FASTQ', re: /\bFASTQ\b/g },
  { term: 'HyenaDNA', re: /\bHyenaDNA\b/g },
  { term: 'ClinVar', re: /\bClinVar\b/g },
  // Used in the same approved answers. Approved by GEPER on 2026-11-28, on the same footing:
  { term: 'VCF', re: /\bVCF\b/g },
  { term: 'ESM-2', re: /\bESM-2\b/g },
  { term: 'RNA-FM', re: /\bRNA-FM\b/g },
  { term: 'AlphaMissense', re: /\bAlphaMissense\b/g },
  { term: 'gnomAD', re: /\bgnomAD\b/g },
];

export interface ClaimHit {
  label: string;
  match: string;
}

/** Every forbidden claim in `text`. With `approvedTerms`, those exact terms are set aside first. */
export function scanClaims(text: string, opts: { approvedTerms?: typeof SOMA_APPROVED_TERMS } = {}): ClaimHit[] {
  let t = text;
  for (const a of ALLOWED_PHRASES) t = t.replace(a, ' ');
  for (const { re } of opts.approvedTerms ?? []) t = t.replace(re, ' ');
  const hits: ClaimHit[] = [];
  for (const [re, label] of FORBIDDEN_CLAIMS) {
    const all = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    for (const m of t.matchAll(all)) hits.push({ label, match: m[0] });
  }
  return hits;
}
