# Sales Arena

A small, good-looking scoreboard for a mixed sales / IT floor at an ISP.
Add your teammates, put two of them in a **duel**, run a **match** the whole
team plays, and log scores in one tap. The Arena page is built to live
fullscreen on a screen in the room.

- **`index.html`** — the Arena. Read-only. Leaderboard, live duels, match
  standings, team momentum, power hours, and a running feed of every score.
  Press **T** for fullscreen wallboard mode; it refreshes itself every 30s.
- **`admin.html`** — your console. Roster, duels, matches, and a one-tap
  score grid. Sign-in required.

No build step, no framework, no npm install. It is static files plus Supabase.

---

## Setup, start to finish

### 1. Create a Supabase project

<https://supabase.com> → **New project**. The free tier is more than enough.

### 2. Create the tables

Dashboard → **SQL Editor** → **New query** → paste all of
[`supabase/schema.sql`](supabase/schema.sql) → **Run**.

That creates five tables and switches on Row Level Security with two rules:

| Who | Can do |
|---|---|
| anyone with the anon key | read everything |
| signed-in users | read and write everything |

### 3. Create your admin user

Dashboard → **Authentication** → **Users** → **Add user** → *Create new user*.
Give it your email and a password, and tick **Auto Confirm User**. That is the
login for `admin.html`.

Only make accounts for people who should be able to change the board. Everyone
else just opens the Arena — no login needed.

### 4. Point the app at your project

Dashboard → **Settings** → **API**. Copy the **Project URL** and the
**anon / public** key into `assets/js/config.js`:

```js
export const BUILTIN = {
  url:     'https://xxxxxxxxxxxx.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...',
};
```

Commit and push. Everyone on the team now gets a working page with nothing
to type.

> **Is it safe to commit the anon key?** Yes — that is what it is for. It is a
> public identifier, not a secret, and Row Level Security is what actually
> guards the data. Never commit the **service_role** key.

If you would rather not put it in the repo, leave the placeholders: the app
shows a one-time setup screen and remembers the values in that browser.

### 5. Make it yours

Also in `assets/js/config.js`:

```js
export const BRAND = { team: 'Team Panters', arena: 'Sales Arena', mark: '⚡' };

export const SCORE_KINDS = [
  { id: 'sale',   label: 'Sale',   points: 10, emoji: '💰' },
  { id: 'fiber',  label: 'Fiber',  points: 25, emoji: '🌐' },
  // ...what your floor actually sells, and what it is worth
];
```

The first three kinds get the prominent buttons in the admin score grid, so put
the things you log most at the top.

---

## Publishing to GitHub Pages

The workflow in `.github/workflows/pages.yml` deploys on every push. Turn Pages
on once:

**Settings → Pages → Build and deployment → Source: _GitHub Actions_**

Then push. The site lands at
`https://<your-user>.github.io/<repo>/`.

If Pages is already on and the run failed, re-run it from the **Actions** tab —
the first run needs the Pages source set before it can deploy.

---

## Day to day

**Running a duel.** Admin → Duels → *New duel*. Two people, what counts
("Fiber deals"), optionally a number to race to, and something at stake. The
stake is the part that makes people care — "loser buys the Friday round" beats
"recognition". Bump scores with `+` / `−` as they land; hit **Finish** and the
winner is recorded from the score.

**Running a match.** A match is one board the whole floor shares — a monthly
sprint, a campaign. Add people to it, set a team target, and the Arena shows
both the individual standings and the progress bar toward the target.

**Points vs. duel scores.** Two separate things, on purpose:

- **Score events** (the one-tap grid) feed the leaderboard, momentum, power
  hours and the feed. This is the running total of the whole team.
- **Duel and match scores** are their own counters, so a duel can be about
  anything — tickets closed, doors knocked — without polluting the leaderboard.

**Benching someone.** Roster → *Bench*. They come off the board and out of the
dropdowns but keep their history. Deleting removes their scores too.

---

## How it is built

| File | What it does |
|---|---|
| `assets/js/config.js` | connection details, branding, score kinds |
| `assets/js/store.js` | data layer — Supabase, plus a localStorage demo backend |
| `assets/js/model.js` | pure functions: leaderboard, series, standings |
| `assets/js/charts.js` | hand-rolled SVG charts with hover + table fallbacks |
| `assets/js/arena.js` | the Arena page |
| `assets/js/admin.js` | the admin console |
| `assets/css/app.css` | design tokens and every component |

Charts are plain SVG rather than a library: no dependency, no bundle, and the
whole site is six small files a browser can read directly.

Colours come from a validated palette — checked for colour-blind separation and
contrast against both the light and dark surfaces. If you re-theme it, change
the tokens at the top of `app.css` rather than individual rules. Data marks use
one hue per measure; rank never changes a bar's colour, so filtering the board
does not repaint it.

## Demo mode

Not ready to set up Supabase? The setup screen has **Look around with demo
data** — a sample team with a month of history, stored only in your browser.
Admin → Settings → *Connect Supabase* switches over when you are ready.
