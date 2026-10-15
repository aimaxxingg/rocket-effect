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
  ' ': { w: 0.9, s: [] },
};

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

export function buildWordSVG(text) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  const g = document.createElementNS(NS, 'g');
  let cursor = 0;

  for (const ch of text) {
    const glyph = GLYPHS[ch];
    if (!glyph) continue;
    for (let [x1, y1, x2, y2] of glyph.s) {
      y1 *= YS; y2 *= YS;
      if (y1 === y2 && x1 !== x2) {
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', cursor + x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', cursor + x2);
        line.setAttribute('y2', y2);
        g.appendChild(line);
      } else {
        for (const [cx, cy] of dotsAlong(x1, y1, x2, y2)) {
          const c = document.createElementNS(NS, 'circle');
          c.setAttribute('cx', (cursor + cx).toFixed(3));
          c.setAttribute('cy', cy.toFixed(3));
          c.setAttribute('r', R);
          g.appendChild(c);
        }
      }
    }
    cursor += glyph.w + TRACK;
  }

  const width = cursor - TRACK + 2 * R;
  const top = -1.3 * YS - R - 0.05;
  const height = 6 * YS + R + 0.05 - top;
  svg.setAttribute('viewBox', `${-R} ${top} ${width} ${height}`);
  svg.setAttribute('class', 'blobword');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.setProperty('--ratio', (width / height).toFixed(4));
  svg.appendChild(g);
  return svg;
}
