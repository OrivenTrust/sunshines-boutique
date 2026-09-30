import { sb, configured, $, $$, esc, money, slugify, waLink, toast, getSettings, resetSettingsCache, signInGoogle, installApp, isIOS, isStandalone, registerSW, SUN_SVG } from '/assets/core.js';
import { I, stars } from '/assets/icons.js';

registerSW();
const paint = (root = document) => {
  $$('[data-i]', root).forEach((el) => { if (!el.dataset.done) { el.insertAdjacentHTML('afterbegin', I[el.dataset.i] || ''); el.dataset.done = 1; } });
  $$('[data-sun]', root).forEach((el) => { if (!el.dataset.done) { el.insertAdjacentHTML('afterbegin', SUN_SVG); el.dataset.done = 1; } });
};
paint();

const CATEGORIES = ['Dresses', 'Tops', 'Skirts', 'Trousers', 'Sets', 'Jumpsuits', 'Outerwear', 'Traditional', 'Shoes', 'Bags', 'Accessories', 'Men', 'Kids'];
const busy = (text) => { $('#busy').hidden = !text; if (text) $('#busyText').textContent = text; };
const hour = new Date().getHours();
$('#greet').textContent = hour < 12 ? 'Good morning ☀︎' : hour < 17 ? 'Good afternoon ☀︎' : 'Good evening ☾';

/* ---------- WhatsApp help text (differs on iPhone / Android) ---------- */
$('#waHelpBody').innerHTML = isIOS()
  ? `<ol><li>In WhatsApp, open the chat with the photos.</li><li>Tap a photo → <b>Share</b> → <b>Save</b> (or turn on WhatsApp ▸ Settings ▸ Chats ▸ <b>Save to Photos</b>).</li><li>Come back here and tap <b>Choose photos</b>.</li></ol>`
  : `<ol><li>Install Studio on this phone first (Settings tab ▸ <b>Install Studio app</b>).</li><li>In WhatsApp, tap and hold the photos you want to select them.</li><li>Tap <b>Share</b> ⤴ and pick <b>Studio</b>. They land right here, ready for the AI.</li></ol>`;

/* ============================================================
   AUTH
   ============================================================ */
let user = null;
async function boot() {
  if (!configured) { $('#loginView').hidden = false; toast('Shop not connected yet — add the Supabase keys in assets/config.js', 'err'); return; }
  const { data } = await sb.auth.getSession();
  user = data.session?.user ?? null;
  if (!user) { $('#loginView').hidden = false; $('#appView').hidden = true; return; }
  const { data: ok } = await sb.rpc('is_admin');
  if (!ok) { $('#loginView').hidden = false; $('#notAdmin').hidden = false; $('#appView').hidden = true; return; }
  $('#loginView').hidden = true; $('#appView').hidden = false;
  loadInboxBadge();
  await takeSharedPhotos();
}
$('#sGoogle').addEventListener('click', () => signInGoogle('/studio/' + location.search));
$('#sLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({ email: $('#sEmail').value.trim(), password: $('#sPass').value });
  if (error) return toast(error.message, 'err');
  boot();
});
$('#switchAcct').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
if (sb) sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' && $('#appView').hidden) boot(); });

/* ============================================================
   TABS
   ============================================================ */
const titles = { add: 'Add pieces', items: 'My pieces', inbox: 'Inbox', settings: 'Settings' };
function goTab(t) {
  $$('.s-tab').forEach((s) => (s.hidden = s.id !== 'tab-' + t));
  $$('.s-nav [data-tab]').forEach((b) => (b.dataset.tab === t ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  $('#tabTitle').textContent = titles[t];
  scrollTo(0, 0);
  if (t === 'items') loadItems();
  if (t === 'inbox') loadInbox();
  if (t === 'settings') loadSettings();
}
$$('.s-nav [data-tab]').forEach((b) => b.addEventListener('click', () => goTab(b.dataset.tab)));

/* ============================================================
   PHOTOS: pick, shrink, preview
   ============================================================ */
let picked = []; // { file, url }
let group = 'one';

async function loadBitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    const url = URL.createObjectURL(file);
    const img = new Image(); img.src = url; await img.decode(); URL.revokeObjectURL(url); return img;
  }
}
async function shrink(file, max, quality, asDataURL = false) {
  const bmp = await loadBitmap(file);
  const w0 = bmp.width, h0 = bmp.height;
  const k = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  if (asDataURL) return c.toDataURL('image/jpeg', quality);
  return await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
}

function addFiles(files) {
  const imgs = [...files].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name || ''));
  if (!imgs.length) return;
  picked.push(...imgs.map((file) => ({ file, url: URL.createObjectURL(file) })));
  if (picked.length > 4 && group === 'one') setGroup('each');
  showGroupStep();
}
$('#camInput').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
$('#galInput').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });

function showGroupStep() {
  $('#pickStep').hidden = true; $('#draftStep').hidden = true; $('#groupStep').hidden = false;
  $('#pickedStrip').innerHTML = picked.map((p, i) => `<div class="s-thumb"><img src="${p.url}" alt=""><button data-rm="${i}" aria-label="Remove photo">${I.close}</button>${i === 0 && group === 'one' ? '<span class="cover">COVER</span>' : ''}</div>`).join('')
    + `<label class="s-thumb add"><input type="file" accept="image/*" multiple hidden id="moreInput">${I.plusSq}</label>`;
  $('#moreInput').addEventListener('change', (e) => addFiles(e.target.files));
}
$('#pickedStrip').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rm]'); if (!b) return;
  picked.splice(+b.dataset.rm, 1);
  picked.length ? showGroupStep() : resetAdd();
});
function setGroup(g) {
  group = g;
  $$('[data-group]').forEach((b) => b.setAttribute('aria-checked', b.dataset.group === g));
  if (!$('#groupStep').hidden) showGroupStep();
}
$$('[data-group]').forEach((b) => b.addEventListener('click', () => setGroup(b.dataset.group)));
$('#cancelPick').addEventListener('click', () => resetAdd());

function resetAdd() {
  picked.forEach((p) => URL.revokeObjectURL(p.url));
  picked = []; drafts = []; $('#hint').value = '';
  $('#pickStep').hidden = false; $('#groupStep').hidden = true; $('#draftStep').hidden = true;
  $('#drafts').innerHTML = '';
  clearShareInbox();
}

/* photos shared from WhatsApp (Android share sheet → service worker → here) */
async function takeSharedPhotos() {
  const n = +new URLSearchParams(location.search).get('shared');
  if (!n || !('caches' in window)) return;
  const inbox = await caches.open('share-inbox');
  const files = [];
  for (let i = 0; i < n; i++) {
    const r = await inbox.match(`/shared/${i}`);
    if (r) { const b = await r.blob(); files.push(new File([b], decodeURIComponent(r.headers.get('X-Name') || `photo-${i}.jpg`), { type: b.type || 'image/jpeg' })); }
  }
  const note = await inbox.match('/shared/note');
  if (note) { const t = (await note.text()).trim(); if (t && !/^https?:\/\//.test(t)) $('#hint').value = t; }
  history.replaceState({}, '', '/studio/');
  if (files.length) { goTab('add'); addFiles(files); toast(`${files.length} photo${files.length > 1 ? 's' : ''} from WhatsApp ✺`); }
}
async function clearShareInbox() {
  if (!('caches' in window)) return;
  try { await caches.delete('share-inbox'); } catch {}
}

/* ============================================================
   AI DRAFTS
   ============================================================ */
let drafts = []; // { files:[File], urls:[], data:{...}, status }

$('#runAI').addEventListener('click', async () => {
  if (!picked.length) return;
  const groups = group === 'one' ? [picked] : picked.map((p) => [p]);
  drafts = groups.map((g) => ({ files: g.map((p) => p.file), urls: g.map((p) => p.url), data: null, err: null }));
  $('#groupStep').hidden = true; $('#draftStep').hidden = false;
  renderDrafts();
  const hint = $('#hint').value.trim();
  // up to 3 at a time
  let idx = 0;
  const worker = async () => {
    while (idx < drafts.length) {
      const d = drafts[idx++];
      try {
        const images = await Promise.all(d.files.slice(0, 4).map((f) => shrink(f, 768, 0.72, true)));
        const { data, error } = await sb.functions.invoke('ai-describe', { body: { images, hint } });
        if (error || data?.error) throw new Error(data?.error || (await error.context?.json?.().catch(() => null))?.error || error.message);
        d.data = normalize(data);
      } catch (e) {
        d.err = String(e.message || e);
        d.data = normalize({});
      }
      renderDraft(drafts.indexOf(d));
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const failed = drafts.filter((d) => d.err);
  if (failed.length) toast(`AI couldn't write ${failed.length === drafts.length ? 'these' : failed.length} — you can type the details`, 'err');
});

function normalize(a) {
  const hintPrice = ($('#hint').value.match(/(\d{2,3})\s*k\b/i)?.[1] || 0) * 1000 || +($('#hint').value.match(/\b(\d{4,7})\b/)?.[1] || 0);
  return {
    name: a.name || '',
    description: a.description || '',
    category: CATEGORIES.includes(a.category) ? a.category : 'Dresses',
    price: hintPrice || a.price_ugx || '',
    compare_at: '',
    sizes: (a.sizes || []).join(', '),
    colors: (a.colors || []).join(', '),
    tags: a.tags || [],
    featured: false,
  };
}

function editorHTML(d, i, existing = false) {
  const v = d.data;
  const imgs = existing ? d.images : d.urls;
  return `
    <div class="s-strip" data-strip="${i}">${imgs.map((u, j) => `<div class="s-thumb"><img src="${esc(u)}" alt="">${j === 0 ? '<span class="cover">COVER</span>' : `<button type="button" data-cover="${j}" aria-label="Make cover" style="left:6px;right:auto;top:auto;bottom:6px;width:auto;padding:0 8px;border-radius:99px;font-size:10px;font-weight:800">COVER</button>`}${imgs.length > 1 ? `<button type="button" data-rmimg="${j}" aria-label="Remove photo">${I.close}</button>` : ''}</div>`).join('')}
      <label class="s-thumb add"><input type="file" accept="image/*" multiple hidden data-addimg="${i}">${I.plusSq}</label></div>
    ${existing ? '' : `<span class="ai-badge">${I.sparkle} ${d.err ? 'Fill in the details' : 'Written by AI — change anything'}</span>`}
    <div class="field"><label>Name</label><input class="name-in" data-k="name" value="${esc(v.name)}" placeholder="e.g. Marigold Wrap Dress"></div>
    <div class="row2">
      <div class="field"><label>Price</label><div class="price-in"><span>UGX</span><input data-k="price" inputmode="numeric" value="${esc(v.price)}" placeholder="85000"></div></div>
      <div class="field"><label>Was (optional, for sales)</label><div class="price-in"><span>UGX</span><input data-k="compare_at" inputmode="numeric" value="${esc(v.compare_at || '')}" placeholder=""></div></div>
    </div>
    <div class="field"><label>Category</label><select data-k="category">${CATEGORIES.map((c) => `<option ${c === v.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div class="row2">
      <div class="field"><label>Sizes</label><input data-k="sizes" value="${esc(v.sizes)}" placeholder="S, M, L"></div>
      <div class="field"><label>Colours</label><input data-k="colors" value="${esc(v.colors)}" placeholder="Gold, Ivory"></div>
    </div>
    <div class="field"><label>Description</label><textarea data-k="description" rows="6">${esc(v.description)}</textarea></div>
    <label class="toggle">Feature on the home page<input type="checkbox" data-k="featured" ${v.featured ? 'checked' : ''}></label>
    ${existing ? '' : `<button type="button" class="btn ghost-dark sm" data-rmdraft="${i}">${I.trash} Remove this piece</button>`}`;
}
function renderDrafts() {
  $('#drafts').innerHTML = drafts.map((_, i) => `<article class="draft" id="draft-${i}"></article>`).join('');
  drafts.forEach((_, i) => renderDraft(i));
  $('#publishAll').textContent = drafts.length > 1 ? `Publish all ${drafts.length}` : 'Publish';
}
function renderDraft(i) {
  const el = $(`#draft-${i}`); if (!el) return;
  const d = drafts[i];
  if (!d.data) {
    el.innerHTML = `<div class="s-strip">${d.urls.map((u) => `<div class="s-thumb"><img src="${u}" alt=""></div>`).join('')}</div><span class="ai-badge">${I.sparkle} Writing…</span><div class="shimmer-line" style="width:70%;height:28px"></div><div class="shimmer-line"></div><div class="shimmer-line" style="width:85%"></div><div class="shimmer-line" style="width:60%"></div>`;
    return;
  }
  el.innerHTML = `<div class="ed">${editorHTML(d, i)}</div>`;
  bindEditor($('.ed', el), d.data, {
    onCover: (j) => { d.files.unshift(...d.files.splice(j, 1)); d.urls.unshift(...d.urls.splice(j, 1)); renderDraft(i); },
    onRm: (j) => { d.files.splice(j, 1); d.urls.splice(j, 1); renderDraft(i); },
    onAdd: (files) => { for (const f of files) { d.files.push(f); d.urls.push(URL.createObjectURL(f)); } renderDraft(i); },
  });
  $('[data-rmdraft]', el)?.addEventListener('click', () => {
    drafts.splice(i, 1);
    drafts.length ? renderDrafts() : resetAdd();
  });
}
function bindEditor(el, v, h) {
  el.addEventListener('input', (e) => {
    const k = e.target.dataset.k; if (!k) return;
    v[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  });
  el.addEventListener('change', (e) => { const k = e.target.dataset.k; if (k) v[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; });
  $$('[data-cover]', el).forEach((b) => b.addEventListener('click', () => h.onCover(+b.dataset.cover)));
  $$('[data-rmimg]', el).forEach((b) => b.addEventListener('click', () => h.onRm(+b.dataset.rmimg)));
  $$('[data-addimg]', el).forEach((inp) => inp.addEventListener('change', (e) => h.onAdd([...e.target.files])));
}

const list = (s) => String(s || '').split(/[,/·|]+/).map((x) => x.trim()).filter(Boolean);
const num = (s) => { const n = Number(String(s || '').replace(/[^\d.]/g, '')); return n > 0 ? Math.round(n) : null; };
const uniqSlug = (name) => `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;

async function uploadPhoto(file) {
  const blob = await shrink(file, 1600, 0.84);
  const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from('products').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (error) throw error;
  return sb.storage.from('products').getPublicUrl(path).data.publicUrl;
}
function rowFrom(v) {
  return {
    name: v.name.trim(),
    description: v.description.trim(),
    category: v.category,
    price: num(v.price),
    compare_at: num(v.compare_at),
    sizes: list(v.sizes),
    colors: list(v.colors),
    tags: Array.isArray(v.tags) ? v.tags : list(v.tags),
    featured: !!v.featured,
  };
}

$('#publishAll').addEventListener('click', async () => {
  if (drafts.some((d) => !d.data)) return toast('Wait a moment — the AI is still writing');
  const missing = drafts.findIndex((d) => !d.data.name.trim());
  if (missing > -1) { $(`#draft-${missing}`).scrollIntoView({ behavior: 'smooth' }); return toast('Give every piece a name', 'err'); }
  try {
    let n = 0;
    for (const d of drafts) {
      busy(`Publishing ${drafts.length > 1 ? `${++n} of ${drafts.length}` : 'your piece'}…`);
      const images = [];
      for (const f of d.files) images.push(await uploadPhoto(f));
      const { error } = await sb.from('products').insert({ ...rowFrom(d.data), images, slug: uniqSlug(d.data.name), status: 'published' });
      if (error) throw error;
    }
    busy(false);
    toast(drafts.length > 1 ? `${drafts.length} pieces are live ✺` : 'Your piece is live ✺');
    resetAdd();
    goTab('items');
  } catch (e) {
    busy(false);
    toast(e.message || 'Could not publish', 'err');
  }
});
$('#discardAll').addEventListener('click', () => { if (confirm('Discard these pieces?')) resetAdd(); });

/* ============================================================
   ITEMS
   ============================================================ */
let items = [];
let itemFilter = 'all';
async function loadItems() {
  const { data, error } = await sb.from('products').select('*').order('created_at', { ascending: false }).limit(1000);
  if (error) return toast(error.message, 'err');
  items = data || [];
  renderItems();
}
function renderItems() {
  const q = $('#itemQ').value.trim().toLowerCase();
  const shown = items.filter((p) => (itemFilter === 'all' || p.status === itemFilter) && (!q || `${p.name} ${p.category} ${(p.colors || []).join(' ')}`.toLowerCase().includes(q)));
  $('#itemList').innerHTML = shown.length ? shown.map((p) => `
    <button class="s-item" data-edit="${p.id}">
      ${p.images?.[0] ? `<img src="${esc(p.images[0])}" alt="" loading="lazy">` : '<span class="noimg"></span>'}
      <span class="meta"><b>${esc(p.name)}</b><small>${esc(p.category || '')} · ${money(p.price)}</small><span class="pill ${p.status}">${p.status === 'published' ? 'Live' : p.status}${p.featured ? ' · ★' : ''}</span></span>
    </button>`).join('')
    : `<div class="s-empty"><div class="mark">${SUN_SVG}</div>${items.length ? 'Nothing here.' : 'No pieces yet — tap <b>Add</b> to post your first one.'}</div>`;
}
$('#itemQ').addEventListener('input', renderItems);
$('#itemFilter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-f]'); if (!b) return;
  itemFilter = b.dataset.f; $$('#itemFilter button').forEach((x) => x.setAttribute('aria-pressed', x === b)); renderItems();
});
$('#itemList').addEventListener('click', (e) => { const b = e.target.closest('[data-edit]'); if (b) openEdit(items.find((p) => p.id === b.dataset.edit)); });

const editSheet = $('#editSheet');
editSheet.addEventListener('click', (e) => { if (e.target === editSheet) editSheet.close(); });
function openEdit(p) {
  const st = { images: [...(p.images || [])], newFiles: [], data: { ...p, sizes: (p.sizes || []).join(', '), colors: (p.colors || []).join(', '), price: p.price || '', compare_at: p.compare_at || '' } };
  const render = () => {
    const allImgs = [...st.images, ...st.newFiles.map((f) => f._url)];
    $('#editBody').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><span class="pill ${p.status}">${p.status === 'published' ? 'Live' : p.status}</span><button class="icon-btn" data-x aria-label="Close">${I.close}</button></div>
      <div class="draft" style="border:0;padding:0;background:none">${editorHTML({ data: st.data, images: allImgs }, 'e', true)}</div>
      <div style="display:grid;gap:10px;margin-top:10px">
        <button class="btn sun block" data-save>Save changes</button>
        <div class="row2">
          ${p.status !== 'sold' ? `<button class="btn ghost-dark" data-status="sold">Mark as sold</button>` : `<button class="btn ghost-dark" data-status="published">Back in stock</button>`}
          ${p.status === 'hidden' || p.status === 'draft' ? `<button class="btn ghost-dark" data-status="published">${I.eye} Show in shop</button>` : `<button class="btn ghost-dark" data-status="hidden">Hide from shop</button>`}
        </div>
        <a class="btn ghost-dark" href="/?item=${encodeURIComponent(p.slug || p.id)}" target="_blank">${I.eye} See it in the shop</a>
        <button class="btn ghost-dark" data-share>${I.share} Share to WhatsApp status</button>
        <button class="btn ghost-dark" data-del style="color:#ff9a7a">${I.trash} Delete forever</button>
      </div>`;
    const body = $('#editBody');
    bindEditor($('.draft', body), st.data, {
      onCover: (j) => { const all = [...st.images.map((u) => ({ u })), ...st.newFiles.map((f) => ({ f }))]; all.unshift(...all.splice(j, 1)); st.images = all.filter((x) => x.u).map((x) => x.u); st.newFiles = all.filter((x) => x.f).map((x) => x.f); if (all[0].f) toast('New photo will become the cover after saving'); render(); },
      onRm: (j) => { if (j < st.images.length) st.images.splice(j, 1); else st.newFiles.splice(j - st.images.length, 1); render(); },
      onAdd: (files) => { for (const f of files) { f._url = URL.createObjectURL(f); st.newFiles.push(f); } render(); },
    });
    $('[data-x]', body).addEventListener('click', () => editSheet.close());
    $('[data-save]', body).addEventListener('click', async () => {
      try {
        busy('Saving…');
        const added = [];
        for (const f of st.newFiles) added.push(await uploadPhoto(f));
        const { error } = await sb.from('products').update({ ...rowFrom(st.data), images: [...st.images, ...added] }).eq('id', p.id);
        if (error) throw error;
        busy(false); toast('Saved ✺'); editSheet.close(); loadItems();
      } catch (e) { busy(false); toast(e.message, 'err'); }
    });
    $$('[data-status]', body).forEach((b) => b.addEventListener('click', async () => {
      const { error } = await sb.from('products').update({ status: b.dataset.status }).eq('id', p.id);
      if (error) return toast(error.message, 'err');
      toast({ sold: 'Marked as sold', hidden: 'Hidden from the shop', published: 'Live in the shop ✺' }[b.dataset.status]);
      editSheet.close(); loadItems();
    }));
    $('[data-share]', body).addEventListener('click', async () => {
      const url = `${location.origin}/?item=${encodeURIComponent(p.slug || p.id)}`;
      const text = `✨ New at Sunshine's Boutique: ${p.name} — ${money(p.price)}\nOrder here 👉 ${url}`;
      try {
        if (navigator.canShare && p.images?.[0]) {
          const blob = await (await fetch(p.images[0])).blob();
          const file = new File([blob], 'sunshine.jpg', { type: blob.type || 'image/jpeg' });
          if (navigator.canShare({ files: [file] })) return await navigator.share({ files: [file], text });
        }
        if (navigator.share) return await navigator.share({ text });
        location.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
      } catch {}
    });
    $('[data-del]', body).addEventListener('click', async () => {
      if (!confirm(`Delete "${p.name}" forever? This can't be undone.`)) return;
      const paths = (p.images || []).map((u) => u.split('/storage/v1/object/public/products/')[1]).filter(Boolean);
      if (paths.length) await sb.storage.from('products').remove(paths);
      const { error } = await sb.from('products').delete().eq('id', p.id);
      if (error) return toast(error.message, 'err');
      toast('Deleted'); editSheet.close(); loadItems();
    });
  };
  render();
  editSheet.showModal();
}

/* ============================================================
   INBOX
   ============================================================ */
let inboxView = 'messages';
async function loadInboxBadge() {
  const { count } = await sb.from('messages').select('id', { count: 'exact', head: true }).eq('is_read', false);
  const b = $('#inboxBadge'); b.hidden = !count; b.textContent = count;
}
$('#inboxSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-v]'); if (!b) return;
  inboxView = b.dataset.v; $$('#inboxSeg button').forEach((x) => x.setAttribute('aria-pressed', x === b)); loadInbox();
});
const when = (d) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
async function loadInbox() {
  const box = $('#inboxList');
  if (inboxView === 'messages') {
    const { data } = await sb.from('messages').select('*, products(name, slug)').order('created_at', { ascending: false }).limit(200);
    box.innerHTML = data?.length ? data.map((m) => `
      <article class="msg ${m.is_read ? '' : 'unread'}" data-id="${m.id}">
        <header><b>${esc(m.name)}</b><small>${when(m.created_at)}</small></header>
        ${m.products ? `<span class="pill">About: ${esc(m.products.name)}</span>` : ''}
        <p>${esc(m.message)}</p>
        <div class="row">
          ${m.phone ? `<a class="btn wa sm" href="${waLink(m.phone, `Hello ${m.name.split(' ')[0]}! This is Sunshine's Boutique 🌞 `)}" target="_blank">${I.wa} WhatsApp</a>` : ''}
          ${m.email ? `<a class="btn sm light" href="mailto:${esc(m.email)}?subject=${encodeURIComponent("Re: your message to Sunshine's Boutique")}">${I.mail} Email</a>` : ''}
          ${m.is_read ? '' : `<button class="btn sm ghost-dark" data-read="${m.id}">${I.check} Done</button>`}
          <button class="btn sm ghost-dark" data-delmsg="${m.id}" aria-label="Delete">${I.trash}</button>
        </div>
      </article>`).join('') : `<div class="s-empty"><div class="mark">${SUN_SVG}</div>No messages yet. They'll appear here and in your email.</div>`;
  } else {
    const { data } = await sb.from('reviews').select('*').order('created_at', { ascending: false }).limit(200);
    box.innerHTML = data?.length ? data.map((r) => `
      <article class="msg">
        <header><b>${esc(r.name)}</b><small>${when(r.created_at)}</small></header>
        ${stars(r.rating)}
        ${r.comment ? `<p>${esc(r.comment)}</p>` : ''}
        <div class="row"><button class="btn sm ghost-dark" data-approve="${r.id}" data-to="${!r.approved}">${r.approved ? 'Hide from site' : 'Show on site'}</button><span class="pill ${r.approved ? 'published' : ''}">${r.approved ? 'Showing' : 'Hidden'}</span></div>
      </article>`).join('') : `<div class="s-empty"><div class="mark">${SUN_SVG}</div>No reviews yet.</div>`;
  }
}
$('#inboxList').addEventListener('click', async (e) => {
  const r = e.target.closest('[data-read]'), d = e.target.closest('[data-delmsg]'), a = e.target.closest('[data-approve]');
  if (r) { await sb.from('messages').update({ is_read: true }).eq('id', r.dataset.read); loadInbox(); loadInboxBadge(); }
  if (d && confirm('Delete this message?')) { await sb.from('messages').delete().eq('id', d.dataset.delmsg); loadInbox(); loadInboxBadge(); }
  if (a) { await sb.from('reviews').update({ approved: a.dataset.to === 'true' }).eq('id', a.dataset.approve); loadInbox(); }
});

/* ============================================================
   SETTINGS
   ============================================================ */
async function loadSettings() {
  resetSettingsCache();
  const s = await getSettings();
  for (const el of $$('#settingsForm [name]')) el.value = s[el.name] || '';
  $('#installHelp').innerHTML = isStandalone()
    ? 'Studio is installed on this phone ✺'
    : isIOS()
      ? 'To install: open this page in <b>Safari</b> → tap Share ⤴ → <b>Add to Home Screen</b>.'
      : 'Install Studio so it opens like an app — and so it appears in WhatsApp’s <b>Share</b> menu.';
}
$('#settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const row = Object.fromEntries(new FormData(e.currentTarget));
  if (row.whatsapp && row.whatsapp.replace(/\D/g, '').length < 9) return toast('That WhatsApp number looks too short', 'err');
  const { error } = await sb.from('settings').update(row).eq('id', 1);
  if (error) return toast(error.message, 'err');
  resetSettingsCache(); try { localStorage.removeItem('sb_settings'); } catch {}
  toast('Saved — the shop is updated ✺');
});
$('#installStudio').addEventListener('click', () => installApp(() => toast('Use your browser menu → Add to Home screen')));
$('#signOutS').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
if (isIOS()) document.documentElement.classList.add('ios');
if (isStandalone()) document.documentElement.classList.add('standalone');

boot();
