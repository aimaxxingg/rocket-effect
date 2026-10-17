// Rocket Effect — dot-stack display lettering.
// Each glyph is a list of segments [x1, y1, x2, y2] in grid units.
// Horizontal segments render as smooth capsules; everything else is
// built from overlapping circles stacked along the segment, which gives
// the soft "bubbly" stems. Cap height runs from y=0 to y=6 (baseline).

const R = 1;          // dot radius
const STEP = 1;       // spacing between stacked dots
const TRACK = 2.35;   // space between glyph boxes
const X = 0.8;        // x-height top for lowercase
const YS = 1.32;      // vertical stretch: tall, narrow letterforms

const GLYPHS = {
  R: { w: 3, s: [
    [0, 0, 0, 6], [0, 0, 2.2, 0], [3, 0.8, 3, 2.2], [0, 3, 2.2, 3], [1.7, 3, 3, 6],
  ] },
  E: { w: 2.8, s: [
    [0, 0, 0, 6], [0, 0, 2.8, 0], [0, 3, 2.4, 3], [0, 6, 2.8, 6],
  ] },
  o: { w: 3, s: [
    [0.7, X, 2.3, X], [0.7, 6, 2.3, 6], [0, X + 0.7, 0, 5.3], [3, X + 0.7, 3, 5.3],
  ] },
  c: { w: 3, s: [
    [0.7, X, 2.3, X], [0.7, 6, 2.3, 6], [0, X + 0.7, 0, 5.3],
    [2.9, X + 0.6, 2.9, X + 0.9], [2.9, 5.1, 2.9, 5.4],
  ] },
  e: { w: 3, s: [
    [0.7, X, 2.3, X], [0.7, 6, 2.5, 6], [0, X + 0.7, 0, 5.3],
    [3, X + 0.7, 3, 3.3], [0, 3.4, 3, 3.4], [3, 5.4, 3, 5.4],
  ] },
  k: { w: 2.9, s: [
    [0, -1.3, 0, 6], [2.6, X, 0.7, 3.4], [0.9, 3.4, 2.9, 6],
  ] },
  t: { w: 2.6, s: [
    [0.8, -0.6, 0.8, 5.3], [0, 1.1, 2.6, 1.1], [1.4, 6, 2.6, 6],
  ] },
  f: { w: 2.5, s: [
    [0.6, -0.3, 0.6, 6], [1.3, -1, 2.5, -1], [0, 1.1, 2.3, 1.1],
  ] },
  A: { w: 3, s: [
    [0.7, 0, 2.3, 0], [0, 0.7, 0, 6], [3, 0.7, 3, 6], [0, 3.4, 3, 3.4],
  ] },
  a: { w: 3, s: [
    [0.7, X, 2.3, X], [0.7, 6, 2.3, 6], [0, X + 0.7, 0, 5.3], [3, X, 3, 6],
  ] },
  g: { w: 3, s: [
    [0.7, X, 2.3, X], [0.7, 5.4, 2.3, 5.4], [0, X + 0.7, 0, 4.7], [3, X, 3, 7.3], [0.3, 8, 2.3, 8],
  ] },
  y: { w: 3, s: [
    [0, X, 0, 4.7], [0.7, 5.4, 2.3, 5.4], [3, X, 3, 7.3], [0.3, 8, 2.3, 8],
  ] },
  n: { w: 3, s: [
    [0, X, 0, 6], [0.7, X, 2.3, X], [3, X + 0.7, 3, 6],
  ] },
  m: { w: 4.4, s: [
    [0, X, 0, 6], [0.6, X, 1.6, X], [2.2, X + 0.7, 2.2, 6], [2.8, X, 3.8, X], [4.4, X + 0.7, 4.4, 6],
  ] },
  w: { w: 4, s: [
    [0, X, 0, 5.3], [2, X + 1.2, 2, 5.3], [4, X, 4, 5.3], [0.6, 6, 1.4, 6], [2.6, 6, 3.4, 6],
  ] },
  r: { w: 2.5, s: [
    [0, X, 0, 6], [0.7, X, 2.1, X], [2.5, X + 0.6, 2.5, X + 0.8],
  ] },
  i: { w: 0, s: [
    [0, X, 0, 6], [0, -1.3, 0, -1.3],
  ] },
  l: { w: 1.3, s: [
    [0, -1.3, 0, 5.3], [0.7, 6, 1.3, 6],
  ] },
  b: { w: 3, s: [
    [0, -1.3, 0, 6], [0.7, X, 2.3, X], [0.7, 6, 2.3, 6], [3, X + 0.7, 3, 5.3],
  ] },
  d: { w: 3, s: [
    [0.7, X, 2.3, X], [0.7, 6, 2.3, 6], [0, X + 0.7, 0, 5.3], [3, -1.3, 3, 6],
  ] },
  h: { w: 3, s: [
    [0, -1.3, 0, 6], [0.7, X, 2.3, X], [3, X + 0.7, 3, 6],
  ] },
  p: { w: 3, s: [
    [0, X, 0, 8], [0.7, X, 2.3, X], [0.7, 6, 2.3, 6], [3, X + 0.7, 3, 5.3],
  ] },
  s: { w: 3, s: [
    [0.7, X, 2.6, X], [0, X + 0.7, 0, 2.8], [0.7, 3.4, 2.3, 3.4], [3, 4.1, 3, 5.3], [0.4, 6, 2.3, 6],
  ] },
  u: { w: 3, s: [
    [0, X, 0, 5.3], [0.7, 6, 2.3, 6], [3, X, 3, 6],
  ] },
  ' ': { w: 0.9, s: [] },
};

// Fixed vertical bounds (ascender to descender) so separate words line up.
const LINE_TOP = -1.3;
const LINE_BOTTOM = 8;

function dotsAlong(x1, y1, x2, y2) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const n = Math.max(1, Math.round(len / STEP));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
  }
  return out;
}

// opts.line: use full line bounds (incl. descenders) so words of a text line align.
// opts.letters: put each letter in its own <g class="ch"> (for per-letter animation).
// The real typeface: MD Thermochrome (trial), served from Cargo's server, not from this repo.
// Swap the URL for the bought font file once the licence is purchased.
// If it fails to load, the hand-drawn dot lettering below is used instead.
export const FONT_URL = 'https://freight.cargo.site/m/H2858262038431257716614798771322/MDThermochrome0.3-Black-Trial.woff2';
let font = null;   // { family, size, ctx } once loaded

export async function loadFont(url = FONT_URL, timeout = 4000) {
  try {
    const face = new FontFace('Thermochrome', `url(${url})`);
    await Promise.race([face.load(), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), timeout))]);
    document.fonts.add(face);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = '100px Thermochrome';
    // size the font so its tall letters (k, b) reach the same top and baseline as the dot lettering
    const asc = ctx.measureText('k').actualBoundingBoxAscent / 100;
    font = { family: 'Thermochrome', size: (6 - LINE_TOP) * YS / asc, ctx };
  } catch { font = null; }
  return !!font;
}

function buildWordFont(text, opts) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  const g = document.createElementNS(NS, 'g');
  const { ctx, size, family } = font;
  ctx.font = `100px ${family}`;
  const k = size / 100;
  const base = 6 * YS;
  const wordM = ctx.measureText(text);
  // a little room on both sides: Safari clips glyph edges that poke past the box while letters fade
  const pad = size * 0.05;
  const left = Math.min(0, -wordM.actualBoundingBoxLeft * k) - pad;
  [...text].forEach((ch, i) => {
    if (ch === ' ') return;
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', (ctx.measureText(text.slice(0, i)).width * k).toFixed(3));
    t.setAttribute('y', base);
    t.textContent = ch;
    if (opts.letters) t.setAttribute('class', 'ch');
    g.appendChild(t);
  });
  g.setAttribute('font-family', family);
  g.setAttribute('font-size', size.toFixed(3));
  const width = Math.max(wordM.width, wordM.actualBoundingBoxRight) * k - left + pad + 0.1;
  const top = LINE_TOP * YS - R - 0.05;
  const height = (opts.line ? LINE_BOTTOM : 6) * YS + R + 0.05 - top;
  svg.setAttribute('viewBox', `${left} ${top} ${width} ${height}`);
  svg.setAttribute('class', 'blobword fontword');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.setProperty('--ratio', (width / height).toFixed(4));
  svg.style.setProperty('--vbh', height.toFixed(3));
  svg.appendChild(g);
  return svg;
}

export function buildWordSVG(text, opts = {}) {
  if (font && !opts.dots) return buildWordFont(text, opts);   // opts.dots: always the thin dot lettering
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  const g = document.createElementNS(NS, 'g');
  let cursor = 0;

  for (const ch of text) {
    const glyph = GLYPHS[ch];
    if (!glyph) continue;
    let target = g;
    if (opts.letters && ch !== ' ') {
      target = document.createElementNS(NS, 'g');
      target.setAttribute('class', 'ch');
      g.appendChild(target);
    }
    for (let [x1, y1, x2, y2] of glyph.s) {
      y1 *= YS; y2 *= YS;
      if (y1 === y2 && x1 !== x2) {
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', cursor + x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', cursor + x2);
        line.setAttribute('y2', y2);
        target.appendChild(line);
      } else {
        for (const [cx, cy] of dotsAlong(x1, y1, x2, y2)) {
          const c = document.createElementNS(NS, 'circle');
          c.setAttribute('cx', (cursor + cx).toFixed(3));
          c.setAttribute('cy', cy.toFixed(3));
          c.setAttribute('r', R);
          target.appendChild(c);
        }
      }
    }
    cursor += glyph.w + TRACK;
  }

  const width = cursor - TRACK + 2 * R;
  const top = LINE_TOP * YS - R - 0.05;
  const height = (opts.line ? LINE_BOTTOM : 6) * YS + R + 0.05 - top;
  svg.setAttribute('viewBox', `${-R} ${top} ${width} ${height}`);
  svg.setAttribute('class', 'blobword');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.setProperty('--ratio', (width / height).toFixed(4));
  svg.style.setProperty('--vbh', height.toFixed(3));
  svg.appendChild(g);
  return svg;
}
