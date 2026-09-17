/* Derived numbers. Pure functions over a snapshot — no DOM, no I/O. */

import { dayKey, daysAgo, shortDate, autoColor } from './util.js';

export function playerMap(players) {
  const m = new Map();
  for (const p of players) m.set(p.id, p);
  return m;
}

export function colorOf(p) {
  if (!p) return 'var(--text-muted)';
  return p.color && p.color !== '' ? p.color : autoColor(p.id);
}

export function displayName(p) {
  if (!p) return 'Unknown';
  return p.nickname ? p.nickname : p.name;
}

/* Events inside a window, newest first. days = 9999 means all time. */
export function eventsWithin(events, days) {
  if (!days || days >= 9999) return events;
  const from = daysAgo(days - 1).getTime();
  return events.filter(e => new Date(e.occurred_at).getTime() >= from);
}

/* Leaderboard rows: one measure (points), ranked. Duels (optional) attach a
   win/loss record to each row. */
export function leaderboard(players, events, days, duels = []) {
  const win = eventsWithin(events, days);
  const totals = new Map();
  const counts = new Map();
  for (const e of win) {
    totals.set(e.player_id, (totals.get(e.player_id) || 0) + Number(e.points || 0));
    counts.set(e.player_id, (counts.get(e.player_id) || 0) + 1);
  }
  const records = duelRecords(duels, players);
  return players
    .filter(p => p.active !== false)
    .map(p => ({
      player: p,
      points: totals.get(p.id) || 0,
      deals: counts.get(p.id) || 0,
      record: records.get(p.id) || { wins: 0, losses: 0, played: 0 },
      spark: dailyFor(win, p.id, 14),
    }))
    .sort((a, b) => b.points - a.points || b.deals - a.deals || a.player.name.localeCompare(b.player.name))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/* Per-day totals for one player over the last n days. */
export function dailyFor(events, playerId, n) {
  const buckets = new Map();
  for (let i = n - 1; i >= 0; i--) buckets.set(dayKey(daysAgo(i)), 0);
  for (const e of events) {
    if (playerId && e.player_id !== playerId) continue;
    const k = dayKey(e.occurred_at);
    if (buckets.has(k)) buckets.set(k, buckets.get(k) + Number(e.points || 0));
  }
  return [...buckets.values()];
}

/* Team totals per day, with axis labels. */
export function dailySeries(events, n) {
  const keys = [];
  for (let i = n - 1; i >= 0; i--) keys.push(daysAgo(i));
  const buckets = new Map(keys.map(d => [dayKey(d), 0]));
  for (const e of events) {
    const k = dayKey(e.occurred_at);
    if (buckets.has(k)) buckets.set(k, buckets.get(k) + Number(e.points || 0));
  }
  return {
    labels: keys.map(d => shortDate(d)),
    values: keys.map(d => buckets.get(dayKey(d))),
  };
}

/* Weekday x hour-block matrix of points. */
const HOUR_BLOCKS = [
  { label: '8-10', from: 8,  to: 10 },
  { label: '10-12', from: 10, to: 12 },
  { label: '12-14', from: 12, to: 14 },
  { label: '14-16', from: 14, to: 16 },
  { label: '16-18', from: 16, to: 18 },
  { label: '18-20', from: 18, to: 20 },
];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function powerHours(events, days = 30) {
  const win = eventsWithin(events, days);
  const matrix = WEEKDAYS.map(() => HOUR_BLOCKS.map(() => 0));
  for (const e of win) {
    const d = new Date(e.occurred_at);
    if (Number.isNaN(d.getTime())) continue;
    const row = (d.getDay() + 6) % 7;                 // Mon = 0
    const col = HOUR_BLOCKS.findIndex(b => d.getHours() >= b.from && d.getHours() < b.to);
    if (col < 0) continue;
    matrix[row][col] += Number(e.points || 0);
  }
  return { rows: WEEKDAYS, cols: HOUR_BLOCKS.map(b => b.label), matrix };
}

/* Headline tiles. */
export function headline(players, events, duels, matches) {
  const week = eventsWithin(events, 7);
  const prev = events.filter(e => {
    const t = new Date(e.occurred_at).getTime();
    return t >= daysAgo(13).getTime() && t < daysAgo(6).getTime();
  });
  const sum = list => list.reduce((a, e) => a + Number(e.points || 0), 0);
  const thisWeek = sum(week);
  const lastWeek = sum(prev);
  const delta = lastWeek === 0 ? null : Math.round(((thisWeek - lastWeek) / lastWeek) * 100);

  const board = leaderboard(players, events, 7);
  return {
    thisWeek,
    delta,
    deals: week.length,
    topPlayer: board[0] && board[0].points > 0 ? board[0] : null,
    topDuelist: topDuelist(duels, players),
    liveDuels: duels.filter(d => d.status === 'live').length,
    liveMatches: matches.filter(m => m.status === 'live').length,
    finishedDuels: duels.filter(d => d.status === 'finished').length,
    roster: players.filter(p => p.active !== false).length,
  };
}

/* A duel's standing. */
export function duelState(d) {
  const a = Number(d.score_a || 0);
  const b = Number(d.score_b || 0);
  const total = a + b;
  const pctA = total === 0 ? 50 : (a / total) * 100;
  return {
    a, b, total,
    pctA, pctB: 100 - pctA,
    leader: a === b ? null : (a > b ? 'a' : 'b'),
    targetHit: d.target ? Math.max(a, b) >= Number(d.target) : false,
  };
}

/* ---- 1v1 / 2v2 helpers ---- */

/* The players on one side of a duel, captain first, partner (if any) second. */
export function duelTeam(d, side, pmap) {
  const ids = side === 'a' ? [d.player_a, d.player_a2] : [d.player_b, d.player_b2];
  return ids.filter(Boolean).map(id => pmap.get(id)).filter(Boolean);
}

export function is2v2(d) {
  return Boolean(d.player_a2 || d.player_b2);
}

export function duelFormat(d) {
  return is2v2(d) ? '2v2' : '1v1';
}

/* "Sanne & Youssef" for a pair, or the single name. */
export function duelTeamName(d, side, pmap) {
  const team = duelTeam(d, side, pmap);
  if (!team.length) return side === 'a' ? 'Side A' : 'Side B';
  return team.map(displayName).join(' & ');
}

export function duelTitle(d, pmap) {
  return d.title || `${duelTeamName(d, 'a', pmap)} vs ${duelTeamName(d, 'b', pmap)}`;
}

/* Win/loss record per player across FINISHED duels (draws ignored). Works for
   both 1v1 and 2v2 — every player on the winning side gets the win. */
export function duelRecords(duels, players) {
  const rec = new Map(players.map(p => [p.id, { wins: 0, losses: 0, played: 0 }]));
  const bump = (id, key) => { const r = rec.get(id); if (r) { r[key]++; r.played++; } };
  for (const d of duels) {
    if (d.status !== 'finished') continue;
    const a = Number(d.score_a || 0);
    const b = Number(d.score_b || 0);
    if (a === b) continue;
    const aWon = a > b;
    for (const id of [d.player_a, d.player_a2].filter(Boolean)) bump(id, aWon ? 'wins' : 'losses');
    for (const id of [d.player_b, d.player_b2].filter(Boolean)) bump(id, aWon ? 'losses' : 'wins');
  }
  return rec;
}

/* The player with the most duel wins (needs at least one). */
export function topDuelist(duels, players) {
  const rec = duelRecords(duels, players);
  let best = null;
  for (const p of players.filter(x => x.active !== false)) {
    const r = rec.get(p.id);
    if (r && r.wins > 0 && (!best || r.wins > best.wins || (r.wins === best.wins && r.losses < best.losses))) {
      best = { player: p, ...r };
    }
  }
  return best;
}

/* Match standings, ranked. */
export function matchStandings(match, entries, pmap) {
  return entries
    .filter(e => e.match_id === match.id)
    .map(e => ({ entry: e, player: pmap.get(e.player_id), score: Number(e.score || 0) }))
    .filter(r => r.player)
    .sort((a, b) => b.score - a.score || a.player.name.localeCompare(b.player.name))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/* Plain-language readings of the power-hours grid. */
export function powerInsights(grid) {
  const { rows, cols, matrix } = grid;
  let best = null;
  const byDay = rows.map((r, i) => ({ day: r, total: matrix[i].reduce((a, b) => a + b, 0) }));
  const byBlock = cols.map((c, j) => ({ block: c, total: rows.reduce((a, _, i) => a + matrix[i][j], 0) }));

  rows.forEach((r, i) => cols.forEach((c, j) => {
    const v = matrix[i][j];
    if (v > 0 && (!best || v > best.value)) best = { day: r, block: c, value: v };
  }));

  const liveDays = byDay.filter(d => d.total > 0);
  return {
    best,
    bestDay:   [...byDay].sort((a, b) => b.total - a.total)[0],
    bestBlock: [...byBlock].sort((a, b) => b.total - a.total)[0],
    quietDay:  liveDays.length > 1 ? [...liveDays].sort((a, b) => a.total - b.total)[0] : null,
    total: byDay.reduce((a, d) => a + d.total, 0),
  };
}
