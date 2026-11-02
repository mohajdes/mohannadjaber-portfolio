/*
 * Portfolio admin.
 * - Projects live in data/projects.json in the GitHub repo. "Publish" commits that file, and
 *   Cloudflare Pages redeploys the site automatically.
 * - Images/videos are uploaded straight to Cloudinary (unsigned upload preset).
 * Credentials are kept only in this browser's localStorage.
 */
const CFG_KEY = 'portfolioAdminCfg';
const DATA_PATH = 'data/projects.json';
const DEFAULTS = { token: '', repo: 'mohajdes/mohannadjaber-portfolio', branch: 'main', cloudName: 'dwo3dfocn', preset: '' };

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');

let cfg = loadCfg();
const state = { data: null, sha: null, dirty: false, busy: false, draft: null, draftIndex: -1, uploads: 0 };

// ---------- helpers ----------
function loadCfg() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(CFG_KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}
function saveCfg() { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(message, type = '') {
  toastEl.textContent = message;
  toastEl.className = `toast show ${type}`;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { toastEl.className = 'toast'; }, type === 'error' ? 6000 : 2800);
}

function thumb(url, width = 300) {
  if (!/^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(url || '')) return url || '';
  return url.replace(/\/image\/upload\/(?:.*?\/)?(v\d+\/)/, `/image/upload/f_auto,q_auto,w_${width}/$1`);
}

function slugify(text) {
  return String(text).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `project-${Date.now().toString(36)}`;
}

function uniqueId(base, ignoreIndex = -1) {
  const taken = new Set(state.data.projects.filter((_, i) => i !== ignoreIndex).map(p => p.id));
  let id = base, n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

function markDirty() { state.dirty = true; updateStatus(); }
function updateStatus() {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = state.dirty ? 'Unpublished changes' : 'All changes published';
  el.className = `status ${state.dirty ? 'dirty' : ''}`;
  const btn = document.getElementById('publish-btn');
  if (btn) btn.disabled = !state.dirty || state.busy;
}

window.addEventListener('beforeunload', e => {
  if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
});

// ---------- GitHub ----------
function fromBase64(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}
function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

async function github(method, body) {
  const url = `https://api.github.com/repos/${cfg.repo}/contents/${DATA_PATH}` + (method === 'GET' ? `?ref=${encodeURIComponent(cfg.branch)}` : '');
  const res = await fetch(url, {
    method,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = new Error(`GitHub error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function githubErrorMessage(err) {
  if (err.status === 401) return 'GitHub rejected the token. Check it in Settings.';
  if (err.status === 403) return 'The token has no permission to write to the repository (needs Contents: Read and write).';
  if (err.status === 404) return 'Repository or file not found. Check the repository and branch in Settings.';
  if (err.status === 409 || err.status === 422) return 'The projects file changed somewhere else. Reload the page to get the latest version.';
  return err.message || 'Could not reach GitHub.';
}

async function loadData() {
  const file = await github('GET');
  state.data = JSON.parse(fromBase64(file.content));
  state.sha = file.sha;
  state.dirty = false;
}

async function publish() {
  if (state.busy) return;
  state.busy = true;
  updateStatus();
  try {
    const res = await github('PUT', {
      message: 'Update portfolio projects (admin)',
      content: toBase64(JSON.stringify(state.data, null, 2) + '\n'),
      sha: state.sha,
      branch: cfg.branch,
    });
    state.sha = res.content.sha;
    state.dirty = false;
    toast('Published. The site will update in about a minute.', 'ok');
  } catch (err) {
    toast(githubErrorMessage(err), 'error');
  } finally {
    state.busy = false;
    updateStatus();
  }
}

// ---------- Cloudinary ----------
async function uploadToCloudinary(file) {
  const kind = file.type.startsWith('video/') ? 'video' : 'image';
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', cfg.preset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/${kind}/upload`, { method: 'POST', body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message || `Upload failed (${res.status})`);
  return json.secure_url;
}

async function uploadFiles(files, onEach) {
  if (!cfg.preset) { toast('Add your Cloudinary upload preset in Settings first.', 'error'); return; }
  state.uploads += files.length;
  renderUploadState();
  for (const file of files) {
    try {
      onEach(await uploadToCloudinary(file));
    } catch (err) {
      toast(`${file.name}: ${err.message}`, 'error');
    }
    state.uploads--;
    renderUploadState();
  }
}

function renderUploadState() {
  const el = document.getElementById('upload-state');
  if (el) el.textContent = state.uploads > 0 ? `Uploading ${state.uploads} file${state.uploads > 1 ? 's' : ''}…` : '';
  const save = document.getElementById('editor-save');
  if (save) save.disabled = state.uploads > 0;
}

// ---------- Views ----------
function render() {
  if (!cfg.token || !state.data) return renderSetup();
  renderMain();
}

function renderSetup(error = '') {
  app.innerHTML = `
    <div class="container setup">
      <h1>Portfolio Admin</h1>
      <p class="muted">Connect this page to your GitHub repository and Cloudinary account. This is saved only in this browser.</p>
      <div class="panel">
        ${error ? `<p style="color:var(--danger)">${esc(error)}</p>` : ''}
        ${settingsFields()}
        <button class="primary" id="connect-btn">Connect</button>
      </div>
    </div>`;
  document.getElementById('connect-btn').onclick = connect;
}

function settingsFields() {
  return `
    <div class="field">
      <label>GitHub token</label>
      <input type="password" id="f-token" value="${esc(cfg.token)}" autocomplete="off" placeholder="github_pat_…">
      <p class="muted">Create a <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">fine-grained token</a> limited to this one repository, with <b>Contents: Read and write</b>.</p>
    </div>
    <div class="row">
      <div class="field"><label>Repository</label><input type="text" id="f-repo" value="${esc(cfg.repo)}"></div>
      <div class="field"><label>Branch</label><input type="text" id="f-branch" value="${esc(cfg.branch)}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Cloudinary cloud name</label><input type="text" id="f-cloud" value="${esc(cfg.cloudName)}"></div>
      <div class="field"><label>Cloudinary upload preset</label><input type="text" id="f-preset" value="${esc(cfg.preset)}" placeholder="e.g. portfolio_unsigned"></div>
    </div>
    <p class="muted" style="margin-top:-6px">In Cloudinary: Settings → Upload → Upload presets → Add. Set <b>Signing mode: Unsigned</b>.</p>`;
}

function readSettings() {
  cfg = {
    token: document.getElementById('f-token').value.trim(),
    repo: document.getElementById('f-repo').value.trim(),
    branch: document.getElementById('f-branch').value.trim() || 'main',
    cloudName: document.getElementById('f-cloud').value.trim(),
    preset: document.getElementById('f-preset').value.trim(),
  };
  saveCfg();
}

async function connect() {
  readSettings();
  const btn = document.getElementById('connect-btn');
  btn.disabled = true;
  btn.textContent = 'Connecting…';
  try {
    await loadData();
    render();
  } catch (err) {
    renderSetup(githubErrorMessage(err));
  }
}

function renderMain() {
  const { categories, projects } = state.data;
  app.innerHTML = `
    <div class="topbar">
      <h2>Portfolio Admin</h2>
      <div class="actions">
        <span id="status" class="status"></span>
        <button id="settings-btn">Settings</button>
        <button class="primary" id="publish-btn">Publish</button>
      </div>
    </div>
    <div class="container">
      <div class="toolbar">
        <div class="chips">
          <span class="muted">Categories:</span>
          ${categories.map(c => `<span class="chip">${esc(c)}</span>`).join('')}
          <button class="small" id="cats-btn">Edit</button>
        </div>
        <button class="primary" id="add-btn">+ New project</button>
      </div>
      <div id="list">
        ${projects.map((p, i) => `
          <div class="project-row ${p.hidden ? 'is-hidden' : ''}" data-i="${i}">
            <img class="thumb" src="${esc(thumb(p.coverImage))}" alt="" loading="lazy">
            <div class="info">
              <strong>${esc(p.title)}${p.hidden ? '<span class="badge">Hidden</span>' : ''}</strong>
              <span class="muted">${esc(p.category)} · ${esc(p.tag)} · ${(p.images || []).length} images</span>
            </div>
            <div class="btns">
              <button class="small" data-act="up" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
              <button class="small" data-act="down" ${i === projects.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
              <a href="../project.html?id=${encodeURIComponent(p.id)}" target="_blank" rel="noopener"><button class="small">View</button></a>
              <button class="small" data-act="edit">Edit</button>
              <button class="small danger" data-act="delete">Delete</button>
            </div>
          </div>`).join('') || '<p class="muted">No projects yet. Click “New project”.</p>'}
      </div>
    </div>`;
  updateStatus();

  document.getElementById('publish-btn').onclick = publish;
  document.getElementById('add-btn').onclick = () => openEditor(-1);
  document.getElementById('settings-btn').onclick = openSettings;
  document.getElementById('cats-btn').onclick = editCategories;
  document.getElementById('list').onclick = e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const i = Number(btn.closest('.project-row').dataset.i);
    const act = btn.dataset.act;
    if (act === 'edit') openEditor(i);
    if (act === 'delete') deleteProject(i);
    if (act === 'up' || act === 'down') moveProject(i, act === 'up' ? -1 : 1);
  };
}

function moveProject(i, dir) {
  const list = state.data.projects;
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  markDirty();
  renderMain();
}

function deleteProject(i) {
  const p = state.data.projects[i];
  if (!confirm(`Delete “${p.title}”? It disappears from the site when you publish. (Images stay in Cloudinary.)`)) return;
  state.data.projects.splice(i, 1);
  markDirty();
  renderMain();
}

function editCategories() {
  const current = state.data.categories.join(', ');
  const input = prompt('Categories, separated by commas (these become the filter buttons on the Work page):', current);
  if (input === null) return;
  const next = [...new Set(input.split(',').map(s => s.trim()).filter(Boolean))];
  if (!next.length) return toast('Keep at least one category.', 'error');
  const orphaned = state.data.projects.filter(p => !next.includes(p.category));
  if (orphaned.length && !confirm(`${orphaned.length} project(s) use a removed category and won't show under any filter (they still appear under “All”). Continue?`)) return;
  state.data.categories = next;
  markDirty();
  renderMain();
}

// ---------- Settings modal ----------
function openSettings() {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3>Settings</h3></div>
      <div class="modal-body">${settingsFields()}</div>
      <div class="modal-foot">
        <button class="danger" id="logout-btn">Disconnect</button>
        <div><button id="s-cancel">Cancel</button> <button class="primary" id="s-save">Save</button></div>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('#s-cancel').onclick = () => wrap.remove();
  wrap.querySelector('#s-save').onclick = () => {
    const oldRepo = cfg.repo, oldBranch = cfg.branch;
    readSettings();
    wrap.remove();
    toast(oldRepo !== cfg.repo || oldBranch !== cfg.branch ? 'Saved. Reload the page to load the new repository.' : 'Settings saved.', 'ok');
  };
  wrap.querySelector('#logout-btn').onclick = () => {
    if (state.dirty && !confirm('You have unpublished changes that will be lost. Disconnect anyway?')) return;
    state.dirty = false;
    cfg.token = '';
    saveCfg();
    state.data = null;
    wrap.remove();
    render();
  };
}

// ---------- Project editor ----------
function openEditor(index) {
  const isNew = index < 0;
  state.draftIndex = index;
  state.draft = isNew
    ? { id: '', title: '', tag: '', category: state.data.categories[0], coverImage: '', description: '', images: [] }
    : JSON.parse(JSON.stringify(state.data.projects[index]));
  state.draft.images = state.draft.images || [];

  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.id = 'editor';
  wrap.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3>${isNew ? 'New project' : 'Edit project'}</h3><span class="muted" id="upload-state"></span></div>
      <div class="modal-body">
        <div class="field"><label>Title</label><input type="text" data-f="title"></div>
        <div class="row">
          <div class="field"><label>Tag (small text on the card, e.g. “Logo & Branding”)</label><input type="text" data-f="tag"></div>
          <div class="field"><label>Category (filter on the Work page)</label>
            <select data-f="category">${state.data.categories.map(c => `<option>${esc(c)}</option>`).join('')}</select>
          </div>
        </div>
        <div class="field"><label>Description</label><textarea data-f="description"></textarea></div>
        <div class="field"><label>Cover image (shown on the Work page grid)</label><div id="cover-box"></div></div>
        <div class="field"><label>Gallery images (shown in this order on the project page)</label>
          <div class="dropzone" id="dropzone">
            Drop images here or <button class="small" id="pick-images" type="button">choose files</button>
            <input type="file" id="file-images" accept="image/*" multiple class="hidden">
          </div>
          <div class="row" style="margin-top:10px">
            <input type="url" id="img-url" placeholder="…or paste an image URL">
            <button type="button" id="add-url" style="flex:none">Add</button>
          </div>
          <div class="gallery" id="gallery"></div>
        </div>
        <div class="field"><label>Video URL (optional)</label>
          <div class="row">
            <input type="url" data-f="video" placeholder="https://…mp4">
            <button type="button" id="pick-video" style="flex:none">Upload video</button>
            <input type="file" id="file-video" accept="video/*" class="hidden">
          </div>
        </div>
        <label class="checkbox"><input type="checkbox" data-f="hidden"> Hide from the site (draft)</label>
      </div>
      <div class="modal-foot">
        <button id="editor-cancel">Cancel</button>
        <button class="primary" id="editor-save">Save project</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  // Fill the text fields, then keep the draft in sync without re-rendering (keeps focus).
  wrap.querySelectorAll('[data-f]').forEach(el => {
    const key = el.dataset.f;
    if (el.type === 'checkbox') el.checked = !!state.draft[key];
    else el.value = state.draft[key] || '';
    el.addEventListener('input', () => { state.draft[key] = el.type === 'checkbox' ? el.checked : el.value; });
  });

  renderMedia();

  wrap.querySelector('#editor-cancel').onclick = closeEditor;
  wrap.querySelector('#editor-save').onclick = saveDraft;
  wrap.querySelector('#pick-images').onclick = () => wrap.querySelector('#file-images').click();
  wrap.querySelector('#file-images').onchange = e => { addImageFiles([...e.target.files]); e.target.value = ''; };
  wrap.querySelector('#pick-video').onclick = () => wrap.querySelector('#file-video').click();
  wrap.querySelector('#file-video').onchange = async e => {
    const [file] = e.target.files;
    e.target.value = '';
    if (!file) return;
    await uploadFiles([file], url => {
      state.draft.video = url;
      wrap.querySelector('[data-f="video"]').value = url;
    });
  };
  wrap.querySelector('#add-url').onclick = () => {
    const input = wrap.querySelector('#img-url');
    const url = input.value.trim();
    if (!/^https?:\/\//.test(url)) return toast('Enter a full image URL starting with https://', 'error');
    state.draft.images.push(url);
    input.value = '';
    renderMedia();
  };

  const dz = wrap.querySelector('#dropzone');
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => addImageFiles([...e.dataTransfer.files]));

  wrap.querySelector('#cover-box').onclick = e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'cover-upload') wrap.querySelector('#file-cover').click();
    if (act === 'cover-clear') { state.draft.coverImage = ''; renderMedia(); }
  };
  wrap.querySelector('#gallery').onclick = e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const i = Number(btn.closest('.g-item').dataset.i);
    const imgs = state.draft.images;
    const act = btn.dataset.act;
    if (act === 'left' && i > 0) [imgs[i - 1], imgs[i]] = [imgs[i], imgs[i - 1]];
    if (act === 'right' && i < imgs.length - 1) [imgs[i + 1], imgs[i]] = [imgs[i], imgs[i + 1]];
    if (act === 'remove') imgs.splice(i, 1);
    if (act === 'as-cover') state.draft.coverImage = imgs[i];
    renderMedia();
  };
}

function addImageFiles(files) {
  const images = files.filter(f => f.type.startsWith('image/'));
  if (!images.length) return;
  const draft = state.draft;
  uploadFiles(images, url => {
    if (state.draft !== draft) return; // editor was closed meanwhile
    draft.images.push(url);
    renderMedia();
  });
}

function renderMedia() {
  const cover = document.getElementById('cover-box');
  const gallery = document.getElementById('gallery');
  if (!cover || !gallery) return;
  const d = state.draft;

  cover.innerHTML = `
    ${d.coverImage ? `<img src="${esc(thumb(d.coverImage, 400))}" alt="Cover">` : '<div class="cover-empty">No cover</div>'}
    <div class="stack">
      <input type="url" id="cover-url" placeholder="Paste a cover image URL" value="${esc(d.coverImage)}">
      <div>
        <button type="button" class="small" data-act="cover-upload">Upload cover</button>
        ${d.coverImage ? '<button type="button" class="small danger" data-act="cover-clear">Remove</button>' : ''}
        <input type="file" id="file-cover" accept="image/*" class="hidden">
      </div>
      <span class="muted">Tip: you can also click “Use as cover” on any gallery image.</span>
    </div>`;
  cover.querySelector('#cover-url').onchange = e => { d.coverImage = e.target.value.trim(); renderMedia(); };
  cover.querySelector('#file-cover').onchange = async e => {
    const [file] = e.target.files;
    if (!file) return;
    await uploadFiles([file], url => { if (state.draft === d) { d.coverImage = url; renderMedia(); } });
  };

  gallery.innerHTML = d.images.map((url, i) => `
    <div class="g-item" data-i="${i}">
      <div class="g-num">#${i + 1}</div>
      <img src="${esc(thumb(url))}" alt="" loading="lazy">
      <div class="g-btns">
        <button type="button" class="small" data-act="left" ${i === 0 ? 'disabled' : ''} title="Move earlier">←</button>
        <button type="button" class="small" data-act="right" ${i === d.images.length - 1 ? 'disabled' : ''} title="Move later">→</button>
        <button type="button" class="small" data-act="as-cover" title="Use as cover">★</button>
        <button type="button" class="small danger" data-act="remove" title="Remove">✕</button>
      </div>
    </div>`).join('');
}

function closeEditor() {
  document.getElementById('editor')?.remove();
  state.draft = null;
}

function saveDraft() {
  const d = state.draft;
  d.title = d.title.trim();
  if (!d.title) return toast('Please enter a title.', 'error');
  if (!d.coverImage) return toast('Please add a cover image.', 'error');

  const project = {
    id: d.id || uniqueId(slugify(d.title), state.draftIndex),
    title: d.title,
    tag: (d.tag || '').trim(),
    category: d.category,
    coverImage: d.coverImage,
    description: (d.description || '').trim(),
    images: d.images,
  };
  const video = (d.video || '').trim();
  if (video) project.video = video;
  if (d.hidden) project.hidden = true;

  if (state.draftIndex < 0) state.data.projects.unshift(project); // new projects appear first
  else state.data.projects[state.draftIndex] = project;

  closeEditor();
  markDirty();
  renderMain();
  toast('Saved. Click Publish to put it on the site.', 'ok');
}

// ---------- start ----------
(async function init() {
  if (cfg.token) {
    app.innerHTML = '<div class="container"><p class="muted">Loading…</p></div>';
    try { await loadData(); } catch (err) { return renderSetup(githubErrorMessage(err)); }
  }
  render();
})();
