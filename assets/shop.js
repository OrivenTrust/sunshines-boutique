import { sb, configured, CONFIG, $, $$, esc, money, waLink, toast, getSettings, currentUser, installApp, isIOS, isStandalone, registerSW, SUN_SVG, DEMO_PRODUCTS } from './core.js';
import { I, stars } from './icons.js';

registerSW();
const html = document.documentElement;
if (isIOS()) html.classList.add('ios');
if (isStandalone()) html.classList.add('standalone');

/* ---------- decorate icons ---------- */
const paint = (root = document) => {
  $$('[data-i]', root).forEach((el) => { if (!el.dataset.done) { el.insertAdjacentHTML('afterbegin', I[el.dataset.i] || ''); el.dataset.done = 1; } });
  $$('[data-sun]', root).forEach((el) => { if (!el.dataset.done) { el.insertAdjacentHTML('afterbegin', SUN_SVG); el.dataset.done = 1; } });
};
$('#searchBtn').innerHTML = I.search;
$('#wishBtn').innerHTML = I.heart + '<span class="dot" id="wishCount" hidden></span>';
$('#acctBtn').innerHTML = I.user;
$('#fab').innerHTML = I.wa;
$$('[data-close]').forEach((b) => { if (b.classList.contains('icon-btn')) b.innerHTML = I.close; });
paint();
$('#yr').textContent = new Date().getFullYear();

/* header shadow on scroll */
const header = $('#header');
addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 8), { passive: true });

/* reveal on scroll */
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
$$('.reveal').forEach((el) => io.observe(el));

/* ---------- state ---------- */
let products = [];
let settings = {};
let user = null;
let wish = new Set();
const state = { cat: 'All', q: '', sort: 'new' };

/* ---------- settings ---------- */
async function applySettings() {
  settings = await getSettings();
  if (settings.announcement) $('#announce').textContent = settings.announcement;
  if (settings.hero_subtitle) $('#heroSub').textContent = settings.hero_subtitle;
  if (settings.hours) $('#hours').textContent = settings.hours;
  if (settings.about) $('#aboutText').innerHTML = settings.about.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('');
  const wa = settings.whatsapp;
  if (wa) {
    const hello = "Hello Sunshine's Boutique! 🌞 I'd like to ask about…";
    for (const a of [$('#fab'), $('#heroWa')]) { a.href = waLink(wa, hello); a.target = '_blank'; a.rel = 'noopener'; }
    $('#waLine').hidden = false;
    $('#waText').textContent = '+' + wa.replace(/\D/g, '').replace(/^0/, '256');
    $('#waText').href = waLink(wa);
  }
  const g = $('#googleReview');
  if (settings.google_review_url) g.href = settings.google_review_url; else g.hidden = true;
  const soc = [];
  if (wa) soc.push(`<a href="${waLink(wa)}" target="_blank" rel="noopener" aria-label="WhatsApp">${I.wa}</a>`);
  if (settings.instagram) soc.push(`<a href="${esc(settings.instagram.startsWith('http') ? settings.instagram : 'https://instagram.com/' + settings.instagram.replace('@', ''))}" target="_blank" rel="noopener" aria-label="Instagram">${I.ig}</a>`);
  if (settings.tiktok) soc.push(`<a href="${esc(settings.tiktok.startsWith('http') ? settings.tiktok : 'https://tiktok.com/@' + settings.tiktok.replace('@', ''))}" target="_blank" rel="noopener" aria-label="TikTok">${I.tt}</a>`);
  if (settings.facebook) soc.push(`<a href="${esc(settings.facebook)}" target="_blank" rel="noopener" aria-label="Facebook">${I.fb}</a>`);
  soc.push(`<a href="mailto:${CONFIG.BUSINESS_EMAIL}" aria-label="Email">${I.mail}</a>`);
  $('#socials').innerHTML = soc.join('');
}

/* ---------- products ---------- */
function skeleton(n = 8) {
  $('#grid').innerHTML = Array.from({ length: n }, () => '<div class="card skeleton"><div class="ph"></div><div class="line"></div><div class="line"></div></div>').join('');
}
async function loadProducts() {
  skeleton();
  if (!configured) { products = DEMO_PRODUCTS; return; }
  const { data, error } = await sb.from('products').select('*').in('status', ['published', 'sold']).order('featured', { ascending: false }).order('created_at', { ascending: false }).limit(500);
  if (error) { toast('Could not load the collection', 'err'); products = []; return; }
  products = data || [];
}

function renderChips() {
  const cats = ['All', ...new Set(products.map((p) => p.category).filter(Boolean))];
  $('#chips').innerHTML = cats.map((c) => `<button class="chip" aria-pressed="${c === state.cat}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
}
$('#chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]'); if (!b) return;
  state.cat = b.dataset.cat; renderChips(); renderGrid();
});
$$('.footer [data-cat]').forEach((a) => a.addEventListener('click', () => { state.cat = a.dataset.cat; renderChips(); renderGrid(); }));
$('#q').addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); renderGrid(); });
$('#sort').addEventListener('change', (e) => { state.sort = e.target.value; renderGrid(); });
$('#searchBtn').addEventListener('click', () => { $('#shop').scrollIntoView(); setTimeout(() => $('#q').focus(), 400); });

const isNew = (p) => p.created_at && Date.now() - new Date(p.created_at) < 10 * 864e5;
function card(p, i) {
  const img = p.images?.[0] || '';
  const alt = p.images?.[1];
  const sale = p.compare_at && Number(p.compare_at) > Number(p.price);
  const tag = p.status === 'sold' ? '' : sale ? '<span class="tag sale">Sale</span>' : isNew(p) ? '<span class="tag new">New</span>' : p.featured ? '<span class="tag">Loved</span>' : '';
  return `<a class="card ${p.status === 'sold' ? 'sold' : ''}" href="?item=${encodeURIComponent(p.slug || p.id)}" data-id="${p.id}" style="animation-delay:${Math.min(i, 12) * 45}ms">
    <div class="ph">${tag}
      <button class="heart" data-heart="${p.id}" aria-pressed="${wish.has(p.id)}" aria-label="Save ${esc(p.name)} to wishlist">${I.heart}</button>
      ${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="${i < 4 ? 'eager' : 'lazy'}" decoding="async">` : ''}
      ${alt ? `<img class="alt" src="${esc(alt)}" alt="" loading="lazy" decoding="async">` : ''}
    </div>
    <div class="info"><span class="cat">${esc(p.category || '')}</span><span class="name">${esc(p.name)}</span>
      <span class="price">${money(p.price)} ${sale ? `<s>${money(p.compare_at)}</s>` : ''}</span></div>
  </a>`;
}
function renderGrid() {
  let list = products.filter((p) => state.cat === 'All' || p.category === state.cat);
  if (state.q) list = list.filter((p) => [p.name, p.description, p.category, ...(p.colors || []), ...(p.tags || [])].join(' ').toLowerCase().includes(state.q));
  if (state.sort === 'low') list = [...list].sort((a, b) => (a.price || 1e12) - (b.price || 1e12));
  if (state.sort === 'high') list = [...list].sort((a, b) => (b.price || 0) - (a.price || 0));
  $('#count').textContent = `${list.length} ${list.length === 1 ? 'piece' : 'pieces'}`;
  if (!products.length) {
    $('#grid').innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="mark">${SUN_SVG}</div><h3>A new collection is on its way</h3><p>We're styling and photographing fresh pieces right now. Message us to hear first when they land.</p><a class="btn wa" href="${settings.whatsapp ? waLink(settings.whatsapp, "Hi! Please tell me when new pieces arrive 🌞") : '#visit'}">${I.wa} Notify me</a></div>`;
    return;
  }
  $('#grid').innerHTML = list.length ? list.map(card).join('') : `<div class="empty" style="grid-column:1/-1"><h3>Nothing matches… yet</h3><p>Try another word or category — or ask us, we may have it in store.</p></div>`;
}
$('#grid').addEventListener('click', async (e) => {
  const h = e.target.closest('[data-heart]');
  if (h) { e.preventDefault(); e.stopPropagation(); return toggleWish(h.dataset.heart); }
  const c = e.target.closest('.card[data-id]');
  if (c) { e.preventDefault(); openProduct(products.find((p) => p.id === c.dataset.id)); }
});

function heroImages() {
  const withImg = products.filter((p) => p.images?.length && p.status !== 'sold');
  const pick = [...withImg.filter((p) => p.featured), ...withImg.filter((p) => !p.featured)];
  const [a, b] = pick;
  const set = (el, p) => { if (!p) return; el.classList.remove('blank'); el.innerHTML = `<img src="${esc(p.images[0])}" alt="${esc(p.name)}">`; };
  set($('.arch.a1'), a); set($('.arch.a2'), b || a);
  set($('#storyArt'), pick[2] || pick[1] || a);
  $('#statItems').textContent = products.filter((p) => p.status === 'published').length || '—';
}

/* ---------- SEO: structured data for products ---------- */
function injectItemList() {
  const items = products.filter((p) => p.status === 'published').slice(0, 60).map((p, i) => ({
    '@type': 'ListItem', position: i + 1,
    item: {
      '@type': 'Product', name: p.name, description: p.description, image: p.images?.[0], category: p.category,
      url: `${CONFIG.SITE_URL}/?item=${encodeURIComponent(p.slug || p.id)}`,
      brand: { '@type': 'Brand', name: "Sunshine's Boutique" },
      offers: Number(p.price) > 0 ? { '@type': 'Offer', priceCurrency: 'UGX', price: Number(p.price), availability: 'https://schema.org/InStock', seller: { '@id': `${CONFIG.SITE_URL}/#store` } } : undefined,
    },
  }));
  if (!items.length) return;
  const s = document.createElement('script');
  s.type = 'application/ld+json';
  s.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: items });
  document.head.append(s);
}

/* ---------- wishlist ---------- */
async function loadWish() {
  if (!user) return;
  const { data } = await sb.from('wishlist').select('product_id').eq('user_id', user.id);
  wish = new Set((data || []).map((r) => r.product_id));
  updateWishDot();
}
function updateWishDot() {
  const d = $('#wishCount'); d.hidden = !wish.size; d.textContent = wish.size;
}
async function toggleWish(id) {
  if (!configured) return toast('Wishlist works once the shop is connected');
  if (!user) { toast('Sign in to save your favourites ♡'); setTimeout(() => (location.href = '/account.html?next=' + encodeURIComponent(location.pathname + location.search)), 900); return; }
  const on = !wish.has(id);
  on ? wish.add(id) : wish.delete(id);
  $$(`[data-heart="${id}"]`).forEach((b) => b.setAttribute('aria-pressed', on));
  updateWishDot();
  const q = on ? sb.from('wishlist').insert({ user_id: user.id, product_id: id }) : sb.from('wishlist').delete().eq('user_id', user.id).eq('product_id', id);
  const { error } = await q;
  if (error) toast('Could not update wishlist', 'err'); else toast(on ? 'Saved to your wishlist ♡' : 'Removed from wishlist');
}

/* ---------- product sheet ---------- */
const pdSheet = $('#pdSheet');
let chosenSize = null;
const baseTitle = document.title;
function openProduct(p, push = true) {
  if (!p) return;
  chosenSize = p.sizes?.length === 1 ? p.sizes[0] : null;
  const imgs = p.images?.length ? p.images : [];
  const sale = p.compare_at && Number(p.compare_at) > Number(p.price);
  const sold = p.status === 'sold';
  $('#pdBody').innerHTML = `<div class="pd">
    <div class="gallery">
      <div class="track" id="pdTrack">${imgs.map((src, i) => `<img src="${esc(src)}" alt="${esc(p.name)} — photo ${i + 1}" ${i ? 'loading="lazy"' : ''}>`).join('') || `<div style="flex:0 0 100%;display:grid;place-items:center">${SUN_SVG}</div>`}</div>
      ${imgs.length > 1 ? `<div class="dots">${imgs.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}
    </div>
    <div class="pd-info">
      <span class="eyebrow">${esc(p.category || 'Boutique')}</span>
      <h2 id="pdName">${esc(p.name)}</h2>
      <div class="price">${money(p.price)} ${sale ? `<s>${money(p.compare_at)}</s>` : ''} ${sold ? '<span class="tag" style="position:static;background:var(--ink);color:var(--cream);padding:6px 10px;border-radius:99px;font-size:11px;letter-spacing:.12em">SOLD</span>' : ''}</div>
      <p class="desc">${esc(p.description || '')}</p>
      ${p.colors?.length ? `<div><div class="opt-label">Colour</div><div style="color:var(--ink-2)">${p.colors.map(esc).join(' · ')}</div></div>` : ''}
      ${p.sizes?.length ? `<div><div class="opt-label">Choose your size</div><div class="sizes" id="pdSizes">${p.sizes.map((s) => `<button class="size" aria-pressed="${s === chosenSize}" data-size="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>` : ''}
      <div class="pd-actions">
        <div class="pd-sticky">
          ${sold ? `<button class="btn block" id="pdAsk">${I.wa} Ask for something similar</button>` : `<button class="btn wa" id="pdOrder">${I.wa} Order on WhatsApp</button>`}
          <button class="icon-btn" style="background:var(--cream);width:52px;height:52px" data-heart="${p.id}" aria-pressed="${wish.has(p.id)}" aria-label="Save to wishlist">${I.heart}</button>
          <button class="icon-btn" style="background:var(--cream);width:52px;height:52px" id="pdShare" aria-label="Share">${I.share}</button>
        </div>
      </div>
      <div class="pd-note">${I.truck}<span>Pick up in Namugongo or delivery across Kampala. Pay with Mobile Money or cash on delivery.</span></div>
    </div>
  </div>`;
  const track = $('#pdTrack');
  track?.addEventListener('scroll', () => {
    const i = Math.round(track.scrollLeft / track.clientWidth);
    $$('.dots i', pdSheet).forEach((d, j) => d.classList.toggle('on', i === j));
  }, { passive: true });
  $('#pdSizes')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-size]'); if (!b) return;
    chosenSize = b.dataset.size; $$('#pdSizes .size').forEach((x) => x.setAttribute('aria-pressed', x === b));
  });
  const url = `${CONFIG.SITE_URL}/?item=${encodeURIComponent(p.slug || p.id)}`;
  const order = () => {
    if (p.sizes?.length > 1 && !chosenSize && !sold) { toast('Pick your size first'); $('#pdSizes')?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], 300); return; }
    const text = sold
      ? `Hello Sunshine's Boutique! 🌞 I loved the "${p.name}" — do you have something similar?\n${url}`
      : `Hello Sunshine's Boutique! 🌞 I'd love to order:\n\n• ${p.name}${chosenSize ? ` — size ${chosenSize}` : ''}\n• ${money(p.price)}\n\n${url}`;
    if (settings.whatsapp) window.open(waLink(settings.whatsapp, text), '_blank', 'noopener');
    else { pdSheet.close(); $('#cMsg').value = text; $('#contactForm').dataset.product = configured ? p.id : ''; $('#visit').scrollIntoView(); setTimeout(() => $('#cName').focus(), 500); }
  };
  $('#pdOrder')?.addEventListener('click', order);
  $('#pdAsk')?.addEventListener('click', order);
  $('[data-heart]', pdSheet).addEventListener('click', (e) => toggleWish(e.currentTarget.dataset.heart));
  $('#pdShare').addEventListener('click', async () => {
    try {
      if (navigator.share) await navigator.share({ title: p.name, text: `${p.name} at Sunshine's Boutique`, url });
      else { await navigator.clipboard.writeText(url); toast('Link copied'); }
    } catch {}
  });
  document.title = `${p.name} · Sunshine's Boutique`;
  if (push) history.pushState({ item: p.id }, '', `?item=${encodeURIComponent(p.slug || p.id)}`);
  if (!pdSheet.open) pdSheet.showModal();
  $('.sheet-body', pdSheet).scrollTop = 0;
}
pdSheet.addEventListener('close', () => {
  document.title = baseTitle;
  if (new URLSearchParams(location.search).has('item')) history.pushState({}, '', location.pathname + location.hash);
});
addEventListener('popstate', () => {
  const id = new URLSearchParams(location.search).get('item');
  const p = id && products.find((x) => x.slug === id || x.id === id);
  if (p) openProduct(p, false); else if (pdSheet.open) pdSheet.close();
});

/* close dialogs: buttons + backdrop tap */
$$('dialog').forEach((d) => {
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
});

/* ---------- reviews ---------- */
async function loadReviews() {
  let list = [];
  if (configured) {
    const { data } = await sb.from('reviews').select('name,rating,comment,created_at').eq('approved', true).order('created_at', { ascending: false }).limit(30);
    list = data || [];
  }
  const avg = list.length ? list.reduce((a, r) => a + r.rating, 0) / list.length : 5;
  $('#avg').textContent = avg.toFixed(1);
  $('#statRating').textContent = avg.toFixed(1);
  $('#avgStars').innerHTML = stars(avg);
  $('#revCount').textContent = list.length ? `${list.length} review${list.length > 1 ? 's' : ''}` : 'Be the first to review us';
  const shown = list.filter((r) => r.comment?.trim());
  $('#reviewList').innerHTML = shown.length
    ? shown.map((r) => `<article class="review">${stars(r.rating)}<p>“${esc(r.comment)}”</p><footer><span class="av">${esc((r.name || '?')[0].toUpperCase())}</span><span><b style="color:var(--ink)">${esc(r.name)}</b><br>${new Date(r.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span></footer></article>`).join('')
    : `<article class="review">${stars(5)}<p>“Your kind words could be the first here. We'd love to hear how you feel in your Sunshine's piece.”</p><footer><span class="av">✺</span><span><b style="color:var(--ink)">Sunshine's Boutique</b><br>Namugongo</span></footer></article>`;
  if (list.length) {
    const s = document.createElement('script'); s.type = 'application/ld+json';
    s.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'ClothingStore', '@id': `${CONFIG.SITE_URL}/#store`, name: "Sunshine's Boutique", aggregateRating: { '@type': 'AggregateRating', ratingValue: avg.toFixed(1), reviewCount: list.length } });
    document.head.append(s);
  }
}

/* ---------- contact form ---------- */
$('#contactForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const data = Object.fromEntries(new FormData(f));
  if (!data.name.trim() || !data.message.trim()) return toast('Please add your name and a message', 'err');
  if (!data.email.trim() && !data.phone.trim()) return toast('Add an email or phone so we can reply', 'err');
  const btn = $('button[type=submit]', f);
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    if (!configured) throw new Error('not connected');
    const id = crypto.randomUUID();
    const row = { id, name: data.name.trim(), email: data.email.trim() || null, phone: data.phone.trim() || null, message: data.message.trim(), product_id: f.dataset.product || null };
    const { error } = await sb.from('messages').insert(row);
    if (error) throw error;
    sb.functions.invoke('contact', { body: { id } }).catch(() => {});
    f.reset(); delete f.dataset.product;
    toast("Thank you! We'll reply very soon ✺");
  } catch {
    location.href = `mailto:${CONFIG.BUSINESS_EMAIL}?subject=${encodeURIComponent("Message from " + data.name)}&body=${encodeURIComponent(data.message + '\n\n' + (data.phone || '') + ' ' + (data.email || ''))}`;
  } finally {
    btn.disabled = false; btn.innerHTML = `Send message ${I.arrow}`;
  }
});

/* ---------- install ---------- */
const instSheet = $('#installSheet');
function openInstall() {
  $('#instSteps').innerHTML = isIOS()
    ? `<li><span>Open this site in <b>Safari</b></span></li><li><span>Tap the Share button ${I.share}</span></li><li><span>Choose <b>Add to Home Screen</b> ${I.plusSq}</span></li>`
    : `<li><span>Open this site in <b>Chrome</b></span></li><li><span>Tap the <b>⋮</b> menu at the top</span></li><li><span>Choose <b>Install app</b> or <b>Add to Home screen</b></span></li>`;
  instSheet.showModal();
}
$('#installLink').addEventListener('click', (e) => { e.preventDefault(); installApp(openInstall); });

/* ---------- boot ---------- */
(async function boot() {
  const settingsP = applySettings();
  if (configured) {
    user = await currentUser();
    sb.auth.onAuthStateChange((_e, s) => { user = s?.user ?? null; });
  }
  await Promise.all([loadProducts(), loadWish(), settingsP]);
  renderChips(); renderGrid(); heroImages(); injectItemList();
  const id = new URLSearchParams(location.search).get('item');
  if (id) openProduct(products.find((x) => x.slug === id || x.id === id), false);
  loadReviews();
})();
