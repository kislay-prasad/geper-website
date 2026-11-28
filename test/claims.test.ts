/**
 * Tests for the claims rules (scripts/claims.ts), which the build applies to every built page and,
 * with GEPER's approved terminology set aside, to SOMA's lazy-loaded FAQ data.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanClaims, SOMA_APPROVED_TERMS, FORBIDDEN_CLAIMS } from '../scripts/claims.ts';
import { somaEntries, somaTopics, somaCopy } from '../src/data/soma-faq.ts';

const approved = SOMA_APPROVED_TERMS;
const labels = (text: string, withApproved = false) => scanClaims(text, withApproved ? { approvedTerms: approved } : {}).map((h) => h.match);

/** Everything SOMA shows a visitor. */
const somaText = (): string[] => [
  ...somaEntries.flatMap((e) => [e.question, e.answer.join(' '), ...(e.links ?? []).map((l) => l.label)]),
  ...somaTopics.map((t) => `${t.title} ${t.hint}`),
  ...Object.values(somaCopy).map((v) => (typeof v === 'function' ? v('Topic') : [v].flat().join(' '))),
];

test('the original rule set is intact', () => {
  assert.equal(FORBIDDEN_CLAIMS.length, 26);
});

test('page text is checked with no exceptions: approved terms still fail there', () => {
  for (const { term } of approved) {
    assert.ok(labels(`Our system uses ${term} today.`).includes(term), `${term} must still be flagged in page text`);
  }
});

test('the approved terminology passes in SOMA’s text', () => {
  const all = approved.map((a) => a.term).join(', ');
  assert.deepEqual(labels(`Terms: ${all}.`, true), []);
});

test('an approved term does not hide a neighbouring unapproved one', () => {
  assert.deepEqual(labels('HyenaDNA and Enformer', true), ['Enformer']);
  assert.deepEqual(labels('ClinVar, UniProt and gnomAD', true), ['UniProt']);
  assert.deepEqual(labels('FASTQ, BAM and VCF', true), ['BAM']);
});

test('every other kind of claim still fails in SOMA’s text', () => {
  const bad = [
    'GEPER is HIPAA compliant.',
    'BIJ AI is marked as Coming Soon.',
    'The platform is FDA approved.',
    'It reaches 97% accuracy.',
    'Our data is encrypted.',
    'BIJ AI is available soon.',
    'We use SpliceBERT.',
    'Variants come from dbSNP.',
    'The pipeline uses BWA.',
  ];
  for (const text of bad) assert.ok(labels(text, true).length > 0, `should be flagged: ${text}`);
});

test('negated validation wording stays allowed, as before', () => {
  assert.deepEqual(labels('BIJ AI has not been clinically validated.', true), []);
});

test('SOMA’s approved FAQ text passes the rules with only the approved terminology set aside', () => {
  const failures = somaText().flatMap((t) => scanClaims(t, { approvedTerms: approved }).map((h) => `${h.match} (${h.label})`));
  assert.deepEqual(failures, []);
});

test('every approved term is actually used by SOMA (the allowance does not outgrow the content)', () => {
  const text = somaText().join(' ');
  for (const { term } of approved) assert.ok(new RegExp(`\\b${term}\\b`).test(text), `${term} is allowed but no longer used: remove it from SOMA_APPROVED_TERMS`);
});

test('without the allowance, SOMA’s text is flagged for exactly the approved terms and nothing else', () => {
  const flagged = new Set(somaText().flatMap((t) => labels(t)));
  assert.deepEqual([...flagged].sort(), approved.map((a) => a.term).sort());
});

test('"Coming Soon" no longer appears in SOMA', () => {
  assert.ok(!somaText().some((t) => /coming soon/i.test(t)));
});

test('BIJ AI is spelled consistently in SOMA', () => {
  assert.ok(!somaText().some((t) => /\bBij AI\b/.test(t)));
});
