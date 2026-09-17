/* The Arena — read-only wallboard. Safe to leave on a TV all day. */

import { $, el, clear, num, esc, relTime, countdown, initTheme, toggleTheme, toast } from './util.js';
import { BRAND, SCORE_KINDS, isConfigured, demoOn } from './config.js';
import { makeStore } from './store.js';
import { renderGate, renderError } from './gate.js';
import * as M from './model.js';
import { sparkline, lineChart, heatmap, tableView, emptyBox } from './charts.js';

const REFRESH_MS = 30000;

let store = null;
let snap = { players: [], duels: [], matches: [], entries: [], events: [] };
let seenEvents = new Set();
let firstLoad = true;

initTheme();
brand();
wireChrome();
boot();

/* ---------------------------------------------------------- */

function brand() {
  $('#brandTeam').textContent = BRAND.team;
  $('#brandArena').textContent = BRAND.arena;
  $('#brandMark').textContent = BRAND.mark;
  document.title = `${BRAND.arena} — ${BRAND.team}`;
}

function wireChrome() {
  $('#themeBtn').addEventListener('click', () => { toggleTheme(); renderAll(); });
  $('#tvBtn').addEventListener('click', () => {
    document.body.classList.toggle('tv');
    if (document.body.classList.contains('tv') && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('tv')) document.body.classList.remove('tv');
    if (e.key === 't' && !/input|select|textarea/i.test(e.target.tagName)) $('#tvBtn').click();
  });
  $('#lbRange').addEventListener('change', () => { renderLeaderboard(); renderStats(); });
  $('#momRange').addEventListener('change', renderMomentum);
}

async function boot() {
  if (!isConfigured() && !demoOn()) {
    renderGate($('#gate'), { onDone: () => location.reload() });
    return;
  }
  try {
    store = await makeStore();
    if (!store) { renderGate($('#gate'), { onDone: () => location.reload() }); return; }
    await refresh();
  } catch (err) {
    renderError($('#gate'), err.message || String(err), { onReset: () => location.reload() });
    return;
  }

  setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  if (store.subscribe) {
    try { store.subscribe(() => refresh()); } catch { /* realtime is a bonus, polling is the floor */ }
  }
}

async function refresh() {
  try {
    const next = await store.loadAll();
    const fresh = next.events.filter(e => !seenEvents.has(e.id));
    snap = next;
    seenEvents = new Set(next.events.map(e => e.id));
    renderAll();
    if (!firstLoad && fresh.length) celebrate(fresh);
    firstLoad = false;
    $('#liveDot').title = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    console.error(err);
    banner(`Could not refresh: ${err.message}`);
  }
}

function celebrate(fresh) {
  const pmap = M.playerMap(snap.players);
  for (const e of fresh.slice(0, 3)) {
    const p = pmap.get(e.player_id);
    const kind = SCORE_KINDS.find(k => k.id === e.kind);
    if (!p) continue;
    toast(`${kind ? kind.emoji + ' ' : ''}${M.displayName(p)} +${num(e.points)}`, 'good');
  }
  const row = $('#leaderboard');
  if (row) { row.classList.remove('bump'); void row.offsetWidth; row.classList.add('bump'); }
}

function banner(msg) {
  const host = $('#banners');
  clear(host);
  host.appendChild(el('div', { class: 'banner' }, [
    el('span', { text: msg }),
    el('span', { class: 'spacer' }),
    el('button', { class: 'btn btn-sm btn-ghost', onclick: () => location.reload() }, 'Reload'),
  ]));
}

/* ---------------------------------------------------------- */
/* Rendering                                                   */
/* ---------------------------------------------------------- */

function renderAll() {
  if (demoOn()) demoBanner();
  renderStats();
  renderLeaderboard();
  renderDuels();
  renderMatches();
  renderFeed();
  renderMomentum();
  renderPowerHours();
}

function demoBanner() {
  const host = $('#banners');
  if (host.dataset.demo === '1') return;
  host.dataset.demo = '1';
  clear(host);
  host.appendChild(el('div', { class: 'banner' }, [
    el('span', { html: '<b>Demo data.</b> Everything you see lives in this browser only. Connect Supabase to make it real and shared.' }),
    el('span', { class: 'spacer' }),
    el('a', { class: 'btn btn-sm btn-ghost', href: 'admin.html#settings' }, 'Connect'),
  ]));
}

function avatar(p, size = '') {
  return el('span', {
    class: `avatar ${size}`,
    style: { '--pc': M.colorOf(p) },
    text: p?.emoji || '🎧',
    'aria-hidden': 'true',
  });
}

function chip(p, size = '') {
  return el('span', { class: 'pchip' }, [
    avatar(p, size),
    el('span', { style: { minWidth: 0 } }, [
      el('div', { class: 'nm', text: M.displayName(p) }),
      p?.nickname ? el('div', { class: 'rl', text: p.name }) : null,
    ]),
  ]);
}

/* -- headline tiles -- */

function renderStats() {
  const h = M.headline(snap.players, snap.events, snap.duels, snap.matches);
  const host = $('#statRow');
  clear(host);

  const deltaNote = h.delta === null
    ? el('span', { text: 'first week on the board' })
    : el('span', {}, [
        el('span', { class: h.delta >= 0 ? 'up' : 'down', text: `${h.delta >= 0 ? '▲' : '▼'} ${Math.abs(h.delta)}%` }),
        document.createTextNode(' vs last week'),
      ]);

  host.append(
    tile('Points this week', num(h.thisWeek), deltaNote),
    tile('Scores logged', num(h.deals), el('span', { text: 'in the last 7 days' })),
    h.topPlayer
      ? tile('Top of the week', M.displayName(h.topPlayer.player),
          el('span', { text: `${num(h.topPlayer.points)} points` }), true)
      : tile('Top of the week', '—', el('span', { text: 'nothing logged yet' }), true),
    tile('Running now', `${h.liveDuels + h.liveMatches}`,
      el('span', { text: `${h.liveDuels} duel${h.liveDuels === 1 ? '' : 's'} · ${h.liveMatches} match${h.liveMatches === 1 ? '' : 'es'}` })),
  );
}

function tile(label, value, note, small = false) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'stat-label', text: label }),
    el('div', { class: `stat-value${small ? ' sm' : ''}`, text: value }),
    el('div', { class: 'stat-note' }, [note]),
  ]);
}

/* -- podium + leaderboard -- */

function renderLeaderboard() {
  const days = Number($('#lbRange').value);
  const rows = M.leaderboard(snap.players, snap.events, days);
  const podium = $('#podium');
  const host = $('#leaderboard');
  const tableHost = $('#lbTable');
  clear(podium); clear(host); clear(tableHost);

  if (!rows.length) {
    host.appendChild(emptyBox('Add teammates in the admin console and the board fills up.', 'No one on the roster yet'));
    return;
  }

  /* podium — only once there is something to celebrate */
  const top3 = rows.slice(0, 3).filter(r => r.points > 0);
  if (top3.length === 3) {
    const order = [top3[1], top3[0], top3[2]];
    podium.appendChild(el('div', { class: 'podium' }, order.map(r =>
      el('div', { class: 'podium-slot', 'data-rank': r.rank }, [
        r.rank === 1 ? el('div', { class: 'podium-crown', text: '👑' }) : null,
        avatar(r.player, 'lg'),
        el('div', { class: 'podium-name', text: M.displayName(r.player) }),
        el('div', { class: 'podium-score', text: `${num(r.points)} pts` }),
        el('div', { class: 'podium-block', text: `#${r.rank}` }),
      ]))));
  }

  const max = Math.max(...rows.map(r => r.points), 1);

  for (const r of rows) {
    const track = el('div', { class: 'lb-bar-track' }, [
      el('div', { class: 'lb-bar-fill', style: { width: `${(r.points / max) * 100}%` } }),
    ]);
    const spark = el('div', { class: 'lb-spark' });

    host.appendChild(el('div', { class: 'lb-row', 'data-rank': r.rank }, [
      el('div', { class: 'lb-rank', text: String(r.rank) }),
      chip(r.player),
      track,
      el('div', { class: 'lb-value' }, [
        document.createTextNode(num(r.points)),
        el('small', { text: 'pts' }),
      ]),
      spark,
    ]));

    sparkline(spark, r.spark, {
      color: M.colorOf(r.player),
      labels: last14Labels(),
      unit: 'points',
      ariaLabel: `${M.displayName(r.player)} last 14 days`,
    });
  }

  tableHost.appendChild(tableView(
    ['#', 'Teammate', 'Points', 'Scores'],
    rows.map(r => [r.rank, M.displayName(r.player), num(r.points), num(r.deals)]),
    [true, false, true, true],
  ));
}

function last14Labels() {
  const out = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  }
  return out;
}

/* -- duels -- */

function renderDuels() {
  const pmap = M.playerMap(snap.players);
  const host = $('#duels');
  clear(host);

  const live = snap.duels.filter(d => d.status === 'live');
  const rest = snap.duels.filter(d => d.status !== 'live').slice(0, 3);
  const list = [...live, ...rest];

  $('#duelCount').textContent = `${live.length} live`;

  if (!list.length) {
    host.appendChild(emptyBox('Pick two teammates in the admin console and start one.', 'No duels yet'));
    return;
  }

  for (const d of list) {
    const a = pmap.get(d.player_a);
    const b = pmap.get(d.player_b);
    if (!a || !b) continue;
    const s = M.duelState(d);

    host.appendChild(el('div', { class: `duel${s.targetHit && d.status === 'live' ? ' hot' : ''}` }, [
      el('div', { class: 'duel-head' }, [
        el('span', { class: 'duel-title', text: d.title || `${M.displayName(a)} vs ${M.displayName(b)}` }),
        el('span', { class: 'spacer' }),
        el('span', { class: `tag ${d.status}`, text: d.status === 'live' ? 'live' : d.status }),
      ]),

      el('div', { class: 'duel-sides' }, [
        el('div', { class: `duel-side a${s.leader === 'a' ? ' lead' : ''}` }, [
          avatar(a),
          el('div', { class: 'who' }, [
            el('div', { class: 'nm', text: M.displayName(a) }),
            el('div', { class: 'sc', text: num(s.a) }),
          ]),
        ]),
        el('span', { class: 'duel-vs', text: 'VS' }),
        el('div', { class: `duel-side b${s.leader === 'b' ? ' lead' : ''}` }, [
          avatar(b),
          el('div', { class: 'who' }, [
            el('div', { class: 'nm', text: M.displayName(b) }),
            el('div', { class: 'sc', text: num(s.b) }),
          ]),
        ]),
      ]),

      el('div', { class: 'tug', role: 'img',
        'aria-label': `${M.displayName(a)} ${num(s.a)}, ${M.displayName(b)} ${num(s.b)}` }, [
        el('div', { class: 'tug-a', style: { width: `${s.pctA}%` } }),
        el('div', { class: 'tug-b', style: { width: `${s.pctB}%` } }),
      ]),

      el('div', { class: 'duel-foot' }, [
        el('span', { text: d.metric || 'Points' }),
        d.target ? el('span', { text: `· first to ${num(d.target)}` }) : null,
        el('span', { class: 'spacer' }),
        d.stake ? el('span', { class: 'duel-stake', html: `🏆 <b>${esc(d.stake)}</b>` }) : null,
        d.status === 'live' && d.ends_at ? el('span', { text: countdown(d.ends_at) }) : null,
      ]),
    ]));
  }
}

/* -- matches -- */

function renderMatches() {
  const pmap = M.playerMap(snap.players);
  const host = $('#matches');
  clear(host);

  const list = [...snap.matches].sort((a, b) =>
    (a.status === 'live' ? 0 : 1) - (b.status === 'live' ? 0 : 1));

  if (!list.length) {
    host.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'card-body', style: { paddingTop: '20px' } }, [
        emptyBox('A match is a scoreboard the whole floor shares — a sprint, a month, a campaign.', 'No matches yet'),
      ]),
    ]));
    return;
  }

  for (const m of list) {
    const rows = M.matchStandings(m, snap.entries, pmap);
    const total = rows.reduce((a, r) => a + r.score, 0);
    const max = Math.max(...rows.map(r => r.score), 1);
    const pct = m.target ? Math.min(100, (total / Number(m.target)) * 100) : null;

    host.appendChild(el('section', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h3', { text: m.title }),
        el('span', { class: 'spacer' }),
        el('span', { class: `tag ${m.status}`, text: m.status }),
      ]),
      el('div', { class: 'card-body' }, [
        el('div', { class: 'match' }, [
          m.description ? el('div', { style: { fontSize: '13px', color: 'var(--text-secondary)' }, text: m.description }) : null,

          pct !== null ? el('div', {}, [
            el('div', { style: { display: 'flex', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' } }, [
              el('span', { text: `Team total ${num(total)} / ${num(m.target)}` }),
              el('span', { class: 'spacer', style: { flex: 1 } }),
              el('span', { text: m.ends_at ? countdown(m.ends_at) : '' }),
            ]),
            el('div', { class: 'match-progress', role: 'img', 'aria-label': `${Math.round(pct)}% of target` }, [
              el('i', { style: { width: `${pct}%` } }),
            ]),
          ]) : null,

          rows.length
            ? el('div', {}, rows.map(r => el('div', { class: 'mrow', 'data-rank': r.rank }, [
                el('span', { class: 'idx', text: String(r.rank) }),
                avatar(r.player, 'sm'),
                el('div', {}, [
                  el('div', { style: { fontSize: '13px', fontWeight: '620', marginBottom: '4px' }, text: M.displayName(r.player) }),
                  el('div', { class: 'track' }, [
                    el('div', { class: 'fill', style: { width: `${(r.score / max) * 100}%` } }),
                  ]),
                ]),
                el('span', { class: 'val', text: num(r.score) }),
              ])))
            : emptyBox('No one has been added to this match yet.'),

          rows.length ? tableView(
            ['#', 'Teammate', m.metric || 'Score'],
            rows.map(r => [r.rank, M.displayName(r.player), num(r.score)]),
            [true, false, true],
          ) : null,
        ]),
      ]),
    ]));
  }
}

/* -- feed -- */

function renderFeed() {
  const pmap = M.playerMap(snap.players);
  const host = $('#feed');
  clear(host);

  const list = snap.events.slice(0, 40);
  if (!list.length) {
    host.appendChild(emptyBox('Log a score in the admin console and it shows up here instantly.', 'Quiet so far'));
    return;
  }

  for (const e of list) {
    const p = pmap.get(e.player_id);
    if (!p) continue;
    const kind = SCORE_KINDS.find(k => k.id === e.kind);
    const pts = Number(e.points || 0);

    host.appendChild(el('div', { class: 'feed-item' }, [
      avatar(p, 'sm'),
      el('div', { class: 'txt' }, [
        el('div', { html: `<b>${esc(M.displayName(p))}</b> <span class="why">${esc(e.note || (kind ? kind.label.toLowerCase() : e.kind || 'scored'))}</span>` }),
      ]),
      el('span', { class: `pts${pts < 0 ? ' neg' : ''}`, text: `${pts >= 0 ? '+' : ''}${num(pts)}` }),
      el('span', { class: 'when', text: relTime(e.occurred_at) }),
    ]));
  }
}

/* -- charts -- */

function renderMomentum() {
  const days = Number($('#momRange').value);
  const { labels, values } = M.dailySeries(snap.events, days);
  lineChart($('#momentum'), { labels, values, unit: 'points', height: 220 });
}

function renderPowerHours() {
  const grid = M.powerHours(snap.events, 60);
  heatmap($('#powerHours'), { ...grid, unit: 'points' });

  const host = $('#powerStats');
  clear(host);
  const ins = M.powerInsights(grid);
  if (!ins.best) {
    host.appendChild(el('div', { class: 'stat' }, [
      el('div', { class: 'stat-label', text: 'Reading the grid' }),
      el('div', { class: 'stat-note', text: 'Log a few days of scores and the pattern shows up here.' }),
    ]));
    return;
  }
  host.append(
    tile('Hottest slot', `${ins.best.day} ${ins.best.block}`,
      el('span', { text: `${num(ins.best.value)} points booked here` }), true),
    tile('Best day', ins.bestDay.day,
      el('span', { text: `${num(ins.bestDay.total)} points over 60 days` }), true),
    ins.quietDay
      ? tile('Slowest day', ins.quietDay.day,
          el('span', { text: `${num(ins.quietDay.total)} points \u2014 worth a push` }), true)
      : tile('Busiest block', ins.bestBlock.block,
          el('span', { text: `${num(ins.bestBlock.total)} points across the week` }), true),
  );
}
