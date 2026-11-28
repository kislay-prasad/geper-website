/**
 * Tests for SOMA's content and word lookup (src/data/soma-faq.ts, src/components/soma/soma-search.ts).
 * The interface itself is exercised in a browser; these keep the data and matching honest.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { somaEntries, somaTopics, somaCopy } from '../src/data/soma-faq.ts';
import { findEntries, words } from '../src/components/soma/soma-search.ts';

/* ------------------------------------------------------------------ content */

test('the approved FAQ is complete: 20 entries across 5 topics', () => {
  assert.equal(somaEntries.length, 20);
  const count = (topic: string) => somaEntries.filter((e) => e.topic === topic).length;
  assert.deepEqual(somaTopics.map((t) => [t.id, count(t.id)]), [
    ['about', 5],
    ['bij', 5],
    ['technology', 4],
    ['clinical', 2],
    ['partnerships', 4],
  ]);
});

test('the approved wording has not been changed', () => {
  // A fingerprint of every question and answer. If this fails, someone edited approved content:
  // get GEPER's approval for the new wording, then update the fingerprint deliberately.
  const text = somaEntries.map((e) => `${e.id}\n${e.question}\n${e.answer.join('\n')}`).join('\n---\n');
  const fingerprint = createHash('sha256').update(text).digest('hex').slice(0, 16);
  assert.equal(fingerprint, '29d13abff00d94dc');
});

test('no entry is still a draft or a placeholder', () => {
  for (const e of somaEntries) {
    assert.ok(!e.draft, `${e.id}: still marked draft`);
    assert.ok(!e.answer.some((p) => /placeholder|lorem|todo|tbd/i.test(p)), `${e.id}: placeholder wording`);
  }
});

test('every entry has a unique id, a known topic, a question and an answer', () => {
  const ids = new Set<string>();
  const topics = new Set(somaTopics.map((t) => t.id));
  for (const e of somaEntries) {
    assert.ok(!ids.has(e.id), `duplicate entry id: ${e.id}`);
    ids.add(e.id);
    assert.ok(topics.has(e.topic), `${e.id}: unknown topic "${e.topic}"`);
    assert.ok(e.question.trim().endsWith('?'), `${e.id}: question should end with "?"`);
    assert.ok(e.answer.length > 0 && e.answer.every((p) => p.trim()), `${e.id}: empty answer`);
    assert.ok(e.keywords.length > 0, `${e.id}: needs keywords so a typed word can find it`);
  }
});

test('questions are unique', () => {
  assert.equal(new Set(somaEntries.map((e) => e.question)).size, somaEntries.length);
});

test('topic ids are unique and every topic has at least one question', () => {
  const seen = new Set<string>();
  for (const t of somaTopics) {
    assert.ok(!seen.has(t.id), `duplicate topic id: ${t.id}`);
    seen.add(t.id);
    assert.ok(somaEntries.some((e) => e.topic === t.id), `topic "${t.id}" has no questions`);
  }
});

test('follow-ups point at real entries, never at themselves, and never repeat', () => {
  const ids = new Set(somaEntries.map((e) => e.id));
  for (const e of somaEntries) {
    assert.ok(e.followUps.length >= 2 && e.followUps.length <= 3, `${e.id}: offer 2–3 follow-ups`);
    assert.equal(new Set(e.followUps).size, e.followUps.length, `${e.id}: repeated follow-up`);
    for (const f of e.followUps) {
      assert.ok(ids.has(f), `${e.id}: follow-up "${f}" does not exist`);
      assert.notEqual(f, e.id, `${e.id}: follows up with itself`);
    }
  }
});

test('every entry can be reached by following links from the topics (nothing is orphaned)', () => {
  const reachable = new Set(somaEntries.map((e) => e.id)); // each is listed under its topic
  for (const e of somaEntries) assert.ok(reachable.has(e.id));
  const referenced = new Set(somaEntries.flatMap((e) => e.followUps));
  for (const e of somaEntries) assert.ok(referenced.has(e.id), `${e.id}: no other entry offers it as a follow-up`);
});

test('internal links point at pages that exist on the site', () => {
  const pages = new Set(['/', '/technology', '/research', '/platform', '/about', '/contact', '/privacy', '/terms']);
  for (const e of somaEntries) {
    for (const l of e.links ?? []) {
      if (l.href.startsWith('/')) assert.ok(pages.has(l.href), `${e.id}: link to unknown page ${l.href}`);
    }
  }
});

test('contact details in the answers match the site’s contact address', () => {
  const emails = new Set(somaEntries.flatMap((e) => e.answer.join(' ').match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? []));
  assert.deepEqual([...emails], ['contact@geper.in']);
});

test('SOMA introduces itself as GEPER’s FAQ notebook, and never as an AI assistant', () => {
  const welcome = somaCopy.welcome.join(' ');
  assert.match(welcome, /SOMA/);
  assert.match(welcome, /FAQ notebook/i);
  assert.doesNotMatch(welcome, /\bAI (assistant|chatbot)\b|\bI can (chat|help with anything)\b/i);
});

test('the interface still says plainly that it only answers its written questions', () => {
  assert.match(somaCopy.noMatch, /only answer the questions written in this notebook/i);
  assert.match(somaCopy.inputHint, /does not interpret free-form questions/i);
});

/* ------------------------------------------------------------------- lookup */

test('words() drops stop words and punctuation', () => {
  assert.deepEqual(words('What is BIJ AI?'), ['bij', 'ai']);
  assert.deepEqual(words('  How can we collaborate!  '), ['collaborate']);
  assert.deepEqual(words('???'), []);
});

test('every question, typed as written, finds its own entry first', () => {
  for (const e of somaEntries) {
    const found = findEntries(e.question, somaEntries, somaTopics);
    assert.equal(found[0]?.id, e.id, `"${e.question}" → ${found.map((f) => f.id).join(', ') || 'nothing'}`);
  }
});

test('every topic title, typed as written, finds entries in that topic', () => {
  for (const t of somaTopics) {
    const found = findEntries(t.title, somaEntries, somaTopics);
    assert.ok(found.length > 0, `"${t.title}" found nothing`);
    assert.ok(found.some((e) => e.topic === t.id), `"${t.title}" found no entry in its own topic`);
  }
});

test('natural single words lead to the right entry', () => {
  const first = (q: string) => findEntries(q, somaEntries, somaTopics)[0]?.id;
  const expect: Record<string, string> = {
    mission: 'about-mission',
    acronym: 'about-name',
    fastq: 'bij-how',
    available: 'bij-availability',
    alphamissense: 'tech-models',
    dnabert: 'tech-models',
    clinvar: 'tech-pipeline',
    gnomad: 'tech-pipeline',
    pharmacogenomics: 'tech-pipeline',
    onboarding: 'clinical-who',
    academic: 'partner-researchers',
    email: 'partner-contact',
  };
  for (const [word, id] of Object.entries(expect)) assert.equal(first(word), id, `"${word}"`);
});

test('a typed word offers at most three entries, best first', () => {
  const found = findEntries('collaboration', somaEntries, somaTopics);
  assert.ok(found.length > 0 && found.length <= 3);
  assert.ok(found.every((e) => e.topic === 'partnerships' || e.keywords.some((k) => /collaborat/.test(k))));
});

test('prefix matching catches simple word forms', () => {
  const found = findEntries('collaborating', somaEntries, somaTopics);
  assert.ok(found.some((e) => e.id === 'partner-hospital-lab' || e.id === 'partner-researchers'));
});

test('words that match nothing return nothing, rather than a guess', () => {
  assert.deepEqual(findEntries('pizza recipe', somaEntries, somaTopics), []);
  assert.deepEqual(findEntries('', somaEntries, somaTopics), []);
  assert.deepEqual(findEntries('the of and', somaEntries, somaTopics), []);
  assert.deepEqual(findEntries('what is the weather today', somaEntries, somaTopics), []);
  assert.deepEqual(findEntries('how much does it cost', somaEntries, somaTopics), []);
});

test('a single stray letter or very short word does not match by accident', () => {
  assert.deepEqual(findEntries('x', somaEntries, somaTopics), []);
  assert.deepEqual(findEntries('ab', somaEntries, somaTopics), []);
});
