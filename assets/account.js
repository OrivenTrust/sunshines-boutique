import { sb, configured, $, $$, esc, money, toast, getSettings, signInGoogle, registerSW, SUN_SVG } from './core.js';
import { I } from './icons.js';

registerSW();
$$('[data-sun]').forEach((el) => el.insertAdjacentHTML('afterbegin', SUN_SVG));
$$('[data-i]').forEach((el) => el.insertAdjacentHTML('afterbegin', I[el.dataset.i] || ''));

const next = new URLSearchParams(location.search).get('next');
const views = { auth: $('#authView'), reset: $('#resetView'), dash: $('#dashView') };
const show = (v) => Object.entries(views).forEach(([k, el]) => (el.hidden = k !== v));

/* ---------- sign in / up ---------- */
let mode = 'signup';
function setMode(m) {
  mode = m;
  $$('.tabs [data-mode]').forEach((b) => b.setAttribute('aria-selected', b.dataset.mode === m));
  $('#nameField').hidden = m !== 'signup';
  $('#passField').hidden = m === 'magic';
  $('#aPass').autocomplete = m === 'signup' ? 'new-password' : 'current-password';
  $('#authSubmit').textContent = { signup: 'Create my account', signin: 'Sign in', magic: 'Email me a reset link' }[m];
  $('#authTitle').innerHTML = { signup: 'Join the <em>sunshine</em> list', signin: 'Welcome <em>back</em>', magic: 'Reset your <em>password</em>' }[m];
}
$$('.tabs [data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('#forgotBtn').addEventListener('click', () => setMode('magic'));
$('#googleBtn').addEventListener('click', () => signInGoogle('/account.html' + (next ? `?next=${encodeURIComponent(next)}` : '')));

$('#authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!configured) return toast('The shop is still being connected — try again soon');
  const email = $('#aEmail').value.trim();
  const password = $('#aPass').value;
  const btn = $('#authSubmit'); btn.disabled = true;
  try {
    if (mode === 'signup') {
      if (password.length < 6) throw new Error('Password needs at least 6 characters');
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: $('#aName').value.trim() }, emailRedirectTo: location.origin + '/account.html' } });
      if (error) throw error;
      if (!data.session) toast('Check your email to confirm your account ✉️');
    } else if (mode === 'signin') {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/account.html' });
      if (error) throw error;
      toast('Reset link sent — check your email');
    }
  } catch (err) {
    toast(err.message || 'Something went wrong', 'err');
  } finally { btn.disabled = false; }
});

$('#resetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { error } = await sb.auth.updateUser({ password: $('#newPass').value });
  if (error) return toast(error.message, 'err');
  toast('Password saved ✺'); boot();
});

/* ---------- dashboard ---------- */
let user, myReview, rating = 0;

async function loadDash() {
  const meta = user.user_metadata || {};
  const { data: prof } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  const name = prof?.full_name || meta.full_name || meta.name || user.email.split('@')[0];
  $('#hi').innerHTML = `Hello, <em>${esc(name.split(' ')[0])}</em>`;
  const av = prof?.avatar_url || meta.avatar_url;
  $('#avatar').innerHTML = av ? `<img src="${esc(av)}" alt="" referrerpolicy="no-referrer">` : esc(name[0].toUpperCase());
  $('#pName').value = name; $('#pPhone').value = prof?.phone || '';
  const { data: isAdmin } = await sb.rpc('is_admin');
  $('#studioLink').hidden = !isAdmin;

  // wishlist
  const { data: wl } = await sb.from('wishlist').select('product_id, products(*)').eq('user_id', user.id).order('created_at', { ascending: false });
  const items = (wl || []).map((r) => r.products).filter(Boolean);
  $('#wishGrid').innerHTML = items.length
    ? items.map((p) => `<a class="card" href="/?item=${encodeURIComponent(p.slug || p.id)}"><div class="ph">${p.images?.[0] ? `<img src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy">` : ''}</div><div class="info"><span class="cat">${esc(p.category || '')}</span><span class="name">${esc(p.name)}</span><span class="price">${p.status === 'sold' ? 'Sold' : money(p.price)}</span></div></a>`).join('')
    : `<div class="empty" style="grid-column:1/-1"><h3>No favourites yet</h3><p>Tap the ♡ on any piece to keep it here.</p><a class="btn sun" href="/#shop">Browse the collection</a></div>`;

  // review
  const { data: rv } = await sb.from('reviews').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1);
  myReview = rv?.[0];
  if (myReview) { rating = myReview.rating; $('#rComment').value = myReview.comment || ''; showThanks(); }
  paintStars();

  const s = await getSettings();
  if (s.google_review_url) { $('#googleNudge').hidden = false; $('#googleReviewBtn').href = s.google_review_url; }

  if (location.hash) setTimeout(() => $(location.hash)?.scrollIntoView({ behavior: 'smooth' }), 300);
}

function paintStars() {
  $('#rateStars').innerHTML = [1, 2, 3, 4, 5].map((i) => `<button type="button" role="radio" aria-checked="${i === rating}" aria-label="${i} star${i > 1 ? 's' : ''}" class="${i <= rating ? 'on' : ''}" data-r="${i}">${I.star}</button>`).join('');
}
$('#rateStars').addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) { rating = +b.dataset.r; paintStars(); } });
function showThanks() { $('#rateForm').hidden = true; $('#rateThanks').hidden = false; }
$('#editReview').addEventListener('click', () => { $('#rateForm').hidden = false; $('#rateThanks').hidden = true; });

$('#rateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!rating) return toast('Tap the stars to choose a rating');
  const row = { rating, comment: $('#rComment').value.trim(), name: $('#pName').value.trim() || 'Customer' };
  const q = myReview ? sb.from('reviews').update(row).eq('id', myReview.id).select().single() : sb.from('reviews').insert({ ...row, user_id: user.id }).select().single();
  const { data, error } = await q;
  if (error) return toast(error.message, 'err');
  myReview = data; showThanks(); toast('Review posted ✺');
});

$('#profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { error } = await sb.from('profiles').upsert({ id: user.id, full_name: $('#pName').value.trim(), phone: $('#pPhone').value.trim() });
  if (error) return toast(error.message, 'err');
  toast('Saved'); $('#hi').innerHTML = `Hello, <em>${esc(($('#pName').value.trim() || 'there').split(' ')[0])}</em>`;
});
$('#signOut').addEventListener('click', async () => { await sb.auth.signOut(); location.href = '/'; });

/* ---------- boot ---------- */
async function boot() {
  if (!configured) { show('auth'); return; }
  const { data } = await sb.auth.getSession();
  user = data.session?.user;
  if (!user) { show('auth'); if (location.hash === '#rate' || location.hash === '#wishlist') setMode('signup'); return; }
  if (next && next.startsWith('/')) { location.replace(next); return; }
  show('dash'); loadDash();
}
if (sb) sb.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') { show('reset'); return; }
  if (event === 'SIGNED_IN' && session && views.dash.hidden && views.reset.hidden) boot();
});
setMode('signup');
boot();
