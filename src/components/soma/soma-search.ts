/**
 * SOMA word lookup.
 *
 * Deliberately simple and deterministic: the visitor's words are matched against the keywords,
 * question text and topic of the written entries. It never answers on its own and never guesses
 * what a sentence means — the interface only ever offers matching entries for the visitor to choose.
 */
import type { SomaEntry, SomaTopic } from '../../data/soma-faq.ts';

/** Words that carry no meaning for matching. */
const STOP = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'be', 'of', 'to', 'and', 'or', 'in', 'on', 'for', 'at', 'with',
  'do', 'does', 'did', 'can', 'could', 'i', 'we', 'you', 'it', 'me', 'my', 'our', 'your', 'us',
  'how', 'what', 'who', 'why', 'when', 'where', 'which', 'about', 'tell', 'please', 'hi', 'hello',
]);

/** Lower-cased words of a phrase, punctuation removed, stop words dropped. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w));
}

/**
 * How well a typed word matches a written word: 2 for the same word, 1 for the same word in another
 * form ("collaborate" ~ "collaborating", which must share a long common beginning), 0 for neither.
 * Short words must match exactly.
 */
function match(token: string, word: string): 0 | 1 | 2 {
  if (token === word) return 2;
  if (token.length < 5 || word.length < 5) return 0;
  let shared = 0;
  while (shared < token.length && shared < word.length && token[shared] === word[shared]) shared++;
  return shared >= 5 && shared >= Math.ceil(Math.min(token.length, word.length) * 0.8) ? 1 : 0;
}

/** The best match of a typed word against a list of written words. */
const best = (token: string, list: string[]) => list.reduce<0 | 1 | 2>((m, w) => (m === 2 ? m : (Math.max(m, match(token, w)) as 0 | 1 | 2)), 0);

const MAX_RESULTS = 3;

/** How much each kind of match is worth. A word written for the entry outranks one that only fits its topic. */
const WEIGHT = { keyword: 4, topic: 3, question: 2 } as const;

/**
 * Entries that match the visitor's words, best first. Empty when nothing in the notebook fits —
 * the caller must then say so rather than offer an unrelated answer.
 *
 * An entry is offered only when most of what the visitor typed is accounted for, and either a
 * word was a keyword written for that entry (or its topic) or at least two words matched. One
 * stray word ("today" in "what is the weather today") is not enough.
 */
export function findEntries(query: string, entries: readonly SomaEntry[], topics: readonly SomaTopic[]): SomaEntry[] {
  const tokens = [...new Set(words(query))];
  if (!tokens.length) return [];

  const topicWords = new Map(topics.map((t) => [t.id, [...t.keywords, t.title].flatMap(words)]));

  const scored = entries.map((entry, order) => {
    const keyword = entry.keywords.flatMap(words);
    const question = words(entry.question);
    const topic = topicWords.get(entry.topic) ?? [];
    let score = 0;
    let matched = 0;
    for (const token of tokens) {
      let m: 0 | 1 | 2;
      if ((m = best(token, keyword))) score += WEIGHT.keyword + (m === 2 ? 0.5 : 0);
      else if ((m = best(token, topic))) score += WEIGHT.topic + (m === 2 ? 0.5 : 0);
      else if ((m = best(token, question))) score += WEIGHT.question + (m === 2 ? 0.5 : 0);
      else continue;
      matched++;
    }
    return { entry, score, matched, order };
  });

  return scored
    .filter((s) => (s.score >= WEIGHT.topic || s.matched >= 2) && s.matched / tokens.length > 0.5)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, MAX_RESULTS)
    .map((s) => s.entry);
}
