import { createClient } from './vendor/supabase.js';
import { CONFIG } from './config.js';

export { CONFIG };
export const configured = !CONFIG.SUPABASE_URL.includes('YOUR-') && !CONFIG.SUPABASE_ANON_KEY.includes('YOUR-');
export const sb = configured
  ? createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    })
  : null;

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const money = (n) => Number(n) > 0 ? 'UGX ' + Math.round(Number(n)).toLocaleString('en-US') : 'Ask for price';

export const slugify = (s) =>
  String(s || 'item').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 60) || 'item';

export function waNumber(n) {
  let d = String(n || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '256' + d.slice(1);           // 07xx… → 2567xx…
  if (d.length === 9 && d.startsWith('7')) d = '256' + d;   // 7xx… → 2567xx…
  return d;
}
export const waLink = (n, text = '') => `https://wa.me/${waNumber(n)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

/* ---------- toast ---------- */
let toastTimer;
export function toast(msg, kind = '') {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.className = 'toast show ' + kind;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast ' + kind), 3200);
}

/* ---------- settings ---------- */
export const DEFAULT_SETTINGS = {
  whatsapp: '',
  google_review_url: '',
  instagram: '', tiktok: '', facebook: '',
  announcement: 'New pieces every week · Order in one tap on WhatsApp · Delivery across Kampala',
  hero_title: '',
  hero_subtitle: '',
  about: '',
  hours: 'Mon – Sat · 9am – 8pm',
};
let settingsCache;
export async function getSettings() {
  if (settingsCache) return settingsCache;
  let s = {};
  try { s = JSON.parse(localStorage.getItem('sb_settings') || '{}'); } catch {}
  settingsCache = { ...DEFAULT_SETTINGS, ...s };
  if (sb) {
    const { data } = await sb.from('settings').select('*').eq('id', 1).maybeSingle();
    if (data) {
      for (const k in data) if (data[k] === null || data[k] === '') delete data[k];
      settingsCache = { ...DEFAULT_SETTINGS, ...data };
      try { localStorage.setItem('sb_settings', JSON.stringify(settingsCache)); } catch {}
    }
  }
  return settingsCache;
}
export const resetSettingsCache = () => (settingsCache = null);

/* ---------- auth ---------- */
export async function currentUser() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}
export async function signInGoogle(redirectPath = location.pathname + location.search) {
  if (!sb) return toast('Shop is still being connected');
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + redirectPath },
  });
  if (error) toast(error.message, 'err');
}

/* ---------- app install ---------- */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.documentElement.classList.add('can-install');
});
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export async function installApp(openIosSheet) {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.documentElement.classList.remove('can-install');
  } else if (openIosSheet) openIosSheet();
}

export function registerSW() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

/* ---------- small sun mark used across pages ---------- */
export const SUN_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true" class="sunmark"><g class="rays">${Array.from({ length: 12 }, (_, i) => `<rect x="30.5" y="2" width="3" height="11" rx="1.5" transform="rotate(${i * 30} 32 32)"/>`).join('')}</g><circle cx="32" cy="32" r="13"/></svg>`;

/* ---------- local demo items (only shown before the database is connected) ---------- */
const art = (a, b, c, shape) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="600" height="800" fill="url(#g)"/>${shape.replace(/C/g, c)}</svg>`);
const dress = '<path d="M250 150h100l20 90-40 40 120 380H150l120-380-40-40z" fill="C" opacity=".9"/><path d="M270 150c0 30 60 30 60 0" stroke="#fff" stroke-width="6" fill="none" opacity=".5"/>';
const top = '<path d="M200 220l70-40h60l70 40 60 110-60 30-20-40v250H220V320l-20 40-60-30z" fill="C" opacity=".9"/>';
const skirt = '<path d="M230 220h140l90 420H140z" fill="C" opacity=".9"/><rect x="230" y="200" width="140" height="30" rx="10" fill="C"/>';
const bag = '<rect x="170" y="330" width="260" height="220" rx="30" fill="C"/><path d="M230 330c0-110 140-110 140 0" stroke="C" stroke-width="18" fill="none"/>';
export const DEMO_PRODUCTS = [
  { id: 'd1', slug: 'marigold-wrap-dress', name: 'Marigold Wrap Dress', category: 'Dresses', price: 95000, compare_at: 120000, sizes: ['S', 'M', 'L', 'XL'], colors: ['Marigold'], featured: true, status: 'published', description: 'A flowing wrap dress in the warmest marigold, cut to flatter and made to move. It ties softly at the waist and falls just below the knee.\n\nPerfect for Sunday service, a garden wedding or a golden-hour dinner.', images: [art('#F6D9A8', '#E9A23B', '#B85C38', dress)] },
  { id: 'd2', slug: 'ivory-linen-set', name: 'Ivory Linen Set', category: 'Sets', price: 130000, sizes: ['M', 'L'], colors: ['Ivory'], status: 'published', description: 'Relaxed wide-leg trousers and a cropped shirt in soft, breathable ivory.\n\nEffortless for the office on a Friday and elegant enough for brunch.', images: [art('#F3E9DA', '#E3CFB3', '#FFFDF8', top)] },
  { id: 'd3', slug: 'kitenge-midi-skirt', name: 'Kitenge Midi Skirt', category: 'Skirts', price: 65000, sizes: ['S', 'M', 'L'], colors: ['Teal', 'Gold'], status: 'published', description: 'A bold printed midi skirt with a high waist and gentle flare.\n\nPair it with a simple tee for the weekend or a silk blouse for an introduction ceremony.', images: [art('#CFE3DD', '#2F6F6A', '#E9A23B', skirt)] },
  { id: 'd4', slug: 'blush-satin-blouse', name: 'Blush Satin Blouse', category: 'Tops', price: 55000, sizes: ['S', 'M', 'L', 'XL'], colors: ['Blush'], featured: true, status: 'published', description: 'Liquid-soft satin in the prettiest blush, with a relaxed drape and pearl buttons.\n\nTuck it into tailored trousers for the office.', images: [art('#FBE7DF', '#EFC9B8', '#D98E78', top)] },
  { id: 'd5', slug: 'cocoa-structured-bag', name: 'Cocoa Structured Bag', category: 'Bags', price: 75000, colors: ['Cocoa'], status: 'sold', description: 'A structured top-handle bag in rich cocoa. Holds your phone, purse and lipstick beautifully.', images: [art('#E9DCCB', '#A67B5B', '#5A3A28', bag)] },
  { id: 'd6', slug: 'sunset-maxi-dress', name: 'Sunset Maxi Dress', category: 'Dresses', price: 110000, sizes: ['M', 'L', 'XL'], colors: ['Terracotta'], status: 'published', description: 'A floor-grazing maxi in deep terracotta with a soft sweetheart neckline.\n\nMade for weddings, dinners and every photo in between.', images: [art('#F2C7A5', '#B85C38', '#7A2E1C', dress)] },
];
