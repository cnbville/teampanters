/* ===========================================================
   Supabase connection.

   Two ways to set this up — pick one:

   1) Edit this file. Paste your project URL and anon key below
      and commit. The anon key is a PUBLIC key by design; it is
      safe in a public repo as long as Row Level Security is on
      (supabase/schema.sql switches it on for you).

   2) Leave the placeholders. The app then shows a setup screen
      on first load and stores the values in this browser's
      localStorage. Handy for trying it out, but every teammate
      has to enter them once — option 1 is better for the team.
   =========================================================== */

export const BUILTIN = {
  url:     'YOUR_SUPABASE_URL',
  anonKey: 'YOUR_SUPABASE_ANON_KEY',
};

/* Shown in the header. Make it yours. */
export const BRAND = {
  team:  'Team Panters',
  arena: 'Sales Arena',
  mark:  '⚡',
};

/* Points awarded by the one-tap buttons in the admin console. */
export const SCORE_KINDS = [
  { id: 'sale',    label: 'Sale',      points: 10, emoji: '💰' },
  { id: 'upsell',  label: 'Upsell',    points: 15, emoji: '🚀' },
  { id: 'fiber',   label: 'Fiber',     points: 25, emoji: '🌐' },
  { id: 'save',    label: 'Retention', points: 12, emoji: '🛡️' },
  { id: 'assist',  label: 'Assist',    points: 5,  emoji: '🤝' },
  { id: 'bonus',   label: 'Bonus',     points: 20, emoji: '⭐' },
];

const LS_KEY = 'panters.supabase';

export function readConfig() {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { /* ignore */ }

  const url = valid(BUILTIN.url) ? BUILTIN.url : (stored && stored.url) || '';
  const key = valid(BUILTIN.anonKey) ? BUILTIN.anonKey : (stored && stored.anonKey) || '';
  return { url: url.trim().replace(/\/+$/, ''), anonKey: key.trim() };
}

export function saveConfig(url, anonKey) {
  localStorage.setItem(LS_KEY, JSON.stringify({ url: url.trim(), anonKey: anonKey.trim() }));
}

export function clearConfig() { localStorage.removeItem(LS_KEY); }

export function isConfigured() {
  const c = readConfig();
  return valid(c.url) && valid(c.anonKey);
}

function valid(v) {
  return typeof v === 'string' && v.length > 8 && !v.startsWith('YOUR_');
}

/* Demo mode lets the page show something real before Supabase
   is wired up. Data lives in this browser only. */
export const DEMO_KEY = 'panters.demo';
export function demoOn()  { return localStorage.getItem(DEMO_KEY) === '1'; }
export function setDemo(on) {
  if (on) localStorage.setItem(DEMO_KEY, '1');
  else localStorage.removeItem(DEMO_KEY);
}
