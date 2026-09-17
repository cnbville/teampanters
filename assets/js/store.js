/* ===========================================================
   Data layer.

   Two interchangeable backends behind one interface:
     • SupabaseStore — the real thing (see supabase/schema.sql)
     • DemoStore     — localStorage, so the page is alive before
                       Supabase is wired up. Never shared.
   =========================================================== */

import { readConfig, isConfigured, demoOn, setDemo } from './config.js';
import { uid, daysAgo, dayKey } from './util.js';

const SB_CDN = 'https://esm.sh/@supabase/supabase-js@2.45.4';

/* ---------------------------------------------------------- */
/* Supabase                                                    */
/* ---------------------------------------------------------- */

class SupabaseStore {
  constructor(client) {
    this.mode = 'supabase';
    this.sb = client;
    this._user = null;
  }

  static async create() {
    const { url, anonKey } = readConfig();
    const { createClient } = await import(/* @vite-ignore */ SB_CDN);
    const client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'panters.auth' },
    });
    const store = new SupabaseStore(client);
    const { data } = await client.auth.getSession();
    store._user = data?.session?.user ?? null;
    client.auth.onAuthStateChange((_e, session) => { store._user = session?.user ?? null; });
    return store;
  }

  /* -- auth -- */
  user() { return this._user; }
  async signIn(email, password) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    this._user = data.user;
    return data.user;
  }
  async signOut() { await this.sb.auth.signOut(); this._user = null; }

  /* -- reads -- */
  async loadAll() {
    const [players, duels, matches, entries, events] = await Promise.all([
      this._all('players',        q => q.order('created_at', { ascending: true })),
      this._all('duels',          q => q.order('created_at', { ascending: false })),
      this._all('matches',        q => q.order('created_at', { ascending: false })),
      this._all('match_entries',  q => q),
      this._all('score_events',   q => q.gte('occurred_at', daysAgo(365).toISOString())
                                        .order('occurred_at', { ascending: false })
                                        .limit(5000)),
    ]);
    return { players, duels, matches, entries, events };
  }

  async _all(table, shape) {
    const { data, error } = await shape(this.sb.from(table).select('*'));
    if (error) throw new Error(`${table}: ${error.message}`);
    return data || [];
  }

  /* -- writes -- */
  async insert(table, row) {
    const { data, error } = await this.sb.from(table).insert(row).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  async update(table, id, patch) {
    const { data, error } = await this.sb.from(table).update(patch).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  async remove(table, id) {
    const { error } = await this.sb.from(table).delete().eq('id', id);
    if (error) throw new Error(error.message);
  }
  async upsertEntry(row) {
    const { data, error } = await this.sb.from('match_entries')
      .upsert(row, { onConflict: 'match_id,player_id' }).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  async removeEntry(matchId, playerId) {
    const { error } = await this.sb.from('match_entries')
      .delete().eq('match_id', matchId).eq('player_id', playerId);
    if (error) throw new Error(error.message);
  }

  /* -- live -- */
  subscribe(onChange) {
    const ch = this.sb.channel('arena')
      .on('postgres_changes', { event: '*', schema: 'public' }, onChange)
      .subscribe();
    return () => this.sb.removeChannel(ch);
  }
}

/* ---------------------------------------------------------- */
/* Demo (localStorage)                                         */
/* ---------------------------------------------------------- */

const DEMO_DATA = 'panters.demo.data';

class DemoStore {
  constructor() {
    this.mode = 'demo';
    this._user = JSON.parse(sessionStorage.getItem('panters.demo.user') || 'null');
    if (!localStorage.getItem(DEMO_DATA)) this._write(seed());
  }

  _read() {
    try { return JSON.parse(localStorage.getItem(DEMO_DATA)) || seed(); }
    catch { return seed(); }
  }
  _write(db) { localStorage.setItem(DEMO_DATA, JSON.stringify(db)); }

  user() { return this._user; }
  async signIn(email) {
    this._user = { email: email || 'demo@local', id: 'demo' };
    sessionStorage.setItem('panters.demo.user', JSON.stringify(this._user));
    return this._user;
  }
  async signOut() { this._user = null; sessionStorage.removeItem('panters.demo.user'); }

  async loadAll() {
    const db = this._read();
    return {
      players: db.players,
      duels:   [...db.duels].reverse(),
      matches: [...db.matches].reverse(),
      entries: db.entries,
      events:  [...db.events].sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at)),
    };
  }

  async insert(table, row) {
    const db = this._read();
    const rec = { id: uid(), created_at: new Date().toISOString(), ...row };
    db[key(table)].push(rec);
    this._write(db);
    return rec;
  }
  async update(table, id, patch) {
    const db = this._read();
    const list = db[key(table)];
    const i = list.findIndex(r => r.id === id);
    if (i < 0) throw new Error('not found');
    list[i] = { ...list[i], ...patch };
    this._write(db);
    return list[i];
  }
  async remove(table, id) {
    const db = this._read();
    const k = key(table);
    db[k] = db[k].filter(r => r.id !== id);
    if (k === 'players') {
      db.duels = db.duels.filter(d => d.player_a !== id && d.player_b !== id);
      db.entries = db.entries.filter(e => e.player_id !== id);
      db.events = db.events.filter(e => e.player_id !== id);
    }
    if (k === 'matches') db.entries = db.entries.filter(e => e.match_id !== id);
    this._write(db);
  }
  async upsertEntry(row) {
    const db = this._read();
    const i = db.entries.findIndex(e => e.match_id === row.match_id && e.player_id === row.player_id);
    if (i >= 0) { db.entries[i] = { ...db.entries[i], ...row }; this._write(db); return db.entries[i]; }
    const rec = { id: uid(), ...row };
    db.entries.push(rec);
    this._write(db);
    return rec;
  }
  async removeEntry(matchId, playerId) {
    const db = this._read();
    db.entries = db.entries.filter(e => !(e.match_id === matchId && e.player_id === playerId));
    this._write(db);
  }

  subscribe() { return () => {}; }
}

function key(table) {
  return table === 'match_entries' ? 'entries'
       : table === 'score_events'  ? 'events'
       : table;
}

/* ---------------------------------------------------------- */
/* Seed data for demo mode                                     */
/* ---------------------------------------------------------- */

function seed() {
  const P = (name, nickname, emoji, color, role) => ({
    id: uid(), name, nickname, emoji, color, role, active: true,
    created_at: new Date().toISOString(),
  });

  const players = [
    P('Sanne de Vries',  'The Closer',  '🦊', 'var(--series-1)', 'Sales'),
    P('Youssef El Amrani','Fiber King', '🦁', 'var(--series-2)', 'Sales'),
    P('Marit Jansen',    'Ice Cold',    '🐧', 'var(--series-3)', 'Hybrid'),
    P('Daan Bakker',     'Packet Loss', '🦉', 'var(--series-4)', 'IT'),
    P('Iris Koster',     'Uptime',      '🦋', 'var(--series-5)', 'IT'),
    P('Tim Verhoeven',   'Rookie',      '🐺', 'var(--series-7)', 'Sales'),
  ];

  const kinds = [
    { kind: 'sale', points: 10 }, { kind: 'upsell', points: 15 },
    { kind: 'fiber', points: 25 }, { kind: 'save', points: 12 },
    { kind: 'assist', points: 5 },
  ];

  const events = [];
  for (let d = 27; d >= 0; d--) {
    const day = daysAgo(d);
    for (const p of players) {
      const n = Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const k = kinds[Math.floor(Math.random() * kinds.length)];
        const when = new Date(day);
        when.setHours(9 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60));
        events.push({
          id: uid(), player_id: p.id, points: k.points, kind: k.kind,
          note: '', occurred_at: when.toISOString(), created_at: when.toISOString(),
        });
      }
    }
  }

  const iso = d => d.toISOString();
  const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

  const duels = [
    { id: uid(), title: 'Fiber Friday', player_a: players[0].id, player_b: players[1].id,
      metric: 'Fiber deals', target: 12, score_a: 8, score_b: 7, status: 'live',
      stake: 'Loser buys the Friday round', starts_at: iso(daysAgo(2)), ends_at: inDays(2),
      created_at: iso(daysAgo(2)) },
    { id: uid(), title: 'Helpdesk Heroes', player_a: players[3].id, player_b: players[4].id,
      metric: 'Tickets closed', target: 40, score_a: 31, score_b: 35, status: 'live',
      stake: 'Winner picks the playlist', starts_at: iso(daysAgo(4)), ends_at: inDays(1),
      created_at: iso(daysAgo(4)) },
    { id: uid(), title: 'Rookie Run', player_a: players[5].id, player_b: players[2].id,
      metric: 'Upsells', target: 10, score_a: 10, score_b: 6, status: 'finished',
      stake: 'Bragging rights', starts_at: iso(daysAgo(12)), ends_at: iso(daysAgo(5)),
      created_at: iso(daysAgo(12)) },
  ];

  const m1 = { id: uid(), title: 'September Sprint', description: 'Every new connection counts double in week 4.',
    metric: 'Points', target: 600, status: 'live', starts_at: iso(daysAgo(16)), ends_at: inDays(6),
    created_at: iso(daysAgo(16)) };

  const entries = players.map((p, i) => ({
    id: uid(), match_id: m1.id, player_id: p.id,
    score: [128, 112, 96, 74, 61, 43][i],
  }));

  return { players, duels, matches: [m1], entries, events };
}

/* ---------------------------------------------------------- */

export async function makeStore() {
  if (isConfigured() && !demoOn()) {
    try {
      return await SupabaseStore.create();
    } catch (err) {
      console.error('Supabase init failed', err);
      throw err;
    }
  }
  if (demoOn()) return new DemoStore();
  return null;               // not configured yet — caller shows setup
}

export function startDemo() { setDemo(true); }
export { DemoStore };
