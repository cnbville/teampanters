# Sales Arena

A small, good-looking scoreboard for a mixed sales / IT floor at an ISP.
It's built around **duels** — put two teammates head to head (1v1) or two pairs
against each other (2v2), with something at stake. Add a team-wide **match** and
one-tap score logging on top. The Arena page is built to live fullscreen on a
screen in the room.

- **`index.html`** — the Arena. Read-only. Live duels front and centre, then the
  leaderboard (with each player's duel record), team momentum, matches, power
  hours, and a running feed. Press **T** for fullscreen wallboard mode; it
  refreshes itself every 30s.
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

The workflow in `.github/workflows/pages.yml` deploys the `main` branch on every
push. Two one-time settings (both need a repo admin — the workflow token can't
set them itself):

1. **Settings → General → Default branch:** set it to **`main`**. The
   `github-pages` environment only lets the default branch deploy, so this has
   to be `main` for the deploy to be allowed.
2. **Settings → Pages → Build and deployment → Source:** **GitHub Actions**.

Then push to `main` (or re-run the last job from the **Actions** tab). The site
lands at `https://<your-user>.github.io/<repo>/` — for this repo,
`https://cnbville.github.io/teampanters/`.

If a run failed before you set those, that's expected — it can't create the
Pages site on its own. Re-run it once both are set.

---

## Day to day

**Running a duel.** The duel is the centrepiece — it's the first tab in the
console and the hero of the Arena. Admin → Duels → *New duel*, pick the format:

- **1v1** — one person vs. another.
- **2v2** — two pairs. Each side has a captain and a partner; the side shares
  one score, and both partners get the win or loss on their record.

Then set what counts ("Fiber deals"), optionally a number to race to, and
something at stake. The stake is the part that makes people care — "losing pair
runs the coffee for a week" beats "recognition". Bump each side's score with
`+` / `−` as it lands; hit **Finish** and the result is settled.

Every finished duel feeds each player's **W–L record**, shown on the leaderboard
and summed into the "Top duelist" tile at the top of the Arena.

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
