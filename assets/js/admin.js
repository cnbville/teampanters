/* Admin console — the only place anything is written. */

import { $, $$, el, clear, num, esc, relTime, countdown, toLocalInput, fromLocalInput,
         initTheme, toggleTheme, toast, confirmAction, SERIES } from './util.js';
import { BRAND, SCORE_KINDS, isConfigured, demoOn, clearConfig, setDemo, readConfig } from './config.js';
import { makeStore } from './store.js';
import { renderGate, renderError } from './gate.js';
import * as M from './model.js';
import { emptyBox } from './charts.js';

const EMOJI = ['🦊','🦁','🐧','🦉','🦋','🐺','🐯','🐻','🦄','🐙','🚀','⚡','🎯','🔥','🎧','📡'];
const ROLES = ['Sales', 'IT', 'Hybrid', 'Support', 'Lead'];

let store = null;
let snap = { players: [], duels: [], matches: [], entries: [], events: [] };

initTheme();
$('#brandTeam').textContent = BRAND.team;
$('#brandMark').textContent = BRAND.mark;
document.title = `Admin — ${BRAND.team}`;

$('#themeBtn').addEventListener('click', toggleTheme);
$('#signOutBtn').addEventListener('click', async () => { await store.signOut(); location.reload(); });
$$('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.panel)));
if (location.hash) showTab(location.hash.slice(1));

boot();

/* ---------------------------------------------------------- */

function showTab(name) {
  const known = $$('.tab').map(t => t.dataset.panel);
  if (!known.includes(name)) return;
  $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.panel === name));
  $$('.panel').forEach(p => p.classList.toggle('on', p.id === `panel-${name}`));
  history.replaceState(null, '', `#${name}`);
}

async function boot() {
  if (!isConfigured() && !demoOn()) {
    renderGate($('#gate'), { onDone: () => location.reload() });
    return;
  }
  try {
    store = await makeStore();
    if (!store) { renderGate($('#gate'), { onDone: () => location.reload() }); return; }
  } catch (err) {
    renderError($('#gate'), err.message || String(err), { onReset: () => location.reload() });
    return;
  }

  if (store.mode === 'demo') {
    $('#loginSub').textContent = 'Demo mode — any email gets you in. Nothing leaves this browser.';
  }

  if (store.user()) await enter();
  else showLogin();
}

function showLogin() {
  $('#login').classList.remove('hidden');
  $('#app').classList.add('hidden');
  const go = async () => {
    const email = $('#loginEmail').value.trim();
    const pw = $('#loginPassword').value;
    const err = $('#loginErr');
    err.style.display = 'none';
    $('#loginBtn').disabled = true;
    try {
      await store.signIn(email, pw);
      await enter();
    } catch (e) {
      err.textContent = e.message || 'Sign in failed.';
      err.style.display = 'block';
    } finally {
      $('#loginBtn').disabled = false;
    }
  };
  $('#loginBtn').addEventListener('click', go);
  $('#loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
}

async function enter() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#signOutBtn').classList.remove('hidden');
  const u = store.user();
  $('#whoami').textContent = u?.email || '';
  wireStaticControls();
  await reload();
}

async function reload() {
  try {
    snap = await store.loadAll();
  } catch (err) {
    toast(err.message, 'bad');
    return;
  }
  renderQuick();
  renderRecent();
  renderRoster();
  renderDuelAdmin();
  renderMatchAdmin();
  renderSettings();
  fillPlayerSelect($('#cePlayer'));
}

/* small write wrapper: one place for errors + refresh */
async function write(fn, okMsg) {
  try {
    await fn();
    if (okMsg) toast(okMsg, 'good');
    await reload();
    return true;
  } catch (err) {
    toast(err.message || 'Write failed', 'bad');
    return false;
  }
}

/* ---------------------------------------------------------- */
/* Shared bits                                                 */
/* ---------------------------------------------------------- */

function avatar(p, size = '') {
  return el('span', { class: `avatar ${size}`, style: { '--pc': M.colorOf(p) },
    text: p?.emoji || '🎧', 'aria-hidden': 'true' });
}

function chip(p, size = '') {
  return el('span', { class: 'pchip' }, [
    avatar(p, size),
    el('span', { style: { minWidth: 0 } }, [
      el('div', { class: 'nm', text: M.displayName(p) }),
      el('div', { class: 'rl', text: p?.nickname ? `${p.name} · ${p.role || ''}` : (p?.role || '') }),
    ]),
  ]);
}

function fillPlayerSelect(sel, selected, { includeBlank = false } = {}) {
  if (!sel) return;
  clear(sel);
  if (includeBlank) sel.appendChild(el('option', { value: '', text: '—' }));
  for (const p of snap.players.filter(p => p.active !== false)) {
    sel.appendChild(el('option', { value: p.id, text: M.displayName(p), selected: p.id === selected }));
  }
}

/* generic modal */
function modal({ title, sub, fields, submitLabel = 'Save', onSubmit, extraActions = [] }) {
  const host = $('#modalHost');
  clear(host);

  const body = el('div', {});
  for (const f of fields) body.appendChild(f.node);

  const close = () => clear(host);

  const box = el('div', { class: 'modal' }, [
    el('h2', { text: title }),
    sub ? el('p', { class: 'sub', text: sub }) : null,
    body,
    el('div', { class: 'modal-actions' }, [
      ...extraActions,
      el('button', { class: 'btn btn-ghost', onclick: close }, 'Cancel'),
      el('button', { class: 'btn btn-primary', onclick: async () => {
        const ok = await onSubmit();
        if (ok !== false) close();
      } }, submitLabel),
    ]),
  ]);

  const back = el('div', { class: 'modal-back', onclick: e => { if (e.target === back) close(); } }, [box]);
  host.appendChild(back);
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
  const first = box.querySelector('input, select, textarea');
  if (first) setTimeout(() => first.focus(), 50);
  return { close };
}

function field(label, input) {
  return { node: el('label', { class: 'field' }, [el('span', { text: label }), input]), input };
}

function textInput(value = '', placeholder = '') {
  return el('input', { type: 'text', value, placeholder });
}
function numInput(value = '', step = '1') {
  return el('input', { type: 'number', value, step });
}
function selectInput(options, selected) {
  return el('select', {}, options.map(o =>
    el('option', { value: o.value, text: o.label, selected: o.value === selected })));
}

/* ---------------------------------------------------------- */
/* Log scores                                                  */
/* ---------------------------------------------------------- */

function wireStaticControls() {
  const kindSel = $('#ceKind');
  clear(kindSel);
  for (const k of SCORE_KINDS) kindSel.appendChild(el('option', { value: k.id, text: `${k.emoji} ${k.label}` }));
  kindSel.addEventListener('change', () => {
    const k = SCORE_KINDS.find(x => x.id === kindSel.value);
    if (k) $('#cePoints').value = k.points;
  });

  $('#ceAdd').addEventListener('click', async () => {
    const playerId = $('#cePlayer').value;
    if (!playerId) { toast('Pick a teammate first', 'bad'); return; }
    await addScore(playerId, Number($('#cePoints').value || 0), kindSel.value, $('#ceNote').value.trim());
    $('#ceNote').value = '';
  });

  $('#addPlayerBtn').addEventListener('click', () => playerModal(null));
  $('#addDuelBtn').addEventListener('click', () => duelModal(null));
  $('#addMatchBtn').addEventListener('click', () => matchModal(null));
}

async function addScore(playerId, points, kind, note) {
  const p = snap.players.find(x => x.id === playerId);
  await write(() => store.insert('score_events', {
    player_id: playerId,
    points,
    kind,
    note: note || null,
    occurred_at: new Date().toISOString(),
  }), `${M.displayName(p)} +${num(points)}`);
}

function renderQuick() {
  const host = $('#quickGrid');
  clear(host);

  const active = snap.players.filter(p => p.active !== false);
  if (!active.length) {
    host.appendChild(emptyBox('Add your first teammate on the Roster tab.', 'Nobody on the roster'));
    return;
  }

  const today = new Map();
  const start = new Date(); start.setHours(0, 0, 0, 0);
  for (const e of snap.events) {
    if (new Date(e.occurred_at) >= start) {
      today.set(e.player_id, (today.get(e.player_id) || 0) + Number(e.points || 0));
    }
  }

  for (const p of active) {
    host.appendChild(el('div', { class: 'quick' }, [
      el('div', { class: 'top' }, [avatar(p), el('div', { style: { minWidth: 0 } }, [
        el('div', { class: 'nm', style: { fontWeight: '640', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: M.displayName(p) }),
        el('div', { class: 'today', html: `today <b>${num(today.get(p.id) || 0)}</b>` }),
      ])]),
      el('div', { class: 'btns' }, SCORE_KINDS.slice(0, 3).map(k =>
        el('button', {
          class: 'btn btn-sm',
          title: `${k.label} (+${k.points})`,
          onclick: () => addScore(p.id, k.points, k.id, ''),
        }, `${k.emoji} ${k.points}`))),
      el('div', { class: 'btns' }, SCORE_KINDS.slice(3).map(k =>
        el('button', {
          class: 'btn btn-sm btn-ghost',
          title: `${k.label} (+${k.points})`,
          onclick: () => addScore(p.id, k.points, k.id, ''),
        }, `${k.emoji} ${k.points}`))),
    ]));
  }
}

function renderRecent() {
  const host = $('#recentList');
  clear(host);
  const pmap = M.playerMap(snap.players);
  const list = snap.events.slice(0, 25);

  if (!list.length) { host.appendChild(emptyBox('No scores logged yet.')); return; }

  for (const e of list) {
    const p = pmap.get(e.player_id);
    if (!p) continue;
    const k = SCORE_KINDS.find(x => x.id === e.kind);
    host.appendChild(el('div', { class: 'list-item' }, [
      avatar(p, 'sm'),
      el('span', { style: { fontWeight: '620' }, text: M.displayName(p) }),
      el('span', { style: { color: 'var(--text-muted)', fontSize: '13px' }, text: e.note || (k ? k.label : e.kind || '') }),
      el('span', { class: 'spacer' }),
      el('span', { style: { fontWeight: '700', fontVariantNumeric: 'tabular-nums' }, text: `+${num(e.points)}` }),
      el('span', { style: { fontSize: '12px', color: 'var(--text-muted)', minWidth: '62px', textAlign: 'right' }, text: relTime(e.occurred_at) }),
      el('button', {
        class: 'btn btn-sm btn-danger',
        title: 'Remove this score',
        onclick: () => write(() => store.remove('score_events', e.id), 'Score removed'),
      }, '✕'),
    ]));
  }
}

/* ---------------------------------------------------------- */
/* Roster                                                      */
/* ---------------------------------------------------------- */

function renderRoster() {
  const host = $('#playerList');
  clear(host);

  if (!snap.players.length) {
    host.appendChild(emptyBox('Add the people on your floor — a nickname and an animal go a long way.', 'Empty roster'));
    return;
  }

  for (const p of snap.players) {
    host.appendChild(el('div', { class: 'list-item', style: { opacity: p.active === false ? '.5' : '1' } }, [
      chip(p),
      el('span', { class: 'spacer' }),
      p.active === false ? el('span', { class: 'tag', text: 'benched' }) : null,
      el('button', { class: 'btn btn-sm btn-ghost', onclick: () => playerModal(p) }, 'Edit'),
      el('button', {
        class: 'btn btn-sm btn-ghost',
        onclick: () => write(() => store.update('players', p.id, { active: p.active === false }),
          p.active === false ? 'Back on the floor' : 'Benched'),
      }, p.active === false ? 'Activate' : 'Bench'),
      el('button', {
        class: 'btn btn-sm btn-danger',
        onclick: () => {
          if (!confirmAction(`Delete ${p.name}? Their scores, duels and match entries go too. This cannot be undone.`)) return;
          write(() => store.remove('players', p.id), `${p.name} removed`);
        },
      }, 'Delete'),
    ]));
  }
}

function playerModal(p) {
  const name     = textInput(p?.name || '', 'Sanne de Vries');
  const nickname = textInput(p?.nickname || '', 'The Closer');
  const role     = selectInput(ROLES.map(r => ({ value: r, label: r })), p?.role || 'Sales');

  let emoji = p?.emoji || EMOJI[0];
  const emojiRow = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
    EMOJI.map(e => {
      const b = el('button', {
        class: `btn btn-sm${e === emoji ? ' btn-primary' : ' btn-ghost'}`,
        type: 'button',
        style: { fontSize: '16px', padding: '4px 8px' },
        onclick: () => {
          emoji = e;
          [...emojiRow.children].forEach(c => { c.className = 'btn btn-sm btn-ghost'; });
          b.className = 'btn btn-sm btn-primary';
        },
      }, e);
      return b;
    }));

  let color = p?.color || SERIES.map(s => `var(${s})`)[0];
  const colorRow = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
    SERIES.map(s => {
      const v = `var(${s})`;
      const b = el('button', {
        type: 'button',
        title: s.replace('--series-', 'colour '),
        style: {
          width: '30px', height: '30px', borderRadius: '9px', cursor: 'pointer',
          background: v, border: v === color ? '2px solid var(--text-primary)' : '1px solid var(--border)',
        },
        onclick: () => {
          color = v;
          [...colorRow.children].forEach(c => { c.style.border = '1px solid var(--border)'; });
          b.style.border = '2px solid var(--text-primary)';
        },
      });
      return b;
    }));

  modal({
    title: p ? `Edit ${p.name}` : 'Add a teammate',
    fields: [
      field('Name', name),
      field('Nickname (shown on the board)', nickname),
      field('Role', role),
      { node: el('label', { class: 'field' }, [el('span', { text: 'Avatar' }), emojiRow]) },
      { node: el('label', { class: 'field' }, [el('span', { text: 'Colour' }), colorRow]) },
    ],
    submitLabel: p ? 'Save' : 'Add',
    onSubmit: async () => {
      if (!name.value.trim()) { toast('A name is required', 'bad'); return false; }
      const row = {
        name: name.value.trim(),
        nickname: nickname.value.trim() || null,
        role: role.value,
        emoji, color,
      };
      return p
        ? write(() => store.update('players', p.id, row), 'Saved')
        : write(() => store.insert('players', { ...row, active: true }), `${row.name} is on the board`);
    },
  });
}

/* ---------------------------------------------------------- */
/* Duels                                                       */
/* ---------------------------------------------------------- */

function renderDuelAdmin() {
  const host = $('#duelAdminList');
  clear(host);
  const pmap = M.playerMap(snap.players);

  if (!snap.duels.length) {
    host.appendChild(el('div', { class: 'card' }, [el('div', { class: 'card-body', style: { paddingTop: '20px' } }, [
      emptyBox('Two people, one metric, something at stake. That is a duel.', 'No duels yet'),
    ])]));
    return;
  }

  for (const d of snap.duels) {
    const a = pmap.get(d.player_a);
    const b = pmap.get(d.player_b);
    if (!a || !b) continue;
    const s = M.duelState(d);

    const bump = (side, by) => write(
      () => store.update('duels', d.id, { [side]: Math.max(0, Number(d[side] || 0) + by) }));

    host.appendChild(el('section', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h3', { text: d.title || `${M.displayName(a)} vs ${M.displayName(b)}` }),
        el('span', { class: 'spacer' }),
        el('span', { class: `tag ${d.status}`, text: d.status }),
      ]),
      el('div', { class: 'card-body' }, [
        el('div', { class: 'tug', style: { marginBottom: '14px' } }, [
          el('div', { class: 'tug-a', style: { width: `${s.pctA}%` } }),
          el('div', { class: 'tug-b', style: { width: `${s.pctB}%` } }),
        ]),

        scoreStepper(a, s.a, 'var(--series-1)', by => bump('score_a', by)),
        scoreStepper(b, s.b, 'var(--series-2)', by => bump('score_b', by)),

        el('div', { style: { display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' } }, [
          el('span', { style: { fontSize: '12.5px', color: 'var(--text-muted)', alignSelf: 'center', flex: '1' },
            text: `${d.metric || 'Points'}${d.target ? ` · first to ${num(d.target)}` : ''}${d.ends_at ? ` · ${countdown(d.ends_at)}` : ''}` }),
          d.status !== 'finished'
            ? el('button', { class: 'btn btn-sm btn-warm', onclick: () => finishDuel(d) }, 'Finish')
            : el('button', { class: 'btn btn-sm btn-ghost', onclick: () => write(() => store.update('duels', d.id, { status: 'live', winner: null }), 'Back on') }, 'Re-open'),
          el('button', { class: 'btn btn-sm btn-ghost', onclick: () => duelModal(d) }, 'Edit'),
          el('button', {
            class: 'btn btn-sm btn-danger',
            onclick: () => {
              if (!confirmAction('Delete this duel?')) return;
              write(() => store.remove('duels', d.id), 'Duel deleted');
            },
          }, 'Delete'),
        ]),
      ]),
    ]));
  }
}

function scoreStepper(p, value, color, onBump) {
  return el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0' } }, [
    avatar(p, 'sm'),
    el('span', { style: { fontWeight: '620', flex: '1', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: M.displayName(p) }),
    el('span', { style: { fontWeight: '720', fontSize: '18px', color, fontVariantNumeric: 'tabular-nums', minWidth: '40px', textAlign: 'right' }, text: num(value) }),
    el('button', { class: 'btn btn-sm', onclick: () => onBump(-1), 'aria-label': `minus one for ${M.displayName(p)}` }, '−'),
    el('button', { class: 'btn btn-sm btn-primary', onclick: () => onBump(1), 'aria-label': `plus one for ${M.displayName(p)}` }, '+'),
  ]);
}

function finishDuel(d) {
  const s = M.duelState(d);
  const winner = s.leader === 'a' ? d.player_a : s.leader === 'b' ? d.player_b : null;
  write(() => store.update('duels', d.id, { status: 'finished', winner }), 'Duel closed');
}

function duelModal(d) {
  const title  = textInput(d?.title || '', 'Fiber Friday');
  const aSel   = el('select', {});
  const bSel   = el('select', {});
  const metric = textInput(d?.metric || 'Sales', 'Sales');
  const target = numInput(d?.target ?? '', '1');
  const stake  = textInput(d?.stake || '', 'Loser buys the Friday round');
  const status = selectInput(
    [{ value: 'live', label: 'Live' }, { value: 'scheduled', label: 'Scheduled' }, { value: 'finished', label: 'Finished' }],
    d?.status || 'live');
  const ends   = el('input', { type: 'datetime-local', value: toLocalInput(d?.ends_at) });

  fillPlayerSelect(aSel, d?.player_a);
  fillPlayerSelect(bSel, d?.player_b);
  if (!d && snap.players.length > 1) bSel.selectedIndex = 1;

  modal({
    title: d ? 'Edit duel' : 'New duel',
    sub: 'Two names, one number to chase, and something worth winning.',
    fields: [
      field('Title', title),
      field('Challenger', aSel),
      field('Opponent', bSel),
      field('What counts', metric),
      field('First to (optional)', target),
      field('At stake', stake),
      field('Status', status),
      field('Ends (optional)', ends),
    ],
    submitLabel: d ? 'Save' : 'Start the duel',
    onSubmit: async () => {
      if (!aSel.value || !bSel.value) { toast('Pick two teammates', 'bad'); return false; }
      if (aSel.value === bSel.value) { toast('A duel needs two different people', 'bad'); return false; }
      const row = {
        title: title.value.trim() || null,
        player_a: aSel.value,
        player_b: bSel.value,
        metric: metric.value.trim() || 'Points',
        target: target.value === '' ? null : Number(target.value),
        stake: stake.value.trim() || null,
        status: status.value,
        ends_at: fromLocalInput(ends.value),
      };
      return d
        ? write(() => store.update('duels', d.id, row), 'Duel updated')
        : write(() => store.insert('duels', { ...row, score_a: 0, score_b: 0, starts_at: new Date().toISOString() }), 'Duel is on');
    },
  });
}

/* ---------------------------------------------------------- */
/* Matches                                                     */
/* ---------------------------------------------------------- */

function renderMatchAdmin() {
  const host = $('#matchAdminList');
  clear(host);
  const pmap = M.playerMap(snap.players);

  if (!snap.matches.length) {
    host.appendChild(el('div', { class: 'card' }, [el('div', { class: 'card-body', style: { paddingTop: '20px' } }, [
      emptyBox('A match is one scoreboard the whole floor shares — a sprint, a month, a campaign.', 'No matches yet'),
    ])]));
    return;
  }

  for (const m of snap.matches) {
    const rows = M.matchStandings(m, snap.entries, pmap);
    const inMatch = new Set(rows.map(r => r.player.id));
    const available = snap.players.filter(p => p.active !== false && !inMatch.has(p.id));

    const addSel = el('select', { style: { maxWidth: '220px' } },
      available.map(p => el('option', { value: p.id, text: M.displayName(p) })));

    host.appendChild(el('section', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h3', { text: m.title }),
        el('span', { class: 'spacer' }),
        el('span', { class: `tag ${m.status}`, text: m.status }),
        el('button', { class: 'btn btn-sm btn-ghost', onclick: () => matchModal(m) }, 'Edit'),
        el('button', {
          class: 'btn btn-sm btn-danger',
          onclick: () => {
            if (!confirmAction(`Delete "${m.title}" and all its scores?`)) return;
            write(() => store.remove('matches', m.id), 'Match deleted');
          },
        }, 'Delete'),
      ]),
      el('div', { class: 'card-body' }, [
        m.description ? el('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', marginTop: 0 }, text: m.description }) : null,

        rows.length ? el('div', { class: 'list' }, rows.map(r => {
          const input = numInput(r.score, '1');
          input.style.maxWidth = '110px';
          const save = () => write(() => store.upsertEntry({
            match_id: m.id, player_id: r.player.id, score: Number(input.value || 0),
          }));
          input.addEventListener('change', save);
          return el('div', { class: 'list-item' }, [
            el('span', { style: { width: '22px', color: 'var(--text-muted)', fontSize: '12px' }, text: `${r.rank}` }),
            avatar(r.player, 'sm'),
            el('span', { style: { fontWeight: '620' }, text: M.displayName(r.player) }),
            el('span', { class: 'spacer' }),
            el('button', { class: 'btn btn-sm', onclick: () => { input.value = Number(input.value || 0) - 1; save(); } }, '−'),
            input,
            el('button', { class: 'btn btn-sm btn-primary', onclick: () => { input.value = Number(input.value || 0) + 1; save(); } }, '+'),
            el('button', {
              class: 'btn btn-sm btn-danger', title: 'Remove from this match',
              onclick: () => write(() => store.removeEntry(m.id, r.player.id), 'Removed from match'),
            }, '✕'),
          ]);
        })) : emptyBox('Nobody in this match yet.'),

        available.length ? el('div', { style: { display: 'flex', gap: '8px', marginTop: '14px' } }, [
          addSel,
          el('button', {
            class: 'btn btn-sm btn-primary',
            onclick: () => {
              if (!addSel.value) return;
              write(() => store.upsertEntry({ match_id: m.id, player_id: addSel.value, score: 0 }), 'Added to the match');
            },
          }, 'Add to match'),
        ]) : null,
      ]),
    ]));
  }
}

function matchModal(m) {
  const title  = textInput(m?.title || '', 'September Sprint');
  const desc   = el('textarea', { placeholder: 'What are we chasing, and why should anyone care?' });
  desc.value = m?.description || '';
  const metric = textInput(m?.metric || 'Points', 'Points');
  const target = numInput(m?.target ?? '', '1');
  const status = selectInput(
    [{ value: 'live', label: 'Live' }, { value: 'scheduled', label: 'Scheduled' }, { value: 'finished', label: 'Finished' }],
    m?.status || 'live');
  const ends   = el('input', { type: 'datetime-local', value: toLocalInput(m?.ends_at) });

  modal({
    title: m ? 'Edit match' : 'New match',
    fields: [
      field('Title', title),
      field('Description', desc),
      field('What counts', metric),
      field('Team target (optional)', target),
      field('Status', status),
      field('Ends (optional)', ends),
    ],
    submitLabel: m ? 'Save' : 'Create match',
    onSubmit: async () => {
      if (!title.value.trim()) { toast('Give it a name', 'bad'); return false; }
      const row = {
        title: title.value.trim(),
        description: desc.value.trim() || null,
        metric: metric.value.trim() || 'Points',
        target: target.value === '' ? null : Number(target.value),
        status: status.value,
        ends_at: fromLocalInput(ends.value),
      };
      return m
        ? write(() => store.update('matches', m.id, row), 'Match updated')
        : write(() => store.insert('matches', { ...row, starts_at: new Date().toISOString() }), 'Match created');
    },
  });
}

/* ---------------------------------------------------------- */
/* Settings                                                    */
/* ---------------------------------------------------------- */

function renderSettings() {
  const host = $('#backendInfo');
  clear(host);

  if (store.mode === 'demo') {
    host.appendChild(el('div', {}, [
      el('p', { style: { marginTop: 0, fontSize: '13.5px', color: 'var(--text-secondary)' }, html:
        '<b>Demo mode.</b> Data lives in this browser only — nobody else sees it. ' +
        'Connect Supabase to make the Arena real and shared across the floor.' }),
      el('button', {
        class: 'btn btn-primary',
        onclick: () => { setDemo(false); clearConfig(); location.reload(); },
      }, 'Connect Supabase'),
    ]));
  } else {
    const cfg = readConfig();
    host.appendChild(el('div', {}, [
      el('p', { style: { marginTop: 0, fontSize: '13.5px', color: 'var(--text-secondary)' } }, [
        document.createTextNode('Connected to '),
        el('b', { text: cfg.url.replace(/^https?:\/\//, '') }),
        document.createTextNode(` as ${store.user()?.email || 'admin'}.`),
      ]),
      el('button', {
        class: 'btn btn-ghost',
        onclick: () => { clearConfig(); location.reload(); },
      }, 'Forget these details on this device'),
    ]));
  }

  const danger = $('#dangerZone');
  clear(danger);
  danger.appendChild(el('p', { style: { marginTop: 0, fontSize: '13.5px', color: 'var(--text-secondary)' },
    text: 'Clearing scores keeps the roster, duels and matches — it only wipes the points history.' }));
  danger.appendChild(el('button', {
    class: 'btn btn-danger',
    onclick: async () => {
      if (!confirmAction(`Delete all ${snap.events.length} logged scores? This cannot be undone.`)) return;
      for (const e of snap.events) {
        try { await store.remove('score_events', e.id); } catch { /* keep going */ }
      }
      toast('Score history cleared', 'good');
      await reload();
    },
  }, 'Clear all scores'));

  if (store.mode === 'demo') {
    danger.appendChild(el('button', {
      class: 'btn btn-danger', style: { marginLeft: '8px' },
      onclick: () => {
        if (!confirmAction('Reset the demo data back to the sample team?')) return;
        localStorage.removeItem('panters.demo.data');
        location.reload();
      },
    }, 'Reset demo data'));
  }
}
