// Work content. Edit this file to add or change projects.
//
// tabs:     folder tabs, in order (lowercase; drawn in the site lettering).
// projects: one entry per card.
//   tab   — which tab it belongs to (must match one of `tabs`)
//   img   — image path (put files in assets/work/)
//   title, client, year, text — shown on the detail page when the card is clicked
//   link  — optional external link on the detail page ({ href, label })
//   x, y  — card position inside the folder, % of folder width / height
//   w     — card width, % of folder width
//   r     — rotation in degrees

export const tabs = ['press release', 'digital ads', 'content seeding', 'art', 'pr'];

const placeholder = 'assets/work/placeholder.png';
const sample = 'Project description goes here: the brief, what we did and the results.';

export const projects = [
  // press release
  { tab: 'press release', img: placeholder, title: 'Project one', client: 'Client', year: '2026', text: sample, x: 6, y: 10, w: 34, r: -3 },
  { tab: 'press release', img: placeholder, title: 'Project two', client: 'Client', year: '2026', text: sample, x: 44, y: 6, w: 32, r: 2 },
  { tab: 'press release', img: placeholder, title: 'Project three', client: 'Client', year: '2025', text: sample, x: 26, y: 44, w: 32, r: -1 },

  // digital ads
  { tab: 'digital ads', img: placeholder, title: 'Project four', client: 'Client', year: '2026', text: sample, x: 10, y: 14, w: 36, r: 2 },
  { tab: 'digital ads', img: placeholder, title: 'Project five', client: 'Client', year: '2025', text: sample, x: 52, y: 30, w: 34, r: -2 },

  // content seeding
  { tab: 'content seeding', img: placeholder, title: 'Project six', client: 'Client', year: '2026', text: sample, x: 8, y: 8, w: 32, r: -2 },
  { tab: 'content seeding', img: placeholder, title: 'Project seven', client: 'Client', year: '2026', text: sample, x: 40, y: 20, w: 32, r: 3 },
  { tab: 'content seeding', img: placeholder, title: 'Project eight', client: 'Client', year: '2025', text: sample, x: 62, y: 46, w: 30, r: -1 },

  // art
  {
    tab: 'art', img: 'assets/work/strick-machine.jpg', title: 'Strick - Machine', client: 'Strick', year: '2025',
    text: 'Cover art for “Machine” by Strick.',
    link: { href: 'https://www.instagram.com/p/DKe31iBRZjv/', label: 'view on instagram' },
    x: 56, y: 6, w: 28, r: -1,
  },
  { tab: 'art', img: placeholder, title: 'Project nine', client: 'Client', year: '2025', text: sample, x: 8, y: 16, w: 36, r: 2 },

  // pr
  { tab: 'pr', img: placeholder, title: 'Project ten', client: 'Client', year: '2026', text: sample, x: 14, y: 12, w: 34, r: 1 },
  { tab: 'pr', img: placeholder, title: 'Project eleven', client: 'Client', year: '2025', text: sample, x: 50, y: 26, w: 34, r: -3 },
];

// About panel copy.
export const about = [
  'rocket effect marketing is a creative marketing studio.',
  'press releases, digital ads, content seeding, art direction and pr — for artists, brands and launches that need to take off.',
];
