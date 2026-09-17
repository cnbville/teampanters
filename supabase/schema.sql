-- ===========================================================
-- Sales Arena — Supabase schema
--
-- Run this once in the Supabase SQL editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run).
--
-- Security model:
--   • anyone with the anon key can READ  (the floor sees the board)
--   • only a signed-in user can WRITE    (that's you, the admin)
-- Row Level Security enforces this in the database, which is what
-- makes it safe to ship the anon key in a public repo.
-- ===========================================================

create extension if not exists "pgcrypto";

-- ---------- tables ----------

create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  nickname    text,
  emoji       text default '🎧',
  color       text default 'var(--series-1)',
  role        text default 'Sales',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.score_events (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.players(id) on delete cascade,
  points      numeric not null default 0,
  kind        text default 'sale',
  note        text,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create table if not exists public.duels (
  id          uuid primary key default gen_random_uuid(),
  title       text,
  player_a    uuid not null references public.players(id) on delete cascade,
  player_b    uuid not null references public.players(id) on delete cascade,
  metric      text default 'Sales',
  target      numeric,
  score_a     numeric not null default 0,
  score_b     numeric not null default 0,
  status      text not null default 'live',
  stake       text,
  winner      uuid references public.players(id) on delete set null,
  starts_at   timestamptz default now(),
  ends_at     timestamptz,
  created_at  timestamptz not null default now(),
  constraint duels_status_check    check (status in ('scheduled','live','finished')),
  constraint duels_distinct_check  check (player_a <> player_b)
);

create table if not exists public.matches (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  metric      text default 'Points',
  target      numeric,
  status      text not null default 'live',
  starts_at   timestamptz default now(),
  ends_at     timestamptz,
  created_at  timestamptz not null default now(),
  constraint matches_status_check check (status in ('scheduled','live','finished'))
);

create table if not exists public.match_entries (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches(id) on delete cascade,
  player_id  uuid not null references public.players(id) on delete cascade,
  score      numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

-- ---------- indexes ----------

create index if not exists score_events_occurred_idx on public.score_events (occurred_at desc);
create index if not exists score_events_player_idx   on public.score_events (player_id);
create index if not exists match_entries_match_idx    on public.match_entries (match_id);
create index if not exists duels_status_idx           on public.duels (status);

-- ---------- row level security ----------

alter table public.players       enable row level security;
alter table public.score_events  enable row level security;
alter table public.duels         enable row level security;
alter table public.matches       enable row level security;
alter table public.match_entries enable row level security;

do $$
declare t text;
begin
  foreach t in array array['players','score_events','duels','matches','match_entries'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read',  t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);

    -- everyone (including the anon key) may read
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      t || '_read', t);

    -- only signed-in users may insert / update / delete
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_write', t);
  end loop;
end $$;

-- ---------- realtime (optional but nice: the board updates instantly) ----------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.players;       exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.score_events;  exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.duels;         exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.matches;       exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.match_entries; exception when duplicate_object then null; end;
  end if;
end $$;

-- ===========================================================
-- Optional: a starter roster. Delete the block or edit the names.
-- ===========================================================

-- insert into public.players (name, nickname, emoji, color, role) values
--   ('Sanne de Vries',   'The Closer',  '🦊', 'var(--series-1)', 'Sales'),
--   ('Youssef El Amrani','Fiber King',  '🦁', 'var(--series-2)', 'Sales'),
--   ('Marit Jansen',     'Ice Cold',    '🐧', 'var(--series-3)', 'Hybrid'),
--   ('Daan Bakker',      'Packet Loss', '🦉', 'var(--series-4)', 'IT');
