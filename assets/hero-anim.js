// Home page letters fading on and off. Used by the site and by the admin panel's live preview.
// Settings live in content.json → heroAnim (edited in the admin panel).

export const ANIM_DEFAULT = {
  enabled: true,
  fade: 0.6,          // seconds one letter takes to fade in or out
  step: 140,          // ms between one letter and the next
  holdOn: 1500,       // ms everything stays lit
  holdOff: 750,       // ms everything stays dark
  easing: 'soft',     // see EASINGS
  order: 'sequence',  // 'sequence' (left to right) | 'random'
  offOrder: 'same',   // 'same' (first on, first off) | 'reverse' (last on, first off)
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
// Returns a function that stops the animation.
export function animateLetters(letters, settings = {}) {
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
  let stopped = false, timer;
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
