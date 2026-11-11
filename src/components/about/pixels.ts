/**
 * Deterministic pseudo-random for the About page's pixel systems.
 *
 * Server render and client hydration must agree, and a rebuild must not
 * reshuffle a composition someone has already approved — so no Math.random().
 */
export const rnd = (i: number, salt = 0): number => {
  const x = Math.sin((i + 1) * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Signed variant in [-1, 1). */
export const srnd = (i: number, salt = 0): number => rnd(i, salt) * 2 - 1;

export const round = (n: number, p = 2): number => +n.toFixed(p);
