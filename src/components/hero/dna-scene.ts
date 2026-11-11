/**
 * GEPER DNA narrative scene.
 *
 * Five keyframed states matching the five-stage system:
 *   0 data            — double helix
 *   1 representation  — one variant highlighted, context annotations fan out
 *   2 models          — helix unwinds into a linear track; evidence scores rise around the variant
 *   3 interpretation  — evidence nodes converge on the variant
 *   4 output          — everything settles into a report outline
 *
 * Rendering is on demand: the scene renders only when `setProgress()` changes
 * the state (scroll-linked) or on resize. There is no perpetual animation loop.
 * `dispose()` releases all GPU resources.
 */
import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  WebGLRenderer,
} from 'three';

export interface DnaScene {
  setProgress(t: number): void; // 0..4 continuous
  resize(): void;
  dispose(): void;
  readonly disposed: boolean;
}

export interface DnaSceneOptions {
  reducedMotion: boolean;
  lowPower: boolean;
  colors: { accent: string; accentText: string; ink: string; ink2: string; muted: string; warn: string; critical: string };
}

const KEYFRAMES = 5;

/** Deterministic pseudo-random so the "scores" are stable across loads. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function createDnaScene(container: HTMLElement, opts: DnaSceneOptions): DnaScene {
  const N = opts.lowPower ? 56 : 96; // points per strand
  const VI = Math.floor(N / 2); // variant index
  const R = 1.5, STEP = 0.078, TWIST = 0.27;
  const RUNG_EVERY = 2;

  const scene = new Scene();
  // Long lens: far camera + narrow FOV flattens perspective so base pairs read as parallel rungs.
  const camera = new PerspectiveCamera(9.5, 1, 0.1, 200);
  camera.position.set(0, 0, 48);
  camera.lookAt(0, 0, 0);

  const renderer = new WebGLRenderer({ alpha: true, antialias: !opts.lowPower, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.lowPower ? 1 : 1.5));
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.style.display = 'block';

  const C = {
    accent: new Color(opts.colors.accent),
    accentText: new Color(opts.colors.accentText),
    ink: new Color(opts.colors.ink),
    ink2: new Color(opts.colors.ink2),
    muted: new Color(opts.colors.muted),
    warn: new Color(opts.colors.warn),
    critical: new Color(opts.colors.critical),
  };

  /* ---------------------------------------------------------- keyframes */
  // Each keyframe: positions (N*3) for strand A and B, colours (N*3) for A and B.
  type Frame = { a: Float32Array; b: Float32Array; ca: Float32Array; cb: Float32Array };
  const frames: Frame[] = [];

  const helixPos = (i: number, phase: number, out: Float32Array) => {
    const ang = i * TWIST + phase;
    const y = (i - N / 2) * STEP;
    out[i * 3] = Math.cos(ang) * R;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = Math.sin(ang) * R;
  };
  const trackPos = (i: number, yOff: number, out: Float32Array) => {
    out[i * 3] = (i - N / 2) * (5.8 / N);
    out[i * 3 + 1] = yOff;
    out[i * 3 + 2] = 0;
  };
  const rectPos = (i: number, total: number, offset: number, out: Float32Array) => {
    // distribute along a rectangle perimeter (report outline)
    const w = 4.6, h = 3.0, per = 2 * (w + h);
    let d = ((i + offset) / total) * per;
    let x = 0, y = 0;
    if (d < w) { x = -w / 2 + d; y = h / 2; }
    else if ((d -= w) < h) { x = w / 2; y = h / 2 - d; }
    else if ((d -= h) < w) { x = w / 2 - d; y = -h / 2; }
    else { d -= w; x = -w / 2; y = -h / 2 + d; }
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = 0;
  };
  const fill = (arr: Float32Array, c: Color, i: number) => { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; };

  for (let k = 0; k < KEYFRAMES; k++) {
    const f: Frame = { a: new Float32Array(N * 3), b: new Float32Array(N * 3), ca: new Float32Array(N * 3), cb: new Float32Array(N * 3) };
    for (let i = 0; i < N; i++) {
      const nearVariant = Math.abs(i - VI) <= 6;
      if (k <= 1) { helixPos(i, 0, f.a); helixPos(i, Math.PI, f.b); }
      else if (k <= 3) { trackPos(i, 0.42, f.a); trackPos(i, -0.42, f.b); }
      else { rectPos(i, N * 2, 0, f.a); rectPos(i, N * 2, N, f.b); }

      // colours
      let cA = C.accent, cB = C.ink2;
      if (k === 0) { cA = C.accent; cB = C.ink2; }
      if (k === 1) { cA = i === VI ? C.warn : C.accent; cB = i === VI ? C.warn : C.ink2; }
      if (k === 2) { cA = nearVariant ? C.accentText : C.muted; cB = nearVariant ? C.ink : C.muted; if (i === VI) { cA = C.warn; cB = C.warn; } }
      if (k === 3) { cA = i === VI ? C.warn : C.muted; cB = i === VI ? C.warn : C.muted; }
      if (k === 4) { cA = C.muted; cB = C.muted; }
      fill(f.ca, cA, i); fill(f.cb, cB, i);
    }
    frames.push(f);
  }

  /* --------------------------------------------------------- geometries */
  // Circular point sprite (PointsMaterial draws squares by default).
  const dot = document.createElement('canvas');
  dot.width = dot.height = 64;
  const g2d = dot.getContext('2d')!;
  g2d.beginPath(); g2d.arc(32, 32, 28, 0, Math.PI * 2); g2d.fillStyle = '#fff'; g2d.fill();
  const sprite = new CanvasTexture(dot);

  const mkPoints = (color: boolean, size: number, opacity = 1) => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(N * 3), 3));
    if (color) g.setAttribute('color', new BufferAttribute(new Float32Array(N * 3), 3));
    const m = new PointsMaterial({ size, vertexColors: color, transparent: true, opacity, sizeAttenuation: true, depthWrite: false, map: sprite, alphaTest: 0.4 });
    const p = new Points(g, m);
    scene.add(p);
    return p;
  };
  const strandA = mkPoints(true, opts.lowPower ? 0.8 : 0.7);
  const strandB = mkPoints(true, opts.lowPower ? 0.8 : 0.7);

  const rungCount = Math.floor(N / RUNG_EVERY);
  const rungGeo = new BufferGeometry();
  rungGeo.setAttribute('position', new BufferAttribute(new Float32Array(rungCount * 2 * 3), 3));
  const rungMat = new LineBasicMaterial({ color: C.ink2, transparent: true, opacity: 0.22 });
  const rungs = new LineSegments(rungGeo, rungMat);
  scene.add(rungs);

  // Annotation lines (representation): 3 segments from variant to context labels
  const ANN = 3;
  const annGeo = new BufferGeometry();
  annGeo.setAttribute('position', new BufferAttribute(new Float32Array(ANN * 2 * 3), 3));
  const annMat = new LineBasicMaterial({ color: C.warn, transparent: true, opacity: 0 });
  const ann = new LineSegments(annGeo, annMat);
  scene.add(ann);
  const annPts = mkPoints(false, 0.58, 0);
  (annPts.material as PointsMaterial).color = C.warn;
  annPts.geometry.setAttribute('position', new BufferAttribute(new Float32Array(ANN * 3), 3));

  // Score bars (models): vertical segments over a window around the variant
  const BARS = 9;
  const rnd = seeded(42);
  const barH = Array.from({ length: BARS }, (_, j) => 0.35 + rnd() * 1.1 * (j === 4 ? 1.35 : 1));
  const barMat = new MeshBasicMaterial({ color: C.accentText, transparent: true, opacity: 0, depthWrite: false });
  const barGeoUnit = new PlaneGeometry(1, 1); barGeoUnit.translate(0, 0.5, 0); // anchored at its base
  const bars: Mesh[] = [];
  for (let j = 0; j < BARS; j++) { const m = new Mesh(barGeoUnit, barMat); scene.add(m); bars.push(m); }

  // Variant marker: one larger point that follows the variant while it matters (states 1–3).
  const vmGeo = new BufferGeometry();
  vmGeo.setAttribute('position', new BufferAttribute(new Float32Array(3), 3));
  const vmMat = new PointsMaterial({ size: 1.7, color: C.warn, transparent: true, opacity: 0, sizeAttenuation: true, depthWrite: false, map: sprite, alphaTest: 0.4 });
  const vm = new Points(vmGeo, vmMat);
  scene.add(vm);

  // Evidence nodes (interpretation): 4 nodes + links
  const EV = 4;
  const evGeo = new BufferGeometry();
  evGeo.setAttribute('position', new BufferAttribute(new Float32Array(EV * 3), 3));
  evGeo.setAttribute('color', new BufferAttribute(new Float32Array(EV * 3), 3));
  const evMat = new PointsMaterial({ size: 1.25, vertexColors: true, transparent: true, opacity: 0, sizeAttenuation: true, depthWrite: false, map: sprite, alphaTest: 0.4 });
  const ev = new Points(evGeo, evMat);
  scene.add(ev);
  const evColors = [C.accent, C.ink, C.critical, C.accentText]; // population, functional, clinical, computational
  evColors.forEach((c, i) => fill(evGeo.getAttribute('color').array as Float32Array, c, i));
  const linkGeo = new BufferGeometry();
  linkGeo.setAttribute('position', new BufferAttribute(new Float32Array(EV * 2 * 3), 3));
  const linkMat = new LineBasicMaterial({ color: C.ink2, transparent: true, opacity: 0 });
  const links = new LineSegments(linkGeo, linkMat);
  scene.add(links);

  // Report lines (output): three horizontal rules inside the outline
  const REP = 3;
  const repGeo = new BufferGeometry();
  repGeo.setAttribute('position', new Float32BufferAttribute(new Float32Array(REP * 2 * 3), 3));
  const repMat = new LineBasicMaterial({ color: C.ink2, transparent: true, opacity: 0 });
  const rep = new LineSegments(repGeo, repMat);
  scene.add(rep);

  /* ------------------------------------------------------------- update */
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const peak = (t: number, centre: number, width = 1) => Math.max(0, 1 - Math.abs(t - centre) / width); // triangular window
  const tmpA = new Float32Array(N * 3), tmpB = new Float32Array(N * 3);

  function apply(t: number) {
    const k0 = Math.min(KEYFRAMES - 1, Math.max(0, Math.floor(t)));
    const k1 = Math.min(KEYFRAMES - 1, k0 + 1);
    const u = opts.reducedMotion ? Math.round(t) - k0 : t - k0; // snap when reduced motion
    const s = opts.reducedMotion ? Math.max(0, Math.min(1, u)) : u * u * (3 - 2 * u); // smoothstep
    const f0 = frames[k0], f1 = frames[k1];

    const pa = strandA.geometry.getAttribute('position').array as Float32Array;
    const pb = strandB.geometry.getAttribute('position').array as Float32Array;
    const ca = strandA.geometry.getAttribute('color').array as Float32Array;
    const cb = strandB.geometry.getAttribute('color').array as Float32Array;
    for (let i = 0; i < N * 3; i++) {
      pa[i] = lerp(f0.a[i], f1.a[i], s); pb[i] = lerp(f0.b[i], f1.b[i], s);
      ca[i] = lerp(f0.ca[i], f1.ca[i], s); cb[i] = lerp(f0.cb[i], f1.cb[i], s);
    }
    tmpA.set(pa); tmpB.set(pb);
    strandA.geometry.getAttribute('position').needsUpdate = true;
    strandB.geometry.getAttribute('position').needsUpdate = true;
    strandA.geometry.getAttribute('color').needsUpdate = true;
    strandB.geometry.getAttribute('color').needsUpdate = true;

    // Rungs follow the strands; collapse in the output state
    const rp = rungGeo.getAttribute('position').array as Float32Array;
    const collapse = t > 3 ? Math.min(1, t - 3) : 0;
    for (let r = 0; r < rungCount; r++) {
      const i = r * RUNG_EVERY;
      const mx = (tmpA[i * 3] + tmpB[i * 3]) / 2, my = (tmpA[i * 3 + 1] + tmpB[i * 3 + 1]) / 2, mz = (tmpA[i * 3 + 2] + tmpB[i * 3 + 2]) / 2;
      rp[r * 6] = lerp(tmpA[i * 3], mx, collapse); rp[r * 6 + 1] = lerp(tmpA[i * 3 + 1], my, collapse); rp[r * 6 + 2] = lerp(tmpA[i * 3 + 2], mz, collapse);
      rp[r * 6 + 3] = lerp(tmpB[i * 3], mx, collapse); rp[r * 6 + 4] = lerp(tmpB[i * 3 + 1], my, collapse); rp[r * 6 + 5] = lerp(tmpB[i * 3 + 2], mz, collapse);
    }
    rungGeo.getAttribute('position').needsUpdate = true;
    rungMat.opacity = 0.22 * (1 - 0.6 * Math.max(0, Math.min(1, t - 2))) * (1 - collapse);

    // Scroll-linked rotation while the helix is intact; none once unwound.
    const helical = Math.max(0, 1 - Math.max(0, t - 1));
    const rot = opts.reducedMotion ? 0 : t * 0.9 * helical;
    for (const o of [strandA, strandB, rungs, vm]) o.rotation.y = rot;

    // Variant position (average of the two strands at VI), expressed in world space
    // so that screen-facing overlays (annotations, links) meet the rotated helix.
    const lx = (tmpA[VI * 3] + tmpB[VI * 3]) / 2, vy = (tmpA[VI * 3 + 1] + tmpB[VI * 3 + 1]) / 2, lz = (tmpA[VI * 3 + 2] + tmpB[VI * 3 + 2]) / 2;
    const vx = lx * Math.cos(rot) + lz * Math.sin(rot), vz = -lx * Math.sin(rot) + lz * Math.cos(rot);

    // Annotation fan — only around state 1
    const annVis = peak(t, 1, 0.8);
    const ap = annGeo.getAttribute('position').array as Float32Array;
    const app = annPts.geometry.getAttribute('position').array as Float32Array;
    const targets = [[2.9, 1.1, 0], [3.2, 0.1, 0], [2.9, -0.9, 0]];
    for (let j = 0; j < ANN; j++) {
      const [tx, ty, tz] = targets[j];
      const ex = lerp(vx, tx, annVis), ey = lerp(vy, ty, annVis), ez = lerp(vz, tz, annVis);
      ap[j * 6] = vx; ap[j * 6 + 1] = vy; ap[j * 6 + 2] = vz; ap[j * 6 + 3] = ex; ap[j * 6 + 4] = ey; ap[j * 6 + 5] = ez;
      app[j * 3] = ex; app[j * 3 + 1] = ey; app[j * 3 + 2] = ez;
    }
    annGeo.getAttribute('position').needsUpdate = true;
    annPts.geometry.getAttribute('position').needsUpdate = true;
    annMat.opacity = 0.9 * annVis; (annPts.material as PointsMaterial).opacity = annVis;

    // Score bars — only around state 2
    const barVis = peak(t, 2, 0.9);
    for (let j = 0; j < BARS; j++) {
      const i = VI - 6 + Math.round(j * 1.5);
      const x = tmpA[i * 3], base = 0.72;
      const m = bars[j];
      m.position.set(x, base, 0.01);
      m.scale.set(0.09, Math.max(0.0001, barH[j] * barVis), 1);
      m.visible = barVis > 0.01;
    }
    barMat.opacity = barVis;

    // Variant marker
    const vmp = vmGeo.getAttribute('position').array as Float32Array;
    vmp[0] = lx; vmp[1] = vy; vmp[2] = lz + 0.02;
    vmGeo.getAttribute('position').needsUpdate = true;
    vmMat.opacity = Math.min(peak(t, 1, 0.7) + peak(t, 2, 1) + peak(t, 3, 1), 1) * (1 - Math.max(0, Math.min(1, (t - 3.2) / 0.6)));

    // Evidence nodes — appear in 3, become report rows in 4
    const evVis = Math.max(0, Math.min(1, t - 2.2)) ;
    const toRows = Math.max(0, Math.min(1, t - 3));
    const ep = evGeo.getAttribute('position').array as Float32Array;
    const lp = linkGeo.getAttribute('position').array as Float32Array;
    const far = [[-3.6, 2.4, 0], [3.6, 2.2, 0], [-3.4, -2.3, 0], [3.4, -2.4, 0]];
    const near = [[-1.3, 1.5, 0], [1.3, 1.5, 0], [-1.3, -1.5, 0], [1.3, -1.5, 0]];
    const rows = [[-1.6, 0.7, 0], [-1.6, 0.05, 0], [-1.6, -0.6, 0], [1.6, 0.7, 0]];
    for (let j = 0; j < EV; j++) {
      const conv = peak(t, 3, 1);
      let x = lerp(far[j][0], near[j][0], conv), y = lerp(far[j][1], near[j][1], conv), z = 0;
      x = lerp(x, rows[j][0], toRows); y = lerp(y, rows[j][1], toRows);
      ep[j * 3] = x; ep[j * 3 + 1] = y; ep[j * 3 + 2] = z;
      lp[j * 6] = x; lp[j * 6 + 1] = y; lp[j * 6 + 2] = z; lp[j * 6 + 3] = vx; lp[j * 6 + 4] = vy; lp[j * 6 + 5] = vz;
    }
    evGeo.getAttribute('position').needsUpdate = true;
    linkGeo.getAttribute('position').needsUpdate = true;
    evMat.opacity = evVis;
    linkMat.opacity = 0.55 * peak(t, 3, 1);

    // Report lines — state 4
    const rp2 = repGeo.getAttribute('position').array as Float32Array;
    for (let j = 0; j < REP; j++) {
      const y = 0.7 - j * 0.65;
      rp2[j * 6] = -1.3; rp2[j * 6 + 1] = y; rp2[j * 6 + 2] = 0;
      rp2[j * 6 + 3] = -1.3 + (1.9 - j * 0.4) * toRows; rp2[j * 6 + 4] = y; rp2[j * 6 + 5] = 0;
    }
    repGeo.getAttribute('position').needsUpdate = true;
    repMat.opacity = 0.7 * toRows;

  }

  /* ------------------------------------------------------------- public */
  let disposed = false;
  let last = -1;
  function render() { if (!disposed) renderer.render(scene, camera); }
  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    if (last >= 0) { apply(last); }
    render();
  }
  const ro = new ResizeObserver(() => resize());
  ro.observe(container);

  function setProgress(t: number) {
    if (disposed) return;
    const clamped = Math.max(0, Math.min(KEYFRAMES - 1, t));
    if (Math.abs(clamped - last) < 0.002) return;
    last = clamped;
    apply(clamped);
    render();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    ro.disconnect();
    scene.traverse((o) => {
      const any = o as { geometry?: BufferGeometry; material?: { dispose(): void } };
      any.geometry?.dispose();
      any.material?.dispose();
    });
    sprite.dispose(); barGeoUnit.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  }

  resize();
  setProgress(0);
  return { setProgress, resize, dispose, get disposed() { return disposed; } };
}
