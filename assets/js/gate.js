/* First-run screen: connect Supabase, or look around with demo data. */

import { el, clear, $ } from './util.js';
import { saveConfig, clearConfig } from './config.js';
import { startDemo } from './store.js';

export function renderGate(host, { onDone }) {
  clear(host);

  const url = el('input', { type: 'text', placeholder: 'https://xxxxxxxx.supabase.co', autocomplete: 'off', spellcheck: 'false' });
  const key = el('input', { type: 'text', placeholder: 'eyJhbGciOi...', autocomplete: 'off', spellcheck: 'false' });
  const err = el('p', { class: 'sub', style: { color: 'var(--critical)', display: 'none' } });

  const connect = () => {
    const u = url.value.trim().replace(/\/+$/, '');
    const k = key.value.trim();
    if (!/^https?:\/\/.+/.test(u) || k.length < 20) {
      err.textContent = 'That does not look right. The URL starts with https:// and the anon key is a long token.';
      err.style.display = 'block';
      return;
    }
    saveConfig(u, k);
    onDone();
  };

  const modal = el('div', { class: 'modal' }, [
    el('h2', { text: 'Connect the Arena' }),
    el('p', { class: 'sub', html:
      'Paste the two values from your Supabase project (<b>Settings &rarr; API</b>). ' +
      'The anon key is a public key &mdash; it is safe here because Row Level Security guards the tables. ' +
      'Run <code>supabase/schema.sql</code> in the SQL editor first.' }),
    el('label', { class: 'field' }, [el('span', { text: 'Project URL' }), url]),
    el('label', { class: 'field' }, [el('span', { text: 'Anon / public key' }), key]),
    err,
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn btn-ghost', onclick: () => { startDemo(); onDone(); } }, 'Look around with demo data'),
      el('button', { class: 'btn btn-primary', onclick: connect }, 'Connect'),
    ]),
    el('p', { class: 'sub', style: { marginTop: '16px', marginBottom: 0, fontSize: '12.5px' }, html:
      'Prefer not to type this on every device? Put the same two values in <code>assets/js/config.js</code> and commit &mdash; then nobody sees this screen.' }),
  ]);

  key.addEventListener('keydown', e => { if (e.key === 'Enter') connect(); });
  host.appendChild(el('div', { class: 'modal-back' }, [modal]));
  setTimeout(() => url.focus(), 60);
}

export function renderError(host, message, { onReset }) {
  clear(host);
  const modal = el('div', { class: 'modal' }, [
    el('h2', { text: 'Could not reach Supabase' }),
    el('p', { class: 'sub', text: message }),
    el('p', { class: 'sub', html:
      'Usual causes: the tables have not been created yet (run <code>supabase/schema.sql</code>), ' +
      'the URL or key has a typo, or the project is paused.' }),
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn btn-ghost', onclick: () => { clearConfig(); onReset(); } }, 'Re-enter details'),
      el('button', { class: 'btn btn-primary', onclick: () => location.reload() }, 'Try again'),
    ]),
  ]);
  host.appendChild(el('div', { class: 'modal-back' }, [modal]));
}
