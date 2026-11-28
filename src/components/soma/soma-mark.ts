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

const g = (inner: string, size = 18) => svg(inner, size, 1.8);

export const glyph = {
  /** Half-filled circle: paper tone. */
  paper: g('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none"/>'),
  minimise: g('<path d="M5 18h14"/>'),
  close: g('<path d="M6 6l12 12M18 6 6 18"/>'),
  back: g('<path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 6 6"/>', 16),
  mail: g('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>', 16),
  arrow: g('<path d="M5 12h14M13 6l6 6-6 6"/>', 16),
  pencil: g('<path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19Z"/><path d="M14 7l3 3"/>', 16),
} as const;
