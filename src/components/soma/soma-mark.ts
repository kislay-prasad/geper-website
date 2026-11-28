/**
 * SOMA's mark and the small interface glyphs. Inline SVG for the glyphs, so SOMA makes no image
 * requests for them. All strings are constants — nothing here is built from visitor input.
 *
 * The mark is GEPER's approved SOMA artwork: the helix "S" of the approved wordmark, cut from the
 * approved animation (public/brand/soma-mark.webp, from public/brand/soma-intro.mp4). It is drawn
 * glowing on black, so wherever it is placed it sits on a dark chip and is blended with `screen`,
 * which lets the black fall away. The temporary helix drawn earlier has been removed.
 */
export const MARK_SRC = '/brand/soma-mark.webp';
/** Intrinsic size of the file; the mark is always drawn smaller than this. */
const MARK_W = 83;
const MARK_H = 108;

/** The approved "S" mark as an <img>, `height` CSS px tall. */
export const somaMarkImg = (height: number) =>
  `<img class="soma-mark-img" src="${MARK_SRC}" alt="" width="${Math.round((MARK_W * height) / MARK_H)}" height="${height}" decoding="async" draggable="false">`;

const svg = (inner: string, size: number, stroke = 1.9) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;

/* The light / dark switch glyph: the website's own pixel double helix (src/components/nav/ThemeToggle.astro),
   built by the same arithmetic so it is the same twelve pixels in the same places. Each pixel carries its
   light-state and dark-state position as CSS variables, and soma.css moves it between them when the paper
   changes, so the switch reads as the helix advancing a quarter turn. */
const HELIX_ROWS = 6;
const HELIX_PX = 2;
const HELIX_CX = 7;
const HELIX_AMP = 4.2;
const r2 = (n: number) => Math.round(n * 100) / 100;
const HELIX_TONE: Record<number, string> = { 2: 'is-blue', 9: 'is-green' }; // blue = computation, green = biology
export const themeHelix = (() => {
  const rects: string[] = [];
  for (let row = 0; row < HELIX_ROWS; row++) {
    const phase = (row * Math.PI) / (HELIX_ROWS - 1);
    [1, -1].forEach((dir, k) => {
      const i = row * 2 + k;
      const y = r2(0.6 + row * 2.76);
      const xLight = r2(HELIX_CX + dir * HELIX_AMP * Math.cos(phase) - HELIX_PX / 2);
      const xDark = r2(HELIX_CX + dir * HELIX_AMP * Math.cos(phase + Math.PI / 2) - HELIX_PX / 2);
      const tone = HELIX_TONE[i] ? ` ${HELIX_TONE[i]}` : '';
      rects.push(`<rect class="tt-px${tone}" width="${HELIX_PX}" height="${HELIX_PX}" rx="0.35" x="0" y="${y}" style="--xl:${xLight}px;--xd:${xDark}px;--d:${row * 26}ms"/>`);
    });
  }
  return `<svg class="tt-helix" width="17" height="18" viewBox="0 0 14 17" fill="none" aria-hidden="true" focusable="false">${rects.join('')}</svg>`;
})();

const g = (inner: string, size = 18) => svg(inner, size, 1.8);

export const glyph = {
  minimise: g('<path d="M5 18h14"/>'),
  close: g('<path d="M6 6l12 12M18 6 6 18"/>'),
  back: g('<path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 6 6"/>', 16),
  mail: g('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>', 16),
  arrow: g('<path d="M5 12h14M13 6l6 6-6 6"/>', 16),
  pencil: g('<path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19Z"/><path d="M14 7l3 3"/>', 16),
} as const;
