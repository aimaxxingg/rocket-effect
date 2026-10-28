// Admin panel for content.json. Edits happen in the browser; "publish" commits
// content.json plus any new images to the GitHub repo in one commit (GitHub Pages
// then rebuilds the site). Without a token everything works except publishing.

import { buildWordSVG, loadFont } from '../assets/blobfont.js';
import { animateLetters, ANIM_DEFAULT, EASINGS } from '../assets/hero-anim.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const STATE_KEY = 're-admin-state';    // unsaved work, survives reloads
const DRAFT_KEY = 're-admin-draft';    // content for the site's ?preview
const CONN_KEY = 're-admin-conn';
// starting layout of the home page words (matches the site's original look)
const HERO_DEFAULT = {
  desktop: [{ x: 4, y: 20, w: 36.1 }, { x: 60.4, y: 50, w: 35.6 }],
  phone: [{ x: 5, y: 30, w: 60 }, { x: 35.8, y: 50, w: 59.2 }],
};
const PROTECTED_IMAGES = ['assets/work/placeholder.png'];

let content = null;     // working copy
let baseJSON = '';      // what is published (as last loaded)
let remoteSha = null;   // blob sha of content.json when loaded
let pending = {};       // new images: path -> { b64, dataUrl }
let library = [];       // image paths in assets/work
const conn = { token: '', repo: 'aimaxxingg/rocket-effect', branch: 'main' };

// --- small helpers -----------------------------------------------------------
function toast(msg, err = false, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('err', err);
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), ms);
}
const imgURL = (path) => pending[path]?.dataUrl || (/^(https?:|data:)/.test(path) ? path : '../' + path);
const isVideo = (path) => /\.(mp4|webm|mov|m4v)$/i.test(path);
// a library / gallery tile: a still for a picture, the first frame for a video
const tile = (p) => isVideo(p)
  ? `<video src="${esc(imgURL(p))}#t=0.1" muted playsinline preload="metadata"></video>`
  : '';
const json = (c) => JSON.stringify(c, null, 2) + '\n';
const utf8ToB64 = (s) => { const b = new TextEncoder().encode(s); let r = ''; for (let i = 0; i < b.length; i += 0x8000) r += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(r); };
const b64ToUtf8 = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';

function normalize(c) {
  c.site ||= {};
  c.hero ||= [];
  c.heroAnim = { ...ANIM_DEFAULT, ...c.heroAnim };
  c.heroLayout ||= {};
  for (const dev of ['desktop', 'phone']) {
    c.heroLayout[dev] ||= [];
    c.hero.forEach((_, i) => { c.heroLayout[dev][i] ||= { ...HERO_DEFAULT[dev][i % 2] }; });
    c.heroLayout[dev].length = c.hero.length;
  }
  c.tabs ||= [];
  c.projects ||= [];
  c.about ||= [];
  return c;
}

// --- GitHub API ----------------------------------------------------------------
async function gh(path, { method = 'GET', body } = {}) {
  const res = await fetch(`https://api.github.com/repos/${conn.repo}${path ? "/" + path : ""}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(conn.token ? { Authorization: `Bearer ${conn.token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  }).catch((e) => {
    throw new Error(e.message === 'Failed to fetch'
      ? 'Can’t reach api.github.com (check the connection; a VPN may be needed)'
      : e.message);
  });
  if (res.status === 401 && conn.token) signOut('Your token has expired. Enter a new one.');
  if (!res.ok) {
    let msg = res.status + '';
    try { msg += ' ' + (await res.json()).message; } catch {}
    const e = new Error(msg);
    e.status = res.status;
    throw e;
  }
  return res.status === 204 ? null : res.json();
}

async function fetchRemoteContent(ref = conn.branch) {
  const f = await gh(`contents/content.json?ref=${encodeURIComponent(ref)}`);
  return { content: JSON.parse(b64ToUtf8(f.content)), sha: f.sha };
}
async function loadLibrary() {
  const set = new Set(content.projects.map((p) => p.img).filter((p) => p?.startsWith('assets/')));
  {
    try {
      const files = await gh(`contents/assets/work?ref=${encodeURIComponent(conn.branch)}`);
      files.filter((f) => f.type === 'file' && /\.(jpe?g|png|gif|webp|avif|svg|mp4|webm|mov|m4v)$/i.test(f.name)).forEach((f) => set.add(f.path));
    } catch {}
  }
  Object.keys(pending).forEach((p) => set.add(p));
  library = [...set];
}

// One commit: new images + content.json (+ optional removal of unused images).
// Three-way merge: my changes (mine vs base) applied on top of what is published now (remote), so
// work done elsewhere in the meantime (another tab, another person, a code update) is not lost.
// Projects are matched by their image; a project I didn't touch takes the remote version.
function mergeContent(base, mine, remote) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const key = (p) => p.img || p.title;
  const out = { ...remote };
  for (const k of Object.keys(mine)) if (k !== 'projects' && !same(mine[k], base[k])) out[k] = mine[k];
  const B = new Map(base.projects.map((p) => [key(p), p]));
  const R = new Map(remote.projects.map((p) => [key(p), p]));
  const M = new Map(mine.projects.map((p) => [key(p), p]));
  const list = [];
  for (const p of mine.projects) {
    const k = key(p), b = B.get(k);
    if (!b) { list.push(p); continue; }                 // added here
    if (!same(p, b)) { list.push(p); continue; }        // edited here: mine wins
    if (R.has(k)) list.push(R.get(k));                  // untouched here: take the published one
  }                                                     // (untouched here and removed there: drop)
  for (const p of remote.projects) {
    const k = key(p);
    if (!B.has(k) && !M.has(k)) list.push(p);           // added elsewhere
  }
  out.projects = list;
  return out;
}

async function publish() {
  const btn = $('#btn-publish');
  btn.disabled = true;
  btn.textContent = 'Publishing…';
  try {
    // someone else (or another tab) published since we loaded?
    const now = await gh(`contents/content.json?ref=${encodeURIComponent(conn.branch)}`).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (now && now.sha !== remoteSha) {
      // changed elsewhere since we loaded: keep those changes and put ours on top
      const remote = normalize(JSON.parse(b64ToUtf8(now.content)));
      content = normalize(mergeContent(JSON.parse(baseJSON), content, remote));
      baseJSON = json(remote);
      remoteSha = now.sha;
      renderAll();
      toast('The site was changed elsewhere meanwhile; those changes were kept and yours added on top.', false, 6000);
    }

    const ref = await gh(`git/ref/heads/${encodeURIComponent(conn.branch)}`);
    const head = await gh(`git/commits/${ref.object.sha}`);
    const tree = [];
    const used = new Set(content.projects.flatMap((p) => [p.img, ...(p.images || []), p.news?.logo].filter(Boolean)));
    for (const [path, { b64 }] of Object.entries(pending)) {
      if (!used.has(path)) continue;   // uploaded then replaced: skip
      const blob = await gh('git/blobs', { method: 'POST', body: { content: b64, encoding: 'base64' } });
      tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const text = json(content);
    tree.push({ path: 'content.json', mode: '100644', type: 'blob', content: text });
    const removed = [];
    if ($('#opt-clean')?.checked) {
      for (const path of library) {
        if (!used.has(path) && !pending[path] && !PROTECTED_IMAGES.includes(path)) {
          tree.push({ path, mode: '100644', type: 'blob', sha: null });
          removed.push(path);
        }
      }
    }
    const newTree = await gh('git/trees', { method: 'POST', body: { base_tree: head.tree.sha, tree } });
    const commit = await gh('git/commits', {
      method: 'POST',
      body: { message: 'Update site content from the admin panel' + (removed.length ? ` (removed ${removed.length} unused images)` : ''), tree: newTree.sha, parents: [head.sha] },
    });
    await gh(`git/refs/heads/${encodeURIComponent(conn.branch)}`, { method: 'PATCH', body: { sha: commit.sha } });

    baseJSON = text;
    pending = {};
    const f = await gh(`contents/content.json?ref=${commit.sha}`);
    remoteSha = f.sha;
    clearState();
    await loadLibrary();
    renderAll();
    toast('Published ✓  It will be live on the site in about a minute.', false, 6000);
  } catch (e) {
    toast('Publish failed: ' + e.message, true, 8000);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Publish to site';
    updateStatus();
  }
}

// --- unsaved state ---------------------------------------------------------------
const dirty = () => json(content) !== baseJSON || Object.keys(pending).length > 0;
function saveState() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify({ content, pending, baseJSON })); }
  catch { /* quota (big images): the work stays in memory */ }
}
function clearState() {
  try { localStorage.removeItem(STATE_KEY); localStorage.removeItem(DRAFT_KEY); } catch {}
}
function changed() {
  saveState();
  updateStatus();
}
function updateStatus() {
  const s = $('#status');
  const d = dirty();
  s.classList.toggle('dirty', d);
  s.textContent = d ? '● Unpublished changes' : 'Everything is published';
  $('#btn-discard').disabled = !d;
}
addEventListener('beforeunload', (e) => { if (dirty()) e.preventDefault(); });

// --- sections ---------------------------------------------------------------------
function showSec(name) {
  $$('.side [data-sec]').forEach((b) => b.classList.toggle('on', b.dataset.sec === name));
  $$('main section').forEach((s) => (s.hidden = s.dataset.sec !== name));
  if (name === 'layout') renderStage();
  if (name === 'home') renderHome();
  if (name === 'history') loadHistory();
  try { sessionStorage.setItem('re-admin-sec', name); } catch {}
}
$('#side').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-sec]');
  if (b) showSec(b.dataset.sec);
});

function tabOptions(sel, withAll) {
  const cur = sel.value;
  sel.innerHTML = (withAll ? '<option value="">All</option>' : '') +
    content.tabs.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
}

function renderAll() {
  tabOptions($('#proj-filter'), true);
  tabOptions($('#lay-tab'));
  renderProjects();
  renderTabs();
  renderAbout();
  renderGeneral();
  if (!$('section[data-sec=layout]').hidden) renderStage();
  updateStatus();
}

// Projects -------------------------------------------------------------------------
function renderProjects() {
  const f = $('#proj-filter').value;
  const list = content.projects.map((p, i) => [p, i]).filter(([p]) => !f || p.tab === f);
  $('#proj-list').innerHTML = list.length ? list.map(([p, i]) => `
    <div class="pc" data-i="${i}">
      <div class="thumb" data-edit style="background-image:url('${esc(imgURL(p.img))}')"></div>
      <div class="info" data-edit><b>${esc(p.title)}</b><small>${esc(p.client)} · ${esc(p.year)}</small>${f ? '' : `<span class="tag">${esc(p.tab)}</span>`}</div>
      <div class="tools">
        <button type="button" data-move="-1" title="Earlier">←</button>
        <button type="button" data-move="1" title="Later">→</button>
        <button type="button" data-dup>Duplicate</button>
        <button type="button" data-edit>Edit</button>
      </div>
    </div>`).join('') : '<div class="empty">No projects yet. Click “+ New project”.</div>';
}
$('#proj-filter').addEventListener('change', renderProjects);
$('#proj-list').addEventListener('click', (e) => {
  const card = e.target.closest('.pc');
  if (!card) return;
  const i = +card.dataset.i;
  if (e.target.closest('[data-move]')) {
    // move within the same tab
    const dir = +e.target.closest('[data-move]').dataset.move;
    const tab = content.projects[i].tab;
    let j = i + dir;
    while (j >= 0 && j < content.projects.length && content.projects[j].tab !== tab) j += dir;
    if (j < 0 || j >= content.projects.length) return;
    [content.projects[i], content.projects[j]] = [content.projects[j], content.projects[i]];
    changed(); renderProjects();
  } else if (e.target.closest('[data-dup]')) {
    const c = structuredClone(content.projects[i]);
    c.title += ' copy';
    c.x = Math.min(c.x + 4, 80); c.y = Math.min(c.y + 4, 80);
    content.projects.splice(i + 1, 0, c);
    changed(); renderProjects();
  } else if (e.target.closest('[data-edit]')) {
    editProject(i);
  }
});
$('#proj-add').addEventListener('click', () => {
  if (!content.tabs.length) { toast('Create a tab first.', true); showSec('tabs'); return; }
  editProject(-1);
});

// Project editor dialog
const NEWS_TAB = 'press release';
let editing = -1, editImg = '', editGallery = [], editLogo = '', libMode = 'main';
function renderGallery() {
  $('#p-gal').innerHTML = editGallery.map((p, i) => `<div class="gal-item${isVideo(p) ? ' vid' : ''}" style="${isVideo(p) ? '' : `background-image:url('${esc(imgURL(p))}')`}">${tile(p)}
    ${i ? `<button type="button" class="left" data-left="${i}" title="Move earlier">‹</button>` : ''}
    <button type="button" data-rm="${i}" title="Remove">×</button></div>`).join('');
}
function setLogo(path) {
  editLogo = path;
  $('#p-logo-prev').style.backgroundImage = path ? `url('${imgURL(path)}')` : '';
}
function syncNewsFields() { $('#p-news').hidden = pform.tab.value !== NEWS_TAB; }
const dlg = $('#dlg'), pform = $('#pform');
function setPrev(path) {
  editImg = path;
  $('#p-img-prev').style.backgroundImage = path ? `url('${imgURL(path)}')` : '';
}
function editProject(i) {
  editing = i;
  const tab = $('#proj-filter').value || content.tabs[0];
  const p = i >= 0 ? content.projects[i] : { tab, title: '', client: '', year: String(new Date().getFullYear()), text: '', img: PROTECTED_IMAGES[0] };
  tabOptions($('#p-tab'));
  pform.tab.value = p.tab;
  pform.title.value = p.title || '';
  pform.client.value = p.client || '';
  pform.year.value = p.year || '';
  pform.text.value = p.text || '';
  pform.linkHref.value = p.link?.href || '';
  pform.linkLabel.value = p.link?.label || '';
  setPrev(p.img);
  editGallery = Array.isArray(p.images) ? [...p.images] : [];
  renderGallery();
  const n = p.news || {};
  pform.nOutlet.value = n.outlet || '';
  pform.nDate.value = n.date || '';
  pform.nKicker.value = n.kicker || '';
  pform.nByline.value = n.byline || '';
  pform.nCaption.value = n.caption || '';
  setLogo(n.logo || '');
  syncNewsFields();
  $('#p-img-libbox').hidden = true;
  $('#p-del').hidden = i < 0;
  $('#dlg-title').textContent = i < 0 ? 'New project' : 'Edit project';
  dlg.showModal();
}
dlg.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]') || e.target === dlg) dlg.close();
});
pform.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = pform;
  const prev = editing >= 0 ? content.projects[editing] : null;
  const tabSame = prev?.tab === f.tab.value;
  // new cards (or cards moved to another tab) get a free-ish spot
  const n = content.projects.filter((p) => p.tab === f.tab.value).length;
  const pos = tabSame ? { x: prev.x, y: prev.y, w: prev.w, r: prev.r } : { x: 6 + (n * 23) % 66, y: 8 + (n * 17) % 50, w: 30, r: [-2, 1.5, -1, 2.5][n % 4] };
  const p = {
    ...(prev || {}),   // keep fields the form doesn't show (e.g. "news" on press pieces)
    tab: f.tab.value,
    img: editImg || PROTECTED_IMAGES[0],
    title: f.title.value.trim(),
    client: f.client.value.trim(),
    year: f.year.value.trim(),
    text: f.text.value.trim(),
    ...(f.linkHref.value.trim() ? { link: { href: f.linkHref.value.trim(), label: f.linkLabel.value.trim() || 'link' } } : {}),
    ...pos,
  };
  if (!f.linkHref.value.trim()) delete p.link;
  if (editGallery.length) p.images = [...editGallery]; else delete p.images;
  // the newspaper page (press release only; without an outlet the site guesses one from the link)
  if (p.tab === NEWS_TAB && f.nOutlet.value.trim()) {
    p.news = {
      ...(prev?.news || {}),
      outlet: f.nOutlet.value.trim(), date: f.nDate.value.trim(), kicker: f.nKicker.value.trim(),
      byline: f.nByline.value.trim(), caption: f.nCaption.value.trim(),
    };
    if (editLogo) p.news.logo = editLogo; else delete p.news.logo;
  } else delete p.news;
  if (editing >= 0) content.projects[editing] = p; else content.projects.push(p);
  dlg.close();
  changed(); renderProjects();
  toast('Saved. Click “Publish to site” to make it live.');
});
$('#p-del').addEventListener('click', () => {
  if (!confirm('Delete this project?')) return;
  content.projects.splice(editing, 1);
  dlg.close();
  changed(); renderProjects();
});
$('#p-tab').addEventListener('change', syncNewsFields);
$('#p-gal').addEventListener('click', (e) => {
  const rm = e.target.closest('[data-rm]'), left = e.target.closest('[data-left]');
  if (rm) editGallery.splice(+rm.dataset.rm, 1);
  if (left) { const i = +left.dataset.left; [editGallery[i - 1], editGallery[i]] = [editGallery[i], editGallery[i - 1]]; }
  renderGallery();
});
$('#p-gal-lib').addEventListener('click', () => { libMode = 'gal'; openLib(); });
$('#p-gal-file').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  for (const file of files) {
    try {
      const { b64, dataUrl, ext } = file.type.startsWith('video/') ? await prepareVideo(file) : await prepareImage(file);
      const path = `assets/work/${slug(pform.title.value || 'gallery')}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}.${ext}`;
      pending[path] = { b64, dataUrl };
      library.push(path);
      editGallery.push(path);
    } catch (err) { toast('Couldn’t read ' + file.name + ': ' + err.message, true); }
  }
  renderGallery();
  changed();
});
$('#p-logo-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const { b64, dataUrl, ext } = await prepareImage(file);
    const path = `assets/work/pr/logos/${slug(pform.nOutlet.value || file.name.replace(/\.[^.]+$/, ''))}-${Date.now().toString(36)}.${ext}`;
    pending[path] = { b64, dataUrl };
    setLogo(path);
    changed();
  } catch (err) { toast('Couldn’t read this image: ' + err.message, true); }
});
$('#p-logo-clear').addEventListener('click', () => setLogo(''));
// the picker: the gallery can take videos too, the main picture only pictures
function libHTML(withVideos) {
  const list = library.filter((p) => withVideos || !isVideo(p));
  return list.length ? list.map((p) => `<button type="button" data-p="${esc(p)}" title="${esc(p)}" style="${isVideo(p) ? '' : `background-image:url('${esc(imgURL(p))}')`}">${tile(p)}</button>`).join('')
    : '<small>No images found.</small>';
}
function openLib() {
  const box = $('#p-img-libbox');
  box.hidden = false;
  box.innerHTML = libHTML(true);
}
$('#p-img-lib').addEventListener('click', () => {
  const box = $('#p-img-libbox');
  libMode = 'main';
  box.hidden = !box.hidden;
  box.innerHTML = libHTML(false);
});
$('#p-img-libbox').addEventListener('click', (e) => {
  const b = e.target.closest('[data-p]');
  if (!b) return;
  if (libMode === 'gal') { editGallery.push(b.dataset.p); renderGallery(); }
  else setPrev(b.dataset.p);
  $('#p-img-libbox').hidden = true;
});
$('#p-img-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const { b64, dataUrl, ext } = await prepareImage(file);
    const path = `assets/work/${slug(pform.title.value || file.name.replace(/\.[^.]+$/, ''))}-${Date.now().toString(36)}.${ext}`;
    pending[path] = { b64, dataUrl };
    library.push(path);
    setPrev(path);
    changed();
  } catch (err) {
    toast('Couldn’t read this image: ' + err.message, true);
  }
});

// Videos go up as they are (no re-encoding in the browser), so they're kept to a size GitHub takes in one go.
// Until published, the dashboard (and its preview) plays the file straight from this computer.
const MAX_VIDEO = 40 * 1024 * 1024;
async function prepareVideo(file) {
  if (file.size > MAX_VIDEO) throw new Error(`it's ${(file.size / 1048576).toFixed(0)} MB, videos can be up to 40 MB (try exporting it smaller)`);
  const raw = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(file); });
  const ext = /webm/.test(file.type) ? 'webm' : /quicktime/.test(file.type) ? 'mov' : 'mp4';
  return { dataUrl: URL.createObjectURL(file), b64: raw.split(',')[1], ext };
}

// Big photos are scaled to 2400px and saved as JPEG; PNGs with transparency, GIFs and SVGs stay as they are.
async function prepareImage(file) {
  const raw = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(file); });
  const keep = (ext) => ({ dataUrl: raw, b64: raw.split(',')[1], ext });
  if (/gif|svg/.test(file.type)) return keep(file.type.includes('svg') ? 'svg' : 'gif');
  const img = new Image();
  img.src = raw;
  await img.decode();
  const scale = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  if (file.type === 'image/png') {
    const a = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < a.length; i += 4 * 7) if (a[i] < 250) {
      if (scale === 1) return keep('png');
      const dataUrl = cv.toDataURL('image/png');
      return { dataUrl, b64: dataUrl.split(',')[1], ext: 'png' };
    }
  }
  const dataUrl = cv.toDataURL('image/jpeg', 0.87);
  return { dataUrl, b64: dataUrl.split(',')[1], ext: 'jpg' };
}

// Layout stage -----------------------------------------------------------------
let selCard = -1;
function renderStage() {
  const stage = $('#stage');
  const tab = $('#lay-tab').value || content.tabs[0];
  const items = content.projects.map((p, i) => [p, i]).filter(([p]) => p.tab === tab);
  if (!items.some(([, i]) => i === selCard)) selCard = -1;
  stage.innerHTML = items.map(([p, i], k) => `
    <div class="sc${i === selCard ? ' sel' : ''}" data-i="${i}" style="left:${p.x}%;top:${p.y}%;width:${p.w}%;rotate:${p.r}deg;z-index:${k + 1}">
      <img src="${esc(imgURL(p.img))}" alt=""><span>${esc(p.title)}</span><i class="grip"></i>
    </div>`).join('') || '<div class="empty">This tab has no projects.</div>';
  renderLayCtrl();
}
function renderLayCtrl() {
  const p = content.projects[selCard];
  $('#lay-ctrl').hidden = !p;
  if (!p) return;
  $('#lay-name').textContent = p.title;
  $('#lay-r').value = p.r; $('#lay-r-out').textContent = p.r;
  $('#lay-w').value = p.w; $('#lay-w-out').textContent = p.w;
}
$('#lay-tab').addEventListener('change', () => { selCard = -1; renderStage(); });
$('#stage').addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.sc');
  if (!el) { selCard = -1; $$('.sc').forEach((c) => c.classList.remove('sel')); renderLayCtrl(); return; }
  e.preventDefault();
  const i = +el.dataset.i, p = content.projects[i];
  selCard = i;
  $$('.sc').forEach((c) => c.classList.toggle('sel', c === el));
  renderLayCtrl();
  const box = $('#stage').getBoundingClientRect();
  const resize = !!e.target.closest('.grip');
  const sx = e.clientX, sy = e.clientY, start = { x: p.x, y: p.y, w: p.w };
  const r1 = (v) => Math.round(v * 2) / 2;
  el.setPointerCapture(e.pointerId);
  const move = (ev) => {
    const dx = (ev.clientX - sx) / box.width * 100, dy = (ev.clientY - sy) / box.height * 100;
    if (resize) {
      p.w = r1(Math.max(8, Math.min(90, start.w + dx)));
      el.style.width = p.w + '%';
    } else {
      p.x = r1(Math.max(-10, Math.min(95, start.x + dx)));
      p.y = r1(Math.max(-10, Math.min(95, start.y + dy)));
      el.style.left = p.x + '%'; el.style.top = p.y + '%';
    }
    renderLayCtrl();
  };
  const up = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    changed();
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
});
$('#lay-r').addEventListener('input', (e) => {
  const p = content.projects[selCard]; if (!p) return;
  p.r = +e.target.value; $('#lay-r-out').textContent = p.r;
  $(`.sc[data-i="${selCard}"]`).style.rotate = p.r + 'deg';
  changed();
});
$('#lay-w').addEventListener('input', (e) => {
  const p = content.projects[selCard]; if (!p) return;
  p.w = +e.target.value; $('#lay-w-out').textContent = p.w;
  $(`.sc[data-i="${selCard}"]`).style.width = p.w + '%';
  changed();
});
// "bring to front": cards stack in list order, so move it to the end of its tab
$('#lay-front').addEventListener('click', () => {
  const p = content.projects[selCard]; if (!p) return;
  content.projects.splice(selCard, 1);
  content.projects.push(p);
  selCard = content.projects.length - 1;
  changed(); renderStage(); renderProjects();
});

// Home page ----------------------------------------------------------------------
// Words: x, y in % of the screen, w = word width in % of screen width (as on the site).
let homeDev = 'desktop', homeSel = -1;
function renderHome() {
  if (!content) return;
  const stage = $('#hstage');
  stage.classList.toggle('phone', homeDev === 'phone');
  $$('#home-dev [data-dev]').forEach((b) => b.classList.toggle('on', b.dataset.dev === homeDev));
  const layout = content.heroLayout[homeDev];
  if (homeSel >= content.hero.length) homeSel = -1;
  stage.replaceChildren(...content.hero.map((word, i) => {
    const el = document.createElement('div');
    el.className = 'hw' + (i === homeSel ? ' sel' : '');
    el.dataset.i = i;
    const l = layout[i];
    el.style.cssText = `left:${l.x}%; top:${l.y}%; width:${l.w}%`;
    el.appendChild(buildWordSVG(word, { line: true, letters: true }));
    return el;
  }));
  renderHomeCtrl();
  renderAnim();
  playAnim();
}
function renderHomeCtrl() {
  const l = content.heroLayout[homeDev][homeSel];
  $('#home-ctrl').hidden = !l;
  if (!l) return;
  $('#home-name').textContent = content.hero[homeSel];
  $('#home-w').value = l.w;
  $('#home-w-out').textContent = l.w;
}
$('#home-dev').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dev]');
  if (b) { homeDev = b.dataset.dev; renderHome(); }
});
$('#hstage').addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.hw');
  homeSel = el ? +el.dataset.i : -1;
  $$('.hw').forEach((w) => w.classList.toggle('sel', w === el));
  renderHomeCtrl();
  if (!el) return;
  e.preventDefault();
  const l = content.heroLayout[homeDev][homeSel];
  const box = $('#hstage').getBoundingClientRect();
  const sx = e.clientX, sy = e.clientY, start = { x: l.x, y: l.y };
  const r1 = (v) => Math.round(v * 10) / 10;
  el.setPointerCapture(e.pointerId);
  const move = (ev) => {
    l.x = r1(Math.max(-5, Math.min(100 - l.w + 5, start.x + (ev.clientX - sx) / box.width * 100)));
    l.y = r1(Math.max(-5, Math.min(95, start.y + (ev.clientY - sy) / box.height * 100)));
    el.style.left = l.x + '%';
    el.style.top = l.y + '%';
  };
  const up = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    changed();
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
});
$('#home-w').addEventListener('input', (e) => {
  const l = content.heroLayout[homeDev][homeSel]; if (!l) return;
  l.w = +e.target.value;
  $('#home-w-out').textContent = l.w;
  $(`.hw[data-i="${homeSel}"]`).style.width = l.w + '%';
  changed();
});
$('#home-reset').addEventListener('click', () => {
  content.heroLayout[homeDev] = content.hero.map((_, i) => ({ ...HERO_DEFAULT[homeDev][i % 2] }));
  changed(); renderHome();
});


// Letter animation settings, played live on the preview above.
let stopAnim = () => {};
function playAnim() {
  stopAnim();
  const letters = $$('#hstage .ch');
  const play = $('#anim-play').checked;
  stopAnim = animateLetters(letters, play ? content.heroAnim : { ...content.heroAnim, enabled: false }, $$('#hstage .hw'));
}
function renderAnim() {
  const a = content.heroAnim;
  $('[data-anim=easing]').innerHTML = Object.keys(EASINGS).map((k) => `<option value="${k}">${k}</option>`).join('');
  $$('[data-anim]').forEach((el) => {
    const k = el.dataset.anim;
    if (el.type === 'checkbox') el.checked = !!a[k]; else el.value = a[k];
  });
  $$('[data-out]').forEach((o) => { o.textContent = a[o.dataset.out]; });
  syncAnimFields();
}
// "each letter on its own" has no letter-to-letter delay or switch-off order
function syncAnimFields() {
  const scatter = content.heroAnim.order === 'scatter' && !content.heroAnim.spawn;
  $('[data-anim=drift]').disabled = !content.heroAnim.spawn;
  $('[data-anim=drift]').closest('label').classList.toggle('off', !content.heroAnim.spawn);
  $('#home-spawn-note').hidden = !content.heroAnim.spawn;
  ['step', 'offOrder'].forEach((k) => {
    const el = $(`[data-anim="${k}"]`);
    el.disabled = scatter;
    el.closest('label').classList.toggle('off', scatter);
  });
}
$('#anim').addEventListener('input', (e) => {
  const el = e.target.closest('[data-anim]');
  if (!el) return;
  const k = el.dataset.anim;
  content.heroAnim[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
  const o = $(`[data-out="${k}"]`);
  if (o) o.textContent = content.heroAnim[k];
  syncAnimFields();
  changed();
  clearTimeout(playAnim.t);
  playAnim.t = setTimeout(playAnim, 200);   // restart once the slider settles
});
$('#anim-play').addEventListener('change', playAnim);
$('#anim-reset').addEventListener('click', () => {
  content.heroAnim = { ...ANIM_DEFAULT };
  changed(); renderAnim(); playAnim();
});

// the site's typeface, so the home page preview looks like the real thing
loadFont().then((ok) => { if (ok && content) renderHome(); });

// Tabs -------------------------------------------------------------------------
function renderTabs() {
  $('#tab-list').innerHTML = content.tabs.map((t, i) => {
    const n = content.projects.filter((p) => p.tab === t).length;
    return `<li data-i="${i}">
      <span class="drag" data-drag title="Drag to reorder" aria-hidden="true">⠿</span>
      <input value="${esc(t)}" dir="auto" data-rename>
      <span class="n">${n} project${n === 1 ? '' : 's'}</span>
      <button type="button" data-move="-1" title="Up">↑</button>
      <button type="button" data-move="1" title="Down">↓</button>
      <button type="button" data-del class="danger">Delete</button>
    </li>`;
  }).join('');
}
$('#tab-list').addEventListener('change', (e) => {
  if (!e.target.matches('[data-rename]')) return;
  const i = +e.target.closest('li').dataset.i;
  const old = content.tabs[i], name = e.target.value.trim().toLowerCase();
  if (!name || (name !== old && content.tabs.includes(name))) { toast('That name is empty or already used.', true); e.target.value = old; return; }
  content.tabs[i] = name;
  content.projects.forEach((p) => { if (p.tab === old) p.tab = name; });
  changed(); renderAll();
});
$('#tab-list').addEventListener('click', (e) => {
  const li = e.target.closest('li'); if (!li) return;
  const i = +li.dataset.i;
  if (e.target.closest('[data-move]')) {
    const j = i + +e.target.closest('[data-move]').dataset.move;
    if (j < 0 || j >= content.tabs.length) return;
    [content.tabs[i], content.tabs[j]] = [content.tabs[j], content.tabs[i]];
    changed(); renderAll();
  } else if (e.target.closest('[data-del]')) {
    const t = content.tabs[i];
    const n = content.projects.filter((p) => p.tab === t).length;
    if (!confirm(n ? `Delete the tab “${t}” and its ${n} project${n === 1 ? '' : 's'}?` : `Delete the tab “${t}”?`)) return;
    content.tabs.splice(i, 1);
    content.projects = content.projects.filter((p) => p.tab !== t);
    changed(); renderAll();
  }
});
// drag a tab by its handle to put it somewhere else in the row (mouse or finger)
$('#tab-list').addEventListener('pointerdown', (e) => {
  const h = e.target.closest('[data-drag]'); if (!h) return;
  e.preventDefault();
  const list = $('#tab-list'), li = h.closest('li');
  li.classList.add('dragging');
  try { h.setPointerCapture(e.pointerId); } catch {}
  const move = (ev) => {
    const over = [...list.children].find((x) => { const r = x.getBoundingClientRect(); return x !== li && ev.clientY >= r.top && ev.clientY <= r.bottom; });
    if (!over) return;
    const r = over.getBoundingClientRect();
    list.insertBefore(li, ev.clientY < r.top + r.height / 2 ? over : over.nextSibling);
  };
  const up = () => {
    removeEventListener('pointermove', move);
    li.classList.remove('dragging');
    const order = [...list.children].map((x) => content.tabs[+x.dataset.i]);
    if (order.join('|') !== content.tabs.join('|')) { content.tabs = order; changed(); }
    renderAll();
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up, { once: true });
  addEventListener('pointercancel', up, { once: true });
});
$('#tab-add').addEventListener('click', () => {
  const name = $('#tab-new').value.trim().toLowerCase();
  if (!name || content.tabs.includes(name)) { toast('That name is empty or already used.', true); return; }
  content.tabs.push(name);
  $('#tab-new').value = '';
  changed(); renderAll();
});
$('#tab-new').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#tab-add').click(); });

// About ------------------------------------------------------------------------
function renderAbout() {
  $('#about-list').innerHTML = content.about.map((t, i) => `
    <div class="para" data-i="${i}">
      <textarea rows="3" dir="auto">${esc(t)}</textarea>
      <div class="btns">
        <button type="button" data-move="-1" title="Up">↑</button>
        <button type="button" data-move="1" title="Down">↓</button>
        <button type="button" data-del class="danger" title="Delete">×</button>
      </div>
    </div>`).join('');
}
$('#about-list').addEventListener('input', (e) => {
  const i = +e.target.closest('.para').dataset.i;
  content.about[i] = e.target.value;
  changed();
});
$('#about-list').addEventListener('click', (e) => {
  const el = e.target.closest('.para'); if (!el) return;
  const i = +el.dataset.i;
  if (e.target.closest('[data-move]')) {
    const j = i + +e.target.closest('[data-move]').dataset.move;
    if (j < 0 || j >= content.about.length) return;
    [content.about[i], content.about[j]] = [content.about[j], content.about[i]];
  } else if (e.target.closest('[data-del]')) {
    if (!confirm('Delete this paragraph?')) return;
    content.about.splice(i, 1);
  } else return;
  changed(); renderAbout();
});
$('#about-add').addEventListener('click', () => { content.about.push(''); changed(); renderAbout(); $('#about-list .para:last-child textarea').focus(); });

// General ----------------------------------------------------------------------
function renderGeneral() {
  $$('[data-bind]').forEach((el) => {
    const [a, b] = el.dataset.bind.split('.');
    el.value = content[a]?.[b] ?? '';
  });
}
$('.main').addEventListener('input', (e) => {
  const el = e.target.closest('[data-bind]'); if (!el) return;
  const [a, b] = el.dataset.bind.split('.');
  if (a === 'hero') {
    const h = [0, 1].map((k) => $(`[data-bind="hero.${k}"]`).value.trim().toLowerCase());
    content.hero = h.slice(0, h.findLastIndex((w) => w) + 1);
    normalize(content);
    renderHome();
  } else {
    content[a][b] = el.value.trim();
  }
  changed();
});

// History ----------------------------------------------------------------------
async function loadHistory() {
  const ul = $('#hist-list');
  ul.innerHTML = '<li><span class="meta">Loading…</span></li>';
  try {
    const commits = await gh(`commits?path=content.json&sha=${encodeURIComponent(conn.branch)}&per_page=30`);
    ul.innerHTML = commits.map((c, k) => `
      <li><span class="meta">${new Date(c.commit.author.date).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}${k === 0 ? ' · <b>current version</b>' : ''}
        <small dir="ltr">${esc(c.commit.message.split('\n')[0])}</small></span>
        ${k === 0 ? '' : `<button type="button" data-sha="${c.sha}">Restore this version</button>`}</li>`).join('');
  } catch (e) {
    ul.innerHTML = `<li><span class="meta">Error: ${esc(e.message)}</span></li>`;
  }
}
$('#hist-load').addEventListener('click', loadHistory);
$('#hist-list').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-sha]'); if (!b) return;
  if (dirty() && !confirm('This replaces your unpublished changes. Continue?')) return;
  try {
    const { content: c } = await fetchRemoteContent(b.dataset.sha);
    content = normalize(c);
    pending = {};
    changed(); renderAll();
    toast('That version is loaded. If it looks right, click “Publish to site”.', false, 5000);
  } catch (err) { toast('Error: ' + err.message, true); }
});
$('#btn-export').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json(content)], { type: 'application/json' }));
  a.download = `rocket-effect-content-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$('#btn-import').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const c = JSON.parse(await f.text());
    if (!Array.isArray(c.projects) || !Array.isArray(c.tabs)) throw new Error('Not a site content file');
    content = normalize(c);
    changed(); renderAll();
    toast('File loaded. If it looks right, click “Publish to site”.');
  } catch (err) { toast('Error: ' + err.message, true); }
});

// Top bar -------------------------------------------------------------------------
$('#btn-publish').addEventListener('click', publish);
$('#btn-discard').addEventListener('click', () => {
  if (!confirm('Discard all unpublished changes?')) return;
  content = normalize(JSON.parse(baseJSON));
  pending = {};
  clearState();
  loadLibrary().then(renderAll);
});
$('#btn-preview').addEventListener('click', () => {
  // the site reads this when opened with ?preview (this browser only)
  const c = structuredClone(content);
  c.projects.forEach((p) => {
    if (pending[p.img]) p.img = pending[p.img].dataUrl;
    if (p.images) p.images = p.images.map((i) => pending[i] ? pending[i].dataUrl + (isVideo(i) ? '#video' : '') : i);
    if (p.news?.logo && pending[p.news.logo]) p.news.logo = pending[p.news.logo].dataUrl;
  });
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(c)); }
  catch { toast('New images are too big for the preview; it opens without them.', true);
    c.projects.forEach((p) => { if (p.img.startsWith('data:')) p.img = PROTECTED_IMAGES[0]; });
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(c)); } catch {} }
  const tab = $('#lay-tab').value;
  const hash = !$('section[data-sec=home]').hidden ? '' : tab && !$('section[data-sec=layout]').hidden ? '#work/' + encodeURIComponent(tab) : '#work';
  window.open('../?preview' + hash, 'rocket-preview');
});

// Sign in -------------------------------------------------------------------------
// The panel opens only after a token with write access to the repo is entered.
// GitHub tokens are only letters, digits and _; copying through chat or notes apps
// can add invisible characters (or Persian digits) that break the request.
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩';
const cleanToken = (t) => t.replace(/[۰-۹٠-٩]/g, (d) => PERSIAN_DIGITS.indexOf(d) % 10).replace(/[^A-Za-z0-9_]/g, '');

async function signIn(token, remember) {
  if (!/^(github_pat_|gh[pousr]_)\w{20,}$/.test(token)) throw new Error('That doesn’t look like a GitHub token. Copy it again from GitHub and paste it here.');
  conn.token = token;
  const repo = await gh('');
  if (!repo.permissions?.push) throw new Error('This token can’t write to the site.');
  try {
    if (remember) localStorage.setItem(CONN_KEY, JSON.stringify({ token }));
    else localStorage.removeItem(CONN_KEY);
  } catch {}
}
function signOut(msg) {
  conn.token = '';
  try { localStorage.removeItem(CONN_KEY); } catch {}
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#login-msg').textContent = msg || '';
  $('#tok').value = '';
  $('#tok').focus();
}
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = cleanToken($('#tok').value);
  if (!token) return;
  const btn = $('#login-form button');
  btn.disabled = true;
  $('#login-msg').textContent = '';
  try {
    await signIn(token, $('#remember').checked);
    await openApp();
  } catch (err) {
    conn.token = '';
    $('#login-msg').textContent = err.status === 401 ? 'GitHub rejected this token (wrong, expired or deleted).'
      : err.status === 403 || err.status === 404 ? 'This token has no access to the rocket-effect repository.'
      : 'Couldn’t sign in: ' + err.message;
  } finally {
    btn.disabled = false;
  }
});
$('#btn-logout').addEventListener('click', () => {
  if (dirty() && !confirm('You have unpublished changes. Sign out anyway? (They stay saved on this device.)')) return;
  signOut();
});

// Load the published content; keep unsaved work if there is any.
async function reloadFromRemote(keepWork) {
  const r = await fetchRemoteContent();
  const remote = normalize(r.content);
  remoteSha = r.sha;
  const work = keepWork && content && dirty() ? content : null;
  const oldBase = baseJSON;
  baseJSON = json(remote);
  content = work && oldBase ? normalize(mergeContent(JSON.parse(oldBase), work, remote)) : work || remote;
  await loadLibrary();
  renderAll();
}

let appReady = false;
async function openApp() {
  await reloadFromRemote(false);
  $('#login').hidden = true;
  $('#app').hidden = false;
  if (appReady) return;
  appReady = true;
  // unsaved work from last time?
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY));
    if (s && (json(s.content) !== baseJSON || Object.keys(s.pending || {}).length)) {
      if (confirm('Found unpublished changes from last time. Keep them?')) {
        // the draft was made on an older version: apply only its changes onto what is published now
        content = s.baseJSON && s.baseJSON !== baseJSON
          ? normalize(mergeContent(JSON.parse(s.baseJSON), s.content, JSON.parse(baseJSON)))
          : normalize(s.content);
        pending = s.pending || {};
        await loadLibrary();
        renderAll();
      } else clearState();
    }
  } catch {}
  // publish option: remove images nobody uses
  const opt = document.createElement('label');
  opt.className = 'check';
  opt.innerHTML = '<input type="checkbox" id="opt-clean"> When publishing, also delete images no project uses';
  $('section[data-sec=history] .row').after(opt);
  let sec = 'projects';
  try { sec = sessionStorage.getItem('re-admin-sec') || sec; } catch {}
  showSec(sec);
}

// --- start ----------------------------------------------------------------------
(async function init() {
  let saved = '';
  try { saved = JSON.parse(localStorage.getItem(CONN_KEY))?.token || ''; } catch {}
  if (!saved) return signOut();
  $('#login-msg').textContent = 'Signing in…';
  try {
    await signIn(cleanToken(saved), true);
    await openApp();
  } catch (e) {
    signOut(e.status === 401 ? 'Your token has expired. Enter a new one.' : 'Couldn’t sign in: ' + e.message);
  }
})();
