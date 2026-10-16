// Home page letters fading on and off. Used by the site and by the admin panel's live preview.
// Settings live in content.json → heroAnim (edited in the admin panel).

export const ANIM_DEFAULT = {
  enabled: true,
  fade: 0.6,          // seconds one letter takes to fade in or out
  step: 140,          // ms between one letter and the next
  holdOn: 1500,       // ms everything stays lit
  holdOff: 750,       // ms everything stays dark
  easing: 'soft',     // see EASINGS
  order: 'scatter',   // 'scatter' (each letter on its own, at random) | 'sequence' (left to right) | 'random' (random wave)
  offOrder: 'same',   // 'same' (first on, first off) | 'reverse' (last on, first off)
  spawn: false,       // words light up in a new random spot every time (size stays as laid out)
  drift: true,        // with spawn: a word glides slowly while it is lit
};

export const EASINGS = {
  soft: 'cubic-bezier(.45, 0, .25, 1)',
  smooth: 'ease',
  linear: 'linear',
  'quick in': 'cubic-bezier(.2, .8, .3, 1)',
  sharp: 'cubic-bezier(.9, 0, .1, 1)',
};

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// letters: elements that get class "on" when lit (CSS fades their opacity).
// words (optional): the absolutely placed word elements holding those letters, used by spawn mode.
// Returns a function that stops the animation.
export function animateLetters(letters, settings = {}, words = []) {
  const s = { ...ANIM_DEFAULT, ...settings };
  letters.forEach((l) => {
    l.style.transition = `opacity ${s.fade}s ${EASINGS[s.easing] || EASINGS.soft}`;
  });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!s.enabled || reduced || !letters.length) {
    letters.forEach((l) => l.classList.add('on'));
    return () => {};
  }
  letters.forEach((l) => l.classList.remove('on'));
  if (s.spawn && words.length) return spawnWords(words, s);
  let stopped = false, timer;
  if (s.order === 'scatter') {
    // Every letter flickers on its own clock: lit for about holdOn, dark for about holdOff, randomised.
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
    const vary = (ms) => Math.max(s.fade * 1000, ms * (0.35 + Math.random() * 1.3));
    letters.forEach((l) => {
      const flip = () => {
        if (stopped) return;
        const lit = l.classList.toggle('on');
        later(flip, s.fade * 1000 + vary(lit ? s.holdOn : s.holdOff));
      };
      later(flip, Math.random() * (s.holdOn + s.holdOff));
    });
    return () => { stopped = true; timers.forEach(clearTimeout); };
  }
  const wait = (ms) => new Promise((r) => { timer = setTimeout(r, Math.max(0, ms)); });
  (async () => {
    const idx = letters.map((_, i) => i);
    while (!stopped) {
      const on = s.order === 'random' ? shuffle([...idx]) : idx;
      const off = s.offOrder === 'reverse' ? [...on].reverse() : s.order === 'random' ? shuffle([...idx]) : on;
      for (const i of on) { if (stopped) return; letters[i].classList.add('on'); await wait(s.step); }
      await wait(s.holdOn);
      for (const i of off) { if (stopped) return; letters[i].classList.remove('on'); await wait(s.step); }
      await wait(s.holdOff);
    }
  })();
  return () => { stopped = true; clearTimeout(timer); };
}

// Spawn mode: each word lights up somewhere new, lingers (gliding a little), fades out, then
// reappears elsewhere. The words take turns, so the screen is never empty and never crowded.
function spawnWords(words, s) {
  let stopped = false;
  const timers = new Set();
  const wait = (ms) => new Promise((r) => { const t = setTimeout(() => { timers.delete(t); r(); }, Math.max(0, ms)); timers.add(t); });
  const saved = words.map((w) => ({ left: w.style.left, top: w.style.top, right: w.style.right, transform: w.style.transform, transition: w.style.transition }));
  const spots = [];   // where each word currently is, in % of the container: {x, y, w, h}
  const fadeMs = s.fade * 1000;

  // A free spot: inside the safe area (clear of the header), not touching the other words.
  function pick(i, el) {
    const box = el.offsetParent?.getBoundingClientRect() || { width: innerWidth, height: innerHeight };
    const r = el.getBoundingClientRect();
    const w = r.width / box.width * 100, h = r.height / box.height * 100;
    const top = Math.min(14, 100 - h - 4), x0 = 3, x1 = Math.max(x0, 97 - w), y1 = Math.max(top, 96 - h);
    const gap = 3;
    let best, bestD = -1;
    for (let k = 0; k < 40; k++) {
      const c = { x: x0 + Math.random() * (x1 - x0), y: top + Math.random() * (y1 - top), w, h };
      // distance to the nearest other word (negative when overlapping); also avoid the spot it just left
      const others = spots.filter((o, j) => o && j !== i);
      if (spots[i]) others.push(spots[i]);
      const d = Math.min(...others.map((o) => Math.max(o.x - (c.x + c.w), c.x - (o.x + o.w), o.y - (c.y + c.h), c.y - (o.y + o.h))), 99);
      if (d > bestD) { best = c; bestD = d; }
      if (d > gap * 2) break;
    }
    spots[i] = best;
    return best;
  }

  const order = (n) => {
    const idx = [...Array(n).keys()];
    return s.order === 'sequence' ? idx : shuffle(idx);
  };

  async function run(el, i) {
    const ls = [...el.querySelectorAll('.ch')];
    const cycle = ls.length * s.step + fadeMs + s.holdOn + ls.length * s.step + fadeMs + s.holdOff;
    await wait(i * cycle / words.length);   // take turns
    while (!stopped) {
      const p = pick(i, el);
      el.style.transition = 'none';
      el.style.right = 'auto';
      el.style.left = p.x + '%';
      el.style.top = p.y + '%';
      el.style.transform = 'translate(0, 0)';
      const lit = ls.length * s.step + fadeMs + s.holdOn + ls.length * s.step + fadeMs;
      if (s.drift) {
        // glide a short way in a random direction while lit
        const a = Math.random() * Math.PI * 2, dist = 1.2 + Math.random() * 1.6;
        void el.offsetWidth;
        el.style.transition = `transform ${lit}ms cubic-bezier(.3, 0, .2, 1)`;
        el.style.transform = `translate(${Math.cos(a) * dist}vmin, ${Math.sin(a) * dist}vmin)`;
      }
      const on = order(ls.length);
      const off = s.offOrder === 'reverse' ? [...on].reverse() : s.order === 'sequence' ? on : order(ls.length);
      for (const k of on) { if (stopped) return; ls[k].classList.add('on'); await wait(s.step); }
      await wait(fadeMs + s.holdOn);
      for (const k of off) { if (stopped) return; ls[k].classList.remove('on'); await wait(s.step); }
      await wait(fadeMs + s.holdOff);
    }
  }
  words.forEach((el, i) => run(el, i));
  return () => {
    stopped = true;
    timers.forEach(clearTimeout);
    words.forEach((w, i) => Object.assign(w.style, saved[i]));
  };
}
