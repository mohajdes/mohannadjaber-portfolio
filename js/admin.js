/*
 * In-place editor for the portfolio. Loaded by main.js only for a logged-in admin.
 * Every change is saved automatically to /api/admin/projects. Images go straight to Cloudinary.
 */
(function () {
  'use strict';

  const CLOUD = 'dwo3dfocn';
  const PRESET = 'portfolio_unsigned';
  const SORTABLE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.2/Sortable.min.js';

  const svg = d => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const icon = {
    eye: svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: svg('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'),
    trash: svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'),
    star: svg('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = window.esc;
  const opt = window.optimizeImage;

  let ctx = null;          // { data, project?, render, afterRender }
  let reorderOn = false;

  // ---------- toast & status ----------
  function toast(message, opts = {}) {
    let el = $('.pf-toast');
    if (!el) {
      el = document.createElement('div');
      document.body.appendChild(el);
    }
    el.className = `pf-toast show ${opts.kind || ''}`;
    el.innerHTML = `<span>${esc(message)}</span>`;
    if (opts.undo) {
      const btn = document.createElement('button');
      btn.textContent = 'Undo';
      btn.onclick = () => { el.classList.remove('show'); opts.undo(); };
      el.appendChild(btn);
    }
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), opts.ms || (opts.undo ? 7000 : 2800));
  }

  function setStatus(text, kind = '') {
    const el = $('#pf-status');
    if (el) { el.textContent = text; el.className = `pf-status ${kind}`; }
  }

  // ---------- saving ----------
  const saver = { timer: null, inflight: false, dirty: false };

  function save() {
    saver.dirty = true;
    setStatus('Saving…');
    clearTimeout(saver.timer);
    saver.timer = setTimeout(flush, 500);
  }

  async function flush() {
    clearTimeout(saver.timer);
    if (saver.inflight || !saver.dirty) return;
    saver.inflight = true;
    saver.dirty = false;
    let failed = false;
    const d = ctx.data;
    try {
      const res = await fetch('/api/admin/projects', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseRev: d.rev, categories: d.categories, projects: d.projects }),
      });
      if (res.status === 401) { sessionExpired(); return; }
      if (res.status === 409) {
        toast('This was changed in another tab or device. Reloading…', { kind: 'error' });
        setTimeout(() => location.reload(), 1500);
        return;
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.status);
      d.rev = (await res.json()).rev;
      if (!saver.dirty) setStatus('All changes saved ✓', 'ok');
    } catch (err) {
      failed = true;
      saver.dirty = true;
      setStatus('Could not save, retrying…', 'err');
      setTimeout(flush, 4000);
    } finally {
      saver.inflight = false;
    }
    if (saver.dirty && !failed) flush();
  }

  async function saveNow() {
    for (let i = 0; i < 5; i++) {
      while (saver.inflight) await sleep(50);
      if (!saver.dirty) return true;
      await flush();
    }
    return !saver.dirty;
  }

  function sessionExpired() {
    localStorage.removeItem('pf-admin');
    toast('Your session expired. Please log in again.', { kind: 'error', ms: 5000 });
    setTimeout(() => { location.href = 'admin/'; }, 1800);
  }

  window.addEventListener('beforeunload', e => {
    if (saver.dirty || saver.inflight) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------- uploads (Cloudinary) ----------
  // Huge images are shrunk in the browser first so uploads are quick and stay under Cloudinary's size limit.
  async function prepare(file) {
    if (!file.type.startsWith('image/') || /svg|gif/.test(file.type)) return file;
    const MAX = 3200;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size <= 9 * 1024 * 1024) { bmp.close?.(); return file; }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close?.();
      const blob = await new Promise(r => canvas.toBlob(r, 'image/webp', 0.92));
      return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.webp', { type: 'image/webp' }) : file;
    } catch (e) {
      return file;
    }
  }

  async function uploadOne(file) {
    const kind = file.type.startsWith('video/') ? 'video' : 'image';
    const form = new FormData();
    form.append('file', kind === 'image' ? await prepare(file) : file);
    form.append('upload_preset', PRESET);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/${kind}/upload`, { method: 'POST', body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error?.message || `Upload failed (${res.status})`);
    return body.secure_url;
  }

  async function uploadMany(files) {
    const urls = new Array(files.length).fill(null);
    let next = 0, done = 0;
    const worker = async () => {
      while (next < files.length) {
        const i = next++;
        try { urls[i] = await uploadOne(files[i]); }
        catch (err) { toast(`${files[i].name}: ${err.message}`, { kind: 'error', ms: 6000 }); }
        setStatus(`Uploading ${++done}/${files.length}…`);
      }
    };
    setStatus(`Uploading 0/${files.length}…`);
    await Promise.all([worker(), worker(), worker()]);
    setStatus(saver.dirty ? 'Saving…' : 'All changes saved ✓', saver.dirty ? '' : 'ok');
    return urls.filter(Boolean);
  }

  function pickFiles({ multiple = true, accept = 'image/*' } = {}) {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.multiple = multiple;
      input.onchange = () => resolve([...input.files]);
      input.oncancel = () => resolve([]);
      input.click();
    });
  }

  // ---------- small UI helpers ----------
  function buildBar(html) {
    const bar = document.createElement('div');
    bar.className = 'pf-bar';
    bar.innerHTML = html + '<span class="pf-status" id="pf-status"></span>';
    document.body.appendChild(bar);
    return bar;
  }

  function modal(title, bodyHTML, { submitLabel = 'Save', onSubmit, onOpen } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'pf-modal-bg';
    wrap.innerHTML = `
      <form class="pf-modal">
        <h3>${esc(title)}</h3>
        <div class="pf-modal-body">${bodyHTML}</div>
        <div class="pf-modal-error" role="alert"></div>
        <div class="pf-modal-foot">
          <button type="button" class="pf-btn" data-close>Cancel</button>
          <button type="submit" class="pf-btn pf-primary">${esc(submitLabel)}</button>
        </div>
      </form>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
    wrap.querySelector('[data-close]').onclick = close;
    wrap.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      wrap.querySelector('.pf-modal-error').textContent = '';
      const err = await onSubmit(wrap);
      if (err) wrap.querySelector('.pf-modal-error').textContent = err; else close();
    });
    if (onOpen) onOpen(wrap);
    return wrap;
  }

  let sortableLoad = null;
  function loadSortable() {
    if (!sortableLoad) {
      sortableLoad = new Promise((resolve, reject) => {
        if (window.Sortable) return resolve(window.Sortable);
        const s = document.createElement('script');
        s.src = SORTABLE_SRC;
        s.onload = () => resolve(window.Sortable);
        s.onerror = () => { sortableLoad = null; reject(new Error('Could not load drag & drop')); };
        document.head.appendChild(s);
      });
    }
    return sortableLoad;
  }

  const byId = id => ctx.data.projects.find(p => p.id === id);

  async function logout() {
    await saveNow();
    try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); } catch (e) { /* ignore */ }
    localStorage.removeItem('pf-admin');
    location.href = 'index.html';
  }

  function changePassword() {
    modal('Change password', `
      <label class="pf-label">Current password<input type="password" name="current" autocomplete="current-password" required></label>
      <label class="pf-label">New password (8+ characters)<input type="password" name="next" autocomplete="new-password" minlength="8" required></label>
      <label class="pf-label">Repeat new password<input type="password" name="again" autocomplete="new-password" required></label>`, {
      onSubmit: async w => {
        const f = w.querySelector('form');
        if (f.next.value !== f.again.value) return 'The new passwords do not match.';
        const res = await fetch('/api/admin/password', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current: f.current.value, next: f.next.value }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return body.error || 'Could not change the password.';
        toast('Password changed', { kind: 'ok' });
      },
    });
  }

  // ---------- project actions shared by both pages ----------
  function togglePublish(project) {
    if (project.hidden) {
      if (!project.coverImage) { toast('Add a cover photo first, then publish.', { kind: 'error' }); return false; }
      project.hidden = false;
    } else {
      project.hidden = true;
    }
    save();
    ctx.render();
    toast(project.hidden ? 'Unpublished. Visitors no longer see it.' : 'Published.');
    return true;
  }

  // =====================================================================
  // WORK PAGE
  // =====================================================================
  function mountWork(c) {
    ctx = c;
    const grid = $('#project-grid');

    buildBar(`
      <button class="pf-btn pf-primary" data-act="add">＋ Add project</button>
      <button class="pf-btn" data-act="categories">Categories</button>
      <button class="pf-btn" data-act="password">Password</button>
      <button class="pf-btn" data-act="logout">Log out</button>`)
      .addEventListener('click', e => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'add') addProject();
        if (act === 'categories') editCategories();
        if (act === 'password') changePassword();
        if (act === 'logout') logout();
      });

    // Controls on cards (clicking anywhere else still opens the project).
    grid.addEventListener('click', e => {
      const btn = e.target.closest('.pf-ctl button');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const project = byId(btn.closest('.project-card').dataset.id);
      if (btn.dataset.act === 'toggle') togglePublish(project);
      if (btn.dataset.act === 'delete') deleteProject(project);
    }, true);

    c.afterRender = decorateGrid;
    decorateGrid();

    loadSortable().then(Sortable => {
      new Sortable(grid, {
        draggable: '.project-card',
        filter: '.pf-ctl',
        preventOnFilter: false,
        animation: 180,
        ghostClass: 'pf-ghost',
        delay: 150,
        delayOnTouchOnly: true,
        onEnd: applyGridOrder,
      });
    }).catch(err => toast(err.message, { kind: 'error' }));
  }

  function decorateGrid() {
    document.querySelectorAll('#project-grid .project-card[data-id]').forEach(card => {
      const p = byId(card.dataset.id);
      card.insertAdjacentHTML('beforeend', `
        ${p.hidden ? '<span class="pf-draft">Draft</span>' : ''}
        <div class="pf-ctl">
          <button type="button" data-act="toggle" title="${p.hidden ? 'Publish' : 'Unpublish (make it a draft)'}">${p.hidden ? icon.eyeOff : icon.eye}</button>
          <button type="button" data-act="delete" title="Delete project">${icon.trash}</button>
        </div>`);
    });
  }

  // Dragging only reorders the visible cards, in the slots those projects already occupy.
  function applyGridOrder() {
    const ids = [...$('#project-grid').querySelectorAll('.project-card')].map(el => el.dataset.id);
    const all = ctx.data.projects;
    const lookup = new Map(all.map(p => [p.id, p]));
    const slots = all.map((p, i) => (ids.includes(p.id) ? i : -1)).filter(i => i >= 0);
    ids.forEach((id, k) => { all[slots[k]] = lookup.get(id); });
    save();
  }

  function deleteProject(project) {
    if (!confirm(`Delete “${project.title || 'Untitled project'}”? You can undo for a few seconds.`)) return;
    const list = ctx.data.projects;
    const index = list.indexOf(project);
    list.splice(index, 1);
    save();
    ctx.render();
    toast('Project deleted.', { undo: () => { list.splice(index, 0, project); save(); ctx.render(); } });
  }

  async function addProject() {
    const d = ctx.data;
    let id;
    do { id = 'project-' + Math.random().toString(36).slice(2, 8); } while (d.projects.some(p => p.id === id));
    const project = { id, title: 'Untitled project', tag: '', category: d.categories[0], coverImage: '', description: '', images: [], hidden: true };
    d.projects.unshift(project);
    save();
    setStatus('Creating…');
    if (!await saveNow()) {
      d.projects.shift();
      return toast('Could not create the project. Please try again.', { kind: 'error' });
    }
    location.href = `project.html?id=${encodeURIComponent(id)}`;
  }

  function editCategories() {
    const rows = ctx.data.categories.map(name => ({ orig: name, name }));
    modal('Categories', `
      <div class="pf-cat-list"></div>
      <button type="button" class="pf-btn" data-add>＋ Add category</button>
      <p class="pf-hint">These are the filter buttons on the Work page. Renaming a category renames it on its projects too.</p>`, {
      onOpen: w => {
        const list = $('.pf-cat-list', w);
        const draw = () => {
          list.innerHTML = rows.map((r, i) => `
            <div class="pf-cat-row" data-i="${i}">
              <input type="text" value="${esc(r.name)}" maxlength="40" aria-label="Category name">
              <button type="button" class="pf-btn" data-a="up" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="pf-btn" data-a="down" ${i === rows.length - 1 ? 'disabled' : ''}>↓</button>
              <button type="button" class="pf-btn" data-a="del" ${rows.length === 1 ? 'disabled' : ''}>✕</button>
            </div>`).join('');
        };
        draw();
        list.addEventListener('input', e => { rows[+e.target.closest('.pf-cat-row').dataset.i].name = e.target.value; });
        list.addEventListener('click', e => {
          const a = e.target.closest('[data-a]')?.dataset.a;
          if (!a) return;
          const i = +e.target.closest('.pf-cat-row').dataset.i;
          if (a === 'del') rows.splice(i, 1);
          if (a === 'up') [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]];
          if (a === 'down') [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]];
          draw();
        });
        $('[data-add]', w).onclick = () => { rows.push({ orig: null, name: '' }); draw(); list.querySelector('.pf-cat-row:last-child input').focus(); };
      },
      onSubmit: () => {
        const names = rows.map(r => r.name.trim());
        if (names.some(n => !n)) return 'Category names cannot be empty.';
        if (new Set(names).size !== names.length) return 'Category names must be different.';

        const kept = new Set(rows.map(r => r.orig).filter(Boolean));
        const orphaned = ctx.data.projects.filter(p => !kept.has(p.category) && !names.includes(p.category));
        if (orphaned.length && !confirm(`${orphaned.length} project(s) belong to a removed category. They will still show under “All”, but not under any filter. Continue?`)) return 'Cancelled.';

        const rename = new Map(rows.filter(r => r.orig && r.orig !== r.name.trim()).map(r => [r.orig, r.name.trim()]));
        ctx.data.projects.forEach(p => { if (rename.has(p.category)) p.category = rename.get(p.category); });
        ctx.data.categories = names;
        save();
        ctx.render();
      },
    });
  }

  // =====================================================================
  // PROJECT PAGE
  // =====================================================================
  function mountProject(c) {
    ctx = c;
    const P = c.project;
    const root = $('#project-detail-container');

    buildBar(`
      <a class="pf-btn" href="work.html">← Work</a>
      <button class="pf-btn pf-primary" data-act="add-end">＋ Add images</button>
      <button class="pf-btn" data-act="reorder" id="pf-reorder-btn">⇅ Reorder images</button>
      <button class="pf-btn" data-act="settings">⚙ Settings</button>
      <button class="pf-btn" data-act="logout">Log out</button>`)
      .addEventListener('click', e => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'add-end') addImages(P.images.length, null, 'end');
        if (act === 'reorder') toggleReorder(!reorderOn);
        if (act === 'settings') togglePanel();
        if (act === 'logout') logout();
      });

    root.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const item = btn.closest('.gallery-item');
      const i = item ? +item.dataset.i : -1;
      switch (btn.dataset.act) {
        case 'edit-title': return editTitle();
        case 'edit-desc': return editDescription();
        case 'del-desc': return deleteDescription();
        case 'add-above': return addImages(i, item, 'above');
        case 'add-below': return addImages(i + 1, item, 'below');
        case 'add-first': return addImages(0, null, 'end');
        case 'cover': P.coverImage = P.images[i]; save(); ctx.render(); renderPanel(true); return toast('Cover photo updated.');
        case 'del-img': return deleteImage(i);
      }
    });

    // Drop image files anywhere on the page to add them at the end.
    window.addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
    window.addEventListener('drop', e => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      addImages(P.images.length, null, 'end', [...e.dataTransfer.files]);
    });

    buildPanel();
    c.afterRender = decorateProject;
    decorateProject();
  }

  function decorateProject() {
    const P = ctx.project;
    const root = $('#project-detail-container');

    // Title + description tools
    const h1 = $('.project-header-title', root);
    h1.insertAdjacentHTML('afterend', '<div class="pf-row" data-row="title"><button type="button" class="pf-pill" data-act="edit-title">✎ Edit title</button></div>');
    const desc = $('.project-header-description', root);
    (desc || $('[data-row="title"]', root)).insertAdjacentHTML('afterend', `<div class="pf-row" data-row="desc">${
      P.description
        ? '<button type="button" class="pf-pill" data-act="edit-desc">✎ Edit description</button><button type="button" class="pf-pill pf-pill-danger" data-act="del-desc">Delete description</button>'
        : '<button type="button" class="pf-pill" data-act="edit-desc">＋ Add description</button>'}</div>`);

    // Image tools, shown on hover
    root.querySelectorAll('.gallery-item').forEach(item => {
      const url = P.images[+item.dataset.i];
      item.insertAdjacentHTML('beforeend', `
        <div class="pf-img-ctl">
          <button type="button" class="pf-add pf-add-top" data-act="add-above">＋ Add image above</button>
          <div class="pf-img-tools">
            <button type="button" data-act="cover" title="Use as cover photo">${icon.star}</button>
            <button type="button" data-act="del-img" title="Delete image">${icon.trash}</button>
          </div>
          <button type="button" class="pf-add pf-add-bottom" data-act="add-below">＋ Add image below</button>
        </div>
        ${url === P.coverImage ? '<span class="pf-cover-badge">Cover</span>' : ''}`);
    });

    if (!P.images.length) {
      $('.project-gallery', root).insertAdjacentHTML('beforeend', `
        <div class="pf-empty"><p>No images yet</p>
        <button type="button" class="pf-btn pf-primary" data-act="add-first">＋ Add images</button>
        <p class="pf-hint">…or drop image files anywhere on this page.</p></div>`);
    }

    if (!$('.pf-panel').contains(document.activeElement)) renderPanel(false);
  }

  function editTitle() {
    const P = ctx.project;
    const h1 = $('.project-header-title');
    const original = P.title;
    h1.contentEditable = 'true';
    h1.classList.add('pf-editing');
    h1.focus();
    document.getSelection().selectAllChildren(h1);

    h1.onpaste = e => {
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\s+/g, ' '));
    };
    h1.onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); h1.blur(); }
      if (e.key === 'Escape') { h1.textContent = original; h1.blur(); }
    };
    h1.onblur = () => {
      h1.onblur = null;
      const value = h1.textContent.replace(/\s+/g, ' ').trim();
      if (value && value !== original) { P.title = value; save(); }
      ctx.render();
    };
  }

  function editDescription() {
    const P = ctx.project;
    const header = $('.project-header');
    const desc = $('.project-header-description', header);
    const titleRow = $('[data-row="title"]', header);
    if (desc) desc.hidden = true;
    $('[data-row="desc"]', header).hidden = true;

    titleRow.insertAdjacentHTML('afterend', `
      <div class="pf-desc-edit">
        <textarea rows="7" placeholder="Describe the project…">${esc(P.description)}</textarea>
        <div class="pf-row"><button type="button" class="pf-btn pf-primary" data-s>Save</button><button type="button" class="pf-btn" data-c>Cancel</button></div>
      </div>`);
    const box = $('.pf-desc-edit', header);
    const ta = $('textarea', box);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    $('[data-c]', box).onclick = () => ctx.render();
    $('[data-s]', box).onclick = () => {
      const value = ta.value.trim();
      if (value !== P.description) { P.description = value; save(); }
      ctx.render();
    };
  }

  function deleteDescription() {
    const P = ctx.project;
    const previous = P.description;
    P.description = '';
    save();
    ctx.render();
    toast('Description deleted.', { undo: () => { P.description = previous; save(); ctx.render(); } });
  }

  async function addImages(at, anchor, where, droppedFiles) {
    const P = ctx.project;
    const picked = droppedFiles || await pickFiles();
    const files = picked.filter(f => f.type.startsWith('image/'));
    if (picked.length && !files.length) return toast('Only image files can be added here.', { kind: 'error' });
    if (!files.length) return;

    // Show placeholders where the images will land.
    const placeholders = files.map(() => {
      const ph = document.createElement('div');
      ph.className = 'pf-placeholder';
      ph.textContent = 'Uploading…';
      return ph;
    });
    const gallery = $('.project-gallery');
    if (anchor && where === 'above') anchor.before(...placeholders);
    else if (anchor && where === 'below') anchor.after(...placeholders);
    else gallery.append(...placeholders);

    const urls = await uploadMany(files);
    placeholders.forEach(ph => ph.remove());
    if (!urls.length) return;

    P.images.splice(Math.min(at, P.images.length), 0, ...urls);
    if (!P.coverImage) P.coverImage = urls[0];
    save();
    ctx.render();
    renderPanel(true);
    toast(`${urls.length} image${urls.length > 1 ? 's' : ''} added.`);
  }

  function deleteImage(index) {
    const P = ctx.project;
    const [url] = P.images.splice(index, 1);
    save();
    ctx.render();
    toast('Image deleted.', { undo: () => { P.images.splice(index, 0, url); save(); ctx.render(); renderPanel(true); } });
    renderPanel(true);
  }

  function toggleReorder(on) {
    const P = ctx.project;
    const gallery = $('.project-gallery');
    if (on && P.images.length < 2) return toast('Add at least two images to reorder them.');
    reorderOn = on;
    $('#pf-reorder-btn').textContent = on ? '✓ Done reordering' : '⇅ Reorder images';
    $('#pf-reorder-btn').classList.toggle('pf-primary', on);

    if (!on) {
      $('.pf-reorder')?.remove();
      gallery.hidden = false;
      ctx.render();
      return;
    }

    gallery.hidden = true;
    const grid = document.createElement('div');
    grid.className = 'pf-reorder';
    grid.innerHTML = '<p class="pf-hint pf-reorder-hint">Drag the pictures into the order you want, then press “Done reordering”.</p>' +
      P.images.map((url, i) => `<div class="pf-thumb" data-i="${i}"><img src="${esc(opt(url, 400))}" alt=""><span>${i + 1}</span></div>`).join('');
    gallery.after(grid);

    loadSortable().then(Sortable => {
      new Sortable(grid, {
        draggable: '.pf-thumb',
        animation: 180,
        ghostClass: 'pf-ghost',
        onEnd: () => {
          const thumbs = [...grid.querySelectorAll('.pf-thumb')];
          const old = P.images.slice();
          P.images = thumbs.map(t => old[+t.dataset.i]);
          thumbs.forEach((t, i) => { t.dataset.i = i; t.querySelector('span').textContent = i + 1; });
          save();
        },
      });
    }).catch(err => toast(err.message, { kind: 'error' }));
  }

  // ---------- settings panel ----------
  function buildPanel() {
    const panel = document.createElement('aside');
    panel.className = 'pf-panel';
    panel.innerHTML = '<header><h3>Project settings</h3><button type="button" class="pf-x" data-act="close" aria-label="Close">✕</button></header><div class="pf-panel-body"></div>';
    document.body.appendChild(panel);

    panel.addEventListener('input', e => {
      const P = ctx.project;
      if (e.target.dataset.f === 'tag') { P.tag = e.target.value.slice(0, 80); save(); }
    });
    panel.addEventListener('change', e => {
      const P = ctx.project;
      const f = e.target.dataset.f;
      if (f === 'category') { P.category = e.target.value; save(); ctx.render(); }
      if (f === 'published') {
        const wantPublished = e.target.checked;
        if (wantPublished === !P.hidden) return;
        if (!togglePublish(P)) e.target.checked = false;
      }
      if (f === 'video') {
        const url = e.target.value.trim();
        if (url && !/^https:\/\//.test(url)) { toast('The video link must start with https://', { kind: 'error' }); return renderPanel(true); }
        if (url) P.video = url; else delete P.video;
        save(); ctx.render();
      }
    });
    panel.addEventListener('click', async e => {
      const P = ctx.project;
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;

      if (act === 'close') return togglePanel(false);
      if (act === 'cover-upload') {
        const [file] = await pickFiles({ multiple: false });
        if (!file) return;
        const [url] = await uploadMany([file]);
        if (url) { P.coverImage = url; save(); ctx.render(); renderPanel(true); toast('Cover photo updated.'); }
      }
      if (act === 'cover-pick') {
        if (!P.images.length) return toast('Add images to the project first.');
        const grid = $('.pf-cover-grid', panel);
        grid.hidden = !grid.hidden;
      }
      if (act === 'cover-choose') {
        P.coverImage = P.images[+e.target.closest('[data-i]').dataset.i];
        save(); ctx.render(); renderPanel(true); toast('Cover photo updated.');
      }
      if (act === 'video-upload') {
        const [file] = await pickFiles({ multiple: false, accept: 'video/*' });
        if (!file) return;
        const [url] = await uploadMany([file]);
        if (url) { P.video = url; save(); ctx.render(); renderPanel(true); }
      }
      if (act === 'video-remove') { delete P.video; save(); ctx.render(); renderPanel(true); }
      if (act === 'delete-project') {
        if (!confirm(`Delete “${P.title}” and all its images from the portfolio? This cannot be undone.`)) return;
        const list = ctx.data.projects;
        list.splice(list.indexOf(P), 1);
        save();
        if (await saveNow()) location.href = 'work.html';
      }
    });
  }

  function togglePanel(force) {
    const panel = $('.pf-panel');
    const open = force ?? !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    document.documentElement.classList.toggle('pf-panel-open', open);
    if (open) renderPanel(true);
  }

  function renderPanel(force) {
    const panel = $('.pf-panel');
    if (!panel || (!force && panel.contains(document.activeElement))) return;
    const P = ctx.project;
    const body = $('.pf-panel-body', panel);
    body.innerHTML = `
      <label class="pf-label">Label (small text on the project card)
        <input type="text" data-f="tag" value="${esc(P.tag)}" maxlength="80" placeholder="e.g. Logo &amp; Branding">
      </label>
      <label class="pf-label">Category (filter on the Work page)
        <select data-f="category">${ctx.data.categories.concat(ctx.data.categories.includes(P.category) ? [] : [P.category]).map(c => `<option ${c === P.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      </label>
      <label class="pf-check"><input type="checkbox" data-f="published" ${P.hidden ? '' : 'checked'}> Published (visible to visitors)</label>

      <div class="pf-field">
        <span class="pf-label">Cover photo</span>
        ${P.coverImage ? `<img class="pf-cover-preview" src="${esc(opt(P.coverImage, 500))}" alt="Cover">` : '<div class="pf-cover-preview pf-none">No cover yet</div>'}
        <div class="pf-row">
          <button type="button" class="pf-btn" data-act="cover-upload">Upload new</button>
          <button type="button" class="pf-btn" data-act="cover-pick">Choose from gallery</button>
        </div>
        <div class="pf-cover-grid" hidden>${P.images.map((u, i) => `<button type="button" data-act="cover-choose" data-i="${i}"><img src="${esc(opt(u, 200))}" alt=""></button>`).join('')}</div>
      </div>

      <div class="pf-field">
        <span class="pf-label">Video (optional, shown above the images)</span>
        <input type="url" data-f="video" value="${esc(P.video || '')}" placeholder="Paste a video link (https://…)">
        <div class="pf-row">
          <button type="button" class="pf-btn" data-act="video-upload">Upload video</button>
          ${P.video ? '<button type="button" class="pf-btn" data-act="video-remove">Remove video</button>' : ''}
        </div>
      </div>

      <button type="button" class="pf-btn pf-danger" data-act="delete-project">Delete this project</button>`;
  }

  window.PFAdmin = { mountWork, mountProject };
})();
