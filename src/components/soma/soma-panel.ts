/**
 * SOMA by GEPER — the notebook interface.
 *
 * Loaded on demand the first time a visitor opens SOMA (see Soma.astro), so none of it — the
 * panel code, the FAQ data, the notebook stylesheet — is part of any page's first load.
 *
 * How it works: the visitor chooses topics and questions; SOMA writes the matching entry from
 * src/data/soma-faq.ts onto the page. Typing a word only finds written entries to choose from.
 * There is no network access, no storage of what the visitor reads or types, and no AI.
 *
 * Window states:
 *   open       the notebook is showing
 *   minimise   the notebook folds away and keeps its place; the launcher shows a small mark
 *   close      the notebook folds away and forgets the conversation
 */
/* The notebook's stylesheet travels inside this chunk as a string and is added to the page on first
   open. (A plain `import './soma.css'` would make Astro link the file from every page's <head>,
   putting it on the first-load critical path.) */
import notebookCss from './soma.css?inline';
import { somaCopy, somaEntries, somaTopics, type SomaEntry, type SomaTopic } from '../../data/soma-faq.ts';
import { site, pagePath } from '../../data/site.ts';
import { findEntries } from './soma-search.ts';
import { glyph, somaMarkImg, themeHelix } from './soma-mark.ts';

type Paper = 'light' | 'dark';

const PAPER_KEY = 'soma-paper';
const SMALL_SCREEN = '(max-width: 640px)';
const MAX_QUERY = 120;

/* The opening animation (public/brand/soma-intro.mp4, GEPER's approved artwork). It plays once per page
   view, can always be skipped, and never holds a visitor up: if it cannot start within a couple of
   seconds the notebook simply appears. Reduced-motion visitors do not see it and never download it. */
const INTRO_HOLD_MS = 700;   // stays on the finished wordmark for a beat
const INTRO_FADE_MS = 340;   // then dissolves into the notebook
const INTRO_START_MS = 2500; // give up if playback has not begun by now
const INTRO_MAX_MS = 6000;   // hard stop

const entryById = new Map(somaEntries.map((e) => [e.id, e]));

/* ------------------------------------------------------------------ dom helpers */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Inserts one of the constant SVG strings from soma-mark.ts. */
function icon(svg: string): HTMLSpanElement {
  const span = el('span');
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = svg; // constant markup only — never visitor text
  return span;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ----------------------------------------------------------------------- state */

interface Ui {
  launcher: HTMLButtonElement;
  panel: HTMLElement;
  paper: HTMLElement;
  flow: HTMLElement;
  input: HTMLInputElement;
  topicsBtn: HTMLButtonElement;
  contactSlot: HTMLElement;
  themeBtn: HTMLButtonElement;
  /** The parts of the notebook that are put out of reach while the introduction plays. */
  chrome: HTMLElement[];
  /** The opening animation; absent when it will not play (reduced motion, or already shown). */
  intro?: { stage: HTMLElement; video: HTMLVideoElement; skip: HTMLButtonElement; ready: Promise<string> };
}

let ui: Ui | null = null;
let touched = false;      // the visitor has done something beyond reading the welcome
let needsReset = false;   // closed (not minimised): start fresh next time
let savedOverflow: string | null = null;
let introStarted = false;  // the opening animation has been shown (or skipped) in this page view
let stopIntro: (() => void) | null = null;

/* ---------------------------------------------------------------------- paper */

function savedPaper(): Paper | null {
  try {
    const v = localStorage.getItem(PAPER_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null; // storage blocked: the choice simply lasts for this page view
  }
}

const sitePaper = (): Paper => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

function applyPaper(paper: Paper) {
  if (!ui) return;
  ui.panel.dataset.paper = paper;
  ui.themeBtn.setAttribute('aria-label', paper === 'dark' ? 'Switch to light paper' : 'Switch to dark paper');
}

function togglePaper() {
  if (!ui) return;
  const next: Paper = ui.panel.dataset.paper === 'dark' ? 'light' : 'dark';
  applyPaper(next);
  try {
    localStorage.setItem(PAPER_KEY, next);
  } catch {
    /* storage unavailable */
  }
}

/* -------------------------------------------------------------------- writing */

/** How much of the page above a newly written block stays in view (one grid square). */
const LEAD_IN = 24;

/** A line of writing. `tag` is the small label in the gutter; `sr` is spoken in its place. */
function row(text: string, opts: { kind?: 'user' | 'lead' | 'draft' | 'small'; tag?: string; sr?: string } = {}): HTMLParagraphElement {
  const p = el('p', `soma-row${opts.kind ? ` soma-row--${opts.kind}` : ''}`);
  if (opts.tag) {
    const tag = el('span', 'soma-tag', opts.tag);
    tag.setAttribute('aria-hidden', 'true');
    p.append(tag);
  }
  if (opts.sr) p.append(el('span', 'soma-sr', opts.sr));
  p.append(document.createTextNode(text));
  return p;
}

interface Choice {
  label: string;
  hint?: string;
  run: () => void;
}

/** A numbered list of choices written like entries in a notebook index. */
function choices(items: Choice[], label: string): HTMLOListElement {
  const list = el('ol', 'soma-opts');
  list.setAttribute('aria-label', label);
  for (const item of items) {
    const li = el('li');
    const btn = el('button', 'soma-opt');
    btn.type = 'button';
    btn.append(document.createTextNode(item.label));
    if (item.hint) btn.append(document.createTextNode(' '), el('span', 'soma-opt__hint', item.hint));
    btn.addEventListener('click', item.run);
    li.append(btn);
    list.append(li);
  }
  return list;
}

/** "Back to topics", written as an unnumbered entry. It is a retiring list like the numbered ones,
    so once the notebook moves on it stops being selectable. */
function backEntry(): HTMLUListElement {
  const list = el('ul', 'soma-opts soma-opts--bare');
  const li = el('li');
  const tag = el('span', 'soma-tag');
  tag.setAttribute('aria-hidden', 'true');
  tag.append(icon(glyph.back));
  const btn = el('button', 'soma-opt', 'Back to topics');
  btn.type = 'button';
  btn.addEventListener('click', showTopics);
  li.append(tag, btn);
  list.append(li);
  return list;
}

/** A line whose margin mark is a glyph rather than a number. */
function solo(tagGlyph: string, child: HTMLElement): HTMLDivElement {
  const wrap = el('div', 'soma-solo');
  const tag = el('span', 'soma-tag');
  tag.setAttribute('aria-hidden', 'true');
  tag.append(icon(tagGlyph));
  wrap.append(tag, child);
  return wrap;
}

const onContactPage = () => pagePath(location.pathname) === '/contact';

/** Where a visitor can reach GEPER. On the contact page itself the page link is left out, so a
    half-written message is never navigated away from. */
function contactLines(): HTMLElement[] {
  const lines: HTMLElement[] = [];
  if (onContactPage()) {
    lines.push(row('The contact form is on this page, just behind this notebook.', { kind: 'small' }));
  } else {
    const page = el('a', 'soma-opt', 'Open the contact page');
    page.setAttribute('href', '/contact');
    lines.push(solo(glyph.arrow, page));
  }
  const mail = el('a', 'soma-opt', site.contactEmail);
  mail.setAttribute('href', `mailto:${site.contactEmail}`);
  lines.push(solo(glyph.mail, mail));
  return lines;
}

/** Writes new blocks at the end of the page, retires the older choice lists, scrolls to the new
    writing and moves focus to `focusTarget` so keyboard and screen-reader users land on it. */
function write(blocks: HTMLElement[], focusTarget?: HTMLElement) {
  if (!ui) return;
  ui.flow.querySelectorAll('.soma-opts:not([inert])').forEach((list) => list.setAttribute('inert', ''));
  for (const block of blocks) ui.flow.append(block);

  const top = Math.max(0, blocks[0].offsetTop - LEAD_IN);
  ui.paper.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });
  if (focusTarget) {
    focusTarget.setAttribute('tabindex', '-1');
    focusTarget.focus({ preventScroll: true });
  }
  refreshFooter();
}

function block(...children: HTMLElement[]): HTMLDivElement {
  const b = el('div', 'soma-block');
  b.append(...children);
  return b;
}

/* -------------------------------------------------------------------- content */

const topicChoices = (): Choice[] =>
  somaTopics.map((t) => ({ label: t.title, hint: t.hint, run: () => chooseTopic(t) }));

function welcomeBlock(): { block: HTMLElement; focus: HTMLElement } {
  const [hello, ...rest] = somaCopy.welcome;
  const first = row(hello, { kind: 'lead' });
  return {
    block: block(first, ...rest.map((t) => row(t)), row(somaCopy.topicsPrompt, { kind: 'lead' }), choices(topicChoices(), 'Topics')),
    focus: first,
  };
}

function showTopics() {
  touched = true;
  const prompt = row(somaCopy.topicsPrompt, { kind: 'lead' });
  write([block(el('h3', 'soma-heading', 'Topics'), prompt, choices(topicChoices(), 'Topics'))], prompt);
}

function chooseTopic(topic: SomaTopic) {
  touched = true;
  const entries = somaEntries.filter((e) => e.topic === topic.id);
  const prompt = row(somaCopy.questionsPrompt(topic.title), { kind: 'lead' });
  write(
    [
      block(row(topic.title, { kind: 'user', tag: '→', sr: 'You chose: ' })),
      block(prompt, choices(entries.map((e) => ({ label: e.question, run: () => chooseEntry(e) })), `Questions about ${topic.title}`)),
    ],
    prompt,
  );
}

function chooseEntry(entry: SomaEntry) {
  touched = true;
  const answer = el('div', 'soma-answer');
  const lead = row(entry.answer[0] ?? '', { tag: 'A', sr: 'Answer: ' });
  answer.append(lead, ...entry.answer.slice(1).map((t) => row(t)));
  if (entry.draft) answer.append(row(somaCopy.draftNote, { kind: 'draft' }));
  for (const link of entry.links ?? []) {
    // The contact page link is skipped on the contact page itself (see contactLines).
    if (onContactPage() && pagePath(link.href) === '/contact') continue;
    const a = el('a', 'soma-opt', link.label);
    a.setAttribute('href', link.href);
    answer.append(solo(glyph.arrow, a));
  }

  const related = entry.followUps.map((id) => entryById.get(id)).filter((e): e is SomaEntry => !!e);
  const tail: HTMLElement[] = [];
  if (related.length) {
    tail.push(row(somaCopy.relatedPrompt, { kind: 'lead' }));
    tail.push(choices(related.map((e) => ({ label: e.question, run: () => chooseEntry(e) })), 'Related questions'));
  }
  tail.push(backEntry());

  write(
    [
      block(row(entry.question, { kind: 'user', tag: 'Q', sr: 'You asked: ' })),
      block(answer),
      block(...tail),
      block(row(somaCopy.contactPrompt, { kind: 'small' }), ...contactLines()),
    ],
    lead,
  );
}

function runSearch(raw: string) {
  touched = true;
  const query = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY);
  if (!query) return;
  const echo = block(row(`“${query}”`, { kind: 'user', tag: 'Q', sr: 'You typed: ' }));
  const found = findEntries(query, somaEntries, somaTopics);

  if (found.length) {
    const prompt = row(somaCopy.searchPrompt, { kind: 'lead' });
    write([echo, block(prompt, choices(found.map((e) => ({ label: e.question, run: () => chooseEntry(e) })), 'Matching questions'))], prompt);
    return;
  }
  const sorry = row(somaCopy.noMatch, { kind: 'lead' });
  write(
    [echo, block(sorry), block(choices(topicChoices(), 'Topics')), block(row(somaCopy.contactPrompt, { kind: 'small' }), ...contactLines())],
    sorry,
  );
}

/* --------------------------------------------------------------------- footer */

/** The footer's quick links: "Back to topics" only once there is somewhere to go back from. */
function refreshFooter() {
  if (!ui) return;
  ui.topicsBtn.hidden = !touched;
}

function buildContactSlot(slot: HTMLElement) {
  slot.replaceChildren();
  const link = el('a', 'soma-nav__item');
  if (onContactPage()) {
    link.setAttribute('href', `mailto:${site.contactEmail}`);
    link.append(icon(glyph.mail), document.createTextNode(' Email GEPER'));
  } else {
    link.setAttribute('href', '/contact');
    link.append(icon(glyph.mail), document.createTextNode(' Contact GEPER'));
  }
  slot.append(link);
}

/* ----------------------------------------------------------------- opening video */

/** The approved animation as a playable address. MP4 (the approved file) where the browser can play it,
    WebM otherwise. It is fetched in full and handed to the video element as a blob, so it plays on hosts
    that do not support byte-range requests; if one format cannot be fetched the other is tried. */
async function introVideoUrl(video: HTMLVideoElement): Promise<string> {
  const formats = [
    video.canPlayType('video/mp4; codecs="avc1.42E015"') ? 'mp4' : '',
    video.canPlayType('video/webm; codecs="vp9"') ? 'webm' : '',
  ].filter(Boolean);
  if (!formats.length) throw new Error('no playable format');
  let lastError: unknown;
  for (const ext of formats) {
    try {
      const res = await fetch(`/brand/soma-intro.${ext}`);
      if (!res.ok) throw new Error(`soma-intro.${ext}: HTTP ${res.status}`);
      const blob = await res.blob();
      return URL.createObjectURL(new Blob([blob], { type: ext === 'mp4' ? 'video/mp4' : 'video/webm' }));
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

/* ---------------------------------------------------------------------- build */

function build(launcher: HTMLButtonElement): Ui {
  const style = el('style');
  style.setAttribute('data-soma-css', '');
  style.textContent = notebookCss;
  document.head.append(style);

  const root = el('div', 'soma-root');

  const panel = el('section', 'soma-panel');
  panel.id = 'soma-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'SOMA by GEPER, FAQ notebook');
  panel.setAttribute('inert', '');
  panel.dataset.state = 'closed';

  /* header */
  const head = el('div', 'soma-head');
  const brand = el('div', 'soma-brand');
  const mark = el('span', 'soma-mark');
  mark.setAttribute('aria-hidden', 'true');
  mark.innerHTML = somaMarkImg(30);
  const names = el('div');
  names.append(el('h2', 'soma-title', 'SOMA'), el('p', 'soma-by', 'BY GEPER'));
  brand.append(mark, names);

  const tools = el('div', 'soma-tools');
  const tool = (label: string, svg: string, extra = '') => {
    const b = el('button', `soma-tool${extra}`);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.title = label;
    b.append(icon(svg));
    return b;
  };
  // The website's own pixel-helix theme button, copied so the notebook and the page share one switch.
  const themeBtn = tool('Switch to dark paper', themeHelix, ' soma-tool--theme');
  const minimiseBtn = tool('Minimise SOMA and keep my place', glyph.minimise);
  const closeBtn = tool('Close SOMA and clear the conversation', glyph.close);
  tools.append(themeBtn, minimiseBtn, closeBtn);
  head.append(brand, tools);

  /* the graph-paper page */
  const paper = el('div', 'soma-paper');
  paper.setAttribute('role', 'region');
  paper.setAttribute('aria-label', 'Conversation');
  paper.tabIndex = 0;
  const flow = el('div', 'soma-flow');
  paper.append(flow);

  /* footer: quick links and the word lookup */
  const foot = el('div', 'soma-foot');
  const nav = el('div', 'soma-nav');
  const topicsBtn = el('button', 'soma-nav__item');
  topicsBtn.type = 'button';
  topicsBtn.hidden = true;
  topicsBtn.append(icon(glyph.back), document.createTextNode(' Back to topics'));
  const contactSlot = el('span');
  nav.append(topicsBtn, contactSlot);

  const form = el('form', 'soma-ask');
  form.setAttribute('role', 'search');
  form.noValidate = false;
  const label = el('label', 'soma-sr', somaCopy.inputLabel);
  label.setAttribute('for', 'soma-q');
  const input = el('input', 'soma-input');
  input.id = 'soma-q';
  input.type = 'text';
  input.name = 'q';
  input.required = true;
  input.maxLength = MAX_QUERY;
  input.autocomplete = 'off';
  input.setAttribute('enterkeyhint', 'search');
  input.placeholder = somaCopy.inputPlaceholder;
  input.setAttribute('aria-describedby', 'soma-fine');
  const go = el('button', 'soma-go');
  go.type = 'submit';
  go.append(icon(glyph.pencil), document.createTextNode(' Find'));
  form.append(label, input, go);
  const fine = el('p', 'soma-fine', somaCopy.inputHint);
  fine.id = 'soma-fine';
  foot.append(nav, form, fine);

  /* the opening animation's stage: black, with the approved video and a Skip control */
  let intro: Ui['intro'];
  if (!introStarted && !reducedMotion()) {
    const stage = el('div', 'soma-intro');
    stage.hidden = true;
    stage.setAttribute('role', 'group');
    stage.setAttribute('aria-label', 'SOMA by GEPER');
    const video = el('video', 'soma-intro__video');
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.disablePictureInPicture = true;
    for (const attr of ['muted', 'playsinline', 'webkit-playsinline', 'aria-hidden']) video.setAttribute(attr, attr === 'aria-hidden' ? 'true' : '');
    video.tabIndex = -1;
    // The file is downloaded whole and played from memory (see introVideoUrl), so playback never depends on
    // the host answering byte-range requests — iPhone Safari will not play video from a host that does not.
    const ready = introVideoUrl(video);
    ready.catch(() => undefined); // a failure is handled when the animation starts; never leave it unhandled
    const skip = el('button', 'soma-intro__skip', 'Skip');
    skip.type = 'button';
    skip.setAttribute('aria-label', 'Skip the SOMA introduction');
    stage.append(video, skip);
    intro = { stage, video, skip, ready };
  }

  panel.append(head, paper, foot);
  if (intro) panel.append(intro.stage);
  root.append(panel);
  document.body.append(root);

  const built: Ui = { launcher, panel, paper, flow, input, topicsBtn, contactSlot, themeBtn, chrome: [head, paper, foot], intro };
  ui = built;

  /* wiring */
  buildContactSlot(contactSlot);
  themeBtn.addEventListener('click', togglePaper);
  minimiseBtn.addEventListener('click', () => hide('minimise'));
  closeBtn.addEventListener('click', () => hide('close'));
  topicsBtn.addEventListener('click', showTopics);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!input.value.trim()) return;
    const q = input.value;
    input.value = '';
    runSearch(q);
  });
  panel.addEventListener('keydown', onKeydown);
  launcher.setAttribute('aria-controls', 'soma-panel');

  /* The paper follows the site until the visitor chooses one. */
  applyPaper(savedPaper() ?? sitePaper());
  new MutationObserver(() => {
    if (!savedPaper()) applyPaper(sitePaper());
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  return built;
}

function startFresh() {
  if (!ui) return;
  ui.flow.replaceChildren();
  touched = false;
  needsReset = false;
  const { block: welcome, focus } = welcomeBlock();
  ui.flow.append(welcome);
  ui.paper.scrollTop = 0;
  refreshFooter();
  return focus;
}

/* ------------------------------------------------------------ open / hide / keys */

const small = () => window.matchMedia(SMALL_SCREEN).matches;

function onKeydown(ev: KeyboardEvent) {
  if (!ui) return;
  if (ev.key === 'Escape') {
    ev.preventDefault();
    ev.stopPropagation();
    hide('minimise');
    return;
  }
  // On a phone the notebook fills the screen, so Tab stays inside it. On larger screens the page
  // behind remains usable and Tab moves on normally.
  if (ev.key === 'Tab' && small()) {
    const items = Array.from(
      ui.panel.querySelectorAll<HTMLElement>('button:not([hidden]):not([disabled]), a[href], input, [tabindex="0"]'),
    ).filter((n) => !n.closest('[inert]') && n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  }
}

function show() {
  if (!ui) return;
  let focusTarget: HTMLElement | undefined;
  if (!ui.flow.childElementCount || needsReset) focusTarget = startFresh();
  const fullScreen = small();
  ui.panel.setAttribute('aria-modal', String(fullScreen));
  if (fullScreen && savedOverflow === null) {
    savedOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
  }
  ui.panel.removeAttribute('inert');
  ui.panel.dataset.state = 'open';
  ui.launcher.dataset.open = 'true';
  ui.launcher.dataset.notes = 'false';
  ui.launcher.setAttribute('aria-expanded', 'true');

  const land = () => {
    if (!ui) return;
    // First visit: land on the greeting. Returning to a kept page: land back at the end of it.
    const target = focusTarget ?? ui.flow.querySelector<HTMLElement>('.soma-block:last-child .soma-row, .soma-block:last-child .soma-opt');
    if (target) {
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    } else {
      ui.panel.focus({ preventScroll: true });
    }
  };

  if (ui.intro && !introStarted) {
    requestAnimationFrame(() => void playIntro().then(land));
  } else {
    requestAnimationFrame(land);
  }
}

/** Plays the opening animation, then resolves (as the notebook starts to appear). Never rejects. */
function playIntro(): Promise<void> {
  const u = ui;
  if (!u?.intro) return Promise.resolve();
  introStarted = true;
  const { stage, video, skip, ready } = u.intro;
  return new Promise<void>((resolve) => {
    let finished = false;
    let objectUrl = '';
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => void timers.push(window.setTimeout(fn, ms));

    const finish = (how: 'played' | 'skipped' | 'failed') => {
      if (finished) return;
      finished = true;
      stopIntro = null;
      timers.forEach(clearTimeout);
      video.pause();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      u.panel.dataset.intro = how;
      u.chrome.forEach((n) => n.removeAttribute('inert'));
      stage.dataset.leaving = '';
      // the stage dissolves while the notebook takes focus underneath
      window.setTimeout(() => { stage.hidden = true; }, how === 'played' ? INTRO_FADE_MS : 140);
      resolve();
    };
    stopIntro = () => finish('skipped');

    u.chrome.forEach((n) => n.setAttribute('inert', ''));
    u.panel.dataset.intro = 'playing';
    stage.hidden = false;
    skip.focus({ preventScroll: true });

    skip.addEventListener('click', () => finish('skipped'));
    stage.addEventListener('click', () => finish('skipped'));
    video.addEventListener('ended', () => later(() => finish('played'), INTRO_HOLD_MS), { once: true });
    video.addEventListener('playing', () => {
      // playback has begun: drop the "did it start?" timer and keep only the hard stop
      timers.splice(0).forEach((t) => clearTimeout(t));
      later(() => finish('played'), INTRO_MAX_MS);
    }, { once: true });
    video.addEventListener('error', () => finish('failed'), { once: true });
    later(() => { if (video.paused || video.readyState < 2) finish('failed'); }, INTRO_START_MS);

    ready.then((url) => {
      if (finished) { URL.revokeObjectURL(url); return; }
      objectUrl = url;
      video.src = url;
      const started = video.play();
      if (started) started.catch(() => finish('failed'));
    }, () => finish('failed'));
  });
}

function hide(mode: 'minimise' | 'close') {
  if (!ui) return;
  stopIntro?.();
  ui.panel.dataset.state = 'closed';
  ui.panel.setAttribute('inert', '');
  ui.launcher.dataset.open = 'false';
  ui.launcher.setAttribute('aria-expanded', 'false');
  if (mode === 'close') needsReset = true;
  ui.launcher.dataset.notes = mode === 'minimise' && touched ? 'true' : 'false';
  if (savedOverflow !== null) {
    document.documentElement.style.overflow = savedOverflow;
    savedOverflow = null;
  }
  ui.launcher.focus({ preventScroll: true });
}

/** Called when a visitor shows intent (pointer or focus on the launcher): builds the notebook, which starts
    the opening video downloading, so it is ready by the time they click. */
export function warmSoma(launcher: HTMLButtonElement) {
  if (!ui) build(launcher);
}

/** Opens SOMA, building the notebook the first time. */
export function openSoma(launcher: HTMLButtonElement) {
  if (!ui) build(launcher);
  show();
}

/** Used by the launcher to learn whether the notebook is currently showing. */
export const isOpen = () => ui?.panel.dataset.state === 'open';
