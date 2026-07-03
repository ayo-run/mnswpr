# Firebase & Leaderboards

How the mnswpr.com leaderboards are stored, how to deploy the schema, and what
still has to be touched in the Firebase Console.

## Overview

Leaderboards are powered by Firestore (`firebase/firestore/lite`) through the
reusable, game-agnostic [`@cozy-games/leaderboard`](../leaderboard/leader-board.js)
package. The app wires minesweeper's specifics (finish-time as the `score`,
ascending sort, time formatting) in [`app/main.js`](../app/main.js).

The board offers four time windows — **Today** (default), **Week**, **Month**,
**All Time** — selected by tabs. Each played game that qualifies is written to a
new, queryable collection; the four tabs are just different filters over it.

### Data model

Collections (all under namespace `mw`):

| Path | Purpose | Access |
| --- | --- | --- |
| `mw-scores/{level}/games/{id}` | Ranked entries for the live boards | public read, validated create-only |
| `mw-all/{browserId}/games/{session}` | Per-browser archive of every game | read/write |
| `mw-config/configuration` | Server config (`passingStatus`, `message`) | public read, no client write |
| `mw-leaders/{level}/games/{id}` | **Legacy** all-time board, now frozen into Legends | read-only |

Each `mw-scores` entry:

```js
{
  name,        // display nickname
  playerId,    // browser fingerprint (UserService)
  score,       // ranked value — minesweeper: finish time in ms
  category,    // segmentation — minesweeper: level id
  time_stamp,  // when the game finished — drives the rolling time windows
  day,         // "2026-07-03"   (UTC calendar day)   — retained, not queried
  week,        // "2026-W27"     (ISO week)           — retained, not queried
  month,       // "2026-07"      (UTC calendar month) — retained, not queried
  meta         // optional extras — minesweeper: { isMobile }
}
```

### How the time windows work

The windows are **rolling**, based on `time_stamp`, and strictly nested:

- Today → `where('time_stamp', '>=', now - 24h)` — last 24 hours
- Week → `where('time_stamp', '>=', now - 7d)` — last 7 days
- Month → `where('time_stamp', '>=', now - 30d)` — last 30 days
- All Time → no time filter, `orderBy('score')` + `limit(10)`

Because Firestore requires the inequality field (`time_stamp`) to sort first, the
adapter fetches the in-window rows and ranks them by `score` client-side (Supabase
does it server-side). A score in the 7-day window is always in the 30-day window,
so a player can be top-10 for the week but rank out of a busier month — that's
competition, not a boundary quirk.

> The `day`/`week`/`month` bucket keys are still written to each entry (and
> validated by the rules) but are **no longer used for querying** — they're kept
> as denormalized metadata and for a possible calendar-bucket mode.

## Schema as code

The Firestore schema (security rules + indexes) lives in the repo:

- [`firebase.json`](../firebase.json) — points at the rules and indexes files.
- [`.firebaserc`](../.firebaserc) — project aliases: `prod` (default, live site)
  and `dev` (`secure-moment-188701`).
- [`firestore.rules`](../firestore.rules) — access + validation rules.
- [`firestore.indexes.json`](../firestore.indexes.json) — **empty**: rolling
  windows (`time_stamp >=`) and all-time (`orderBy('score')`) use Firestore's
  automatic single-field indexes, so no composite indexes are needed.

## Environments (dev vs production)

There is **one Firebase project** (`secure-moment-188701`). Production and test
data are separated not by project but by **collection namespace**, chosen with
the `VITE_LB_NAMESPACE` env var read in [`app/main.js`](../app/main.js):

| Environment | `VITE_LB_NAMESPACE` | Collections |
| --- | --- | --- |
| Production (Netlify) | `mw` | `mw-scores`, `mw-all`, `mw-config` |
| Local `pnpm dev` / previews | `mw-test` | `mw-test-scores`, `mw-test-all`, `mw-test-config` |

The Firebase web config (`VITE_FIREBASE_*`) is **identical** in both — same
project — so the only difference is the namespace. `app/main.js` defaults to the
**test** namespace, so a missing/misconfigured var can never write into the
production board; production must set `VITE_LB_NAMESPACE=mw` explicitly.

Dev config lives in the committed [`app/.env.development`](../app/.env.development)
(the keys are public). Production sets `VITE_FIREBASE_*` **and**
`VITE_LB_NAMESPACE=mw` as Netlify environment variables. `.env.production` and
`.env*.local` stay gitignored.

> The full rationale and rollout steps are in
> [leaderboard-env-migration.md](leaderboard-env-migration.md).

### One-time CLI setup

The Firebase project already exists — no need to create it.

```bash
npx firebase login
```

### Deploy rules + indexes

Deploys go to **production** by default. Target a project explicitly with
`--project`:

```bash
# production (default alias 'prod')
npx firebase deploy --only firestore:rules,firestore:indexes --project prod

# development database
npx firebase deploy --only firestore:rules,firestore:indexes --project dev
```

> ⚠️ Deploying **replaces** whatever rules currently live in the Console. The
> committed [`firestore.rules`](../firestore.rules) is written to cover every
> collection the app uses, so a deploy is safe — but review it first.

No composite indexes are required — the rolling-window and all-time queries use
Firestore's automatic single-field indexes.

## Local Firestore emulator (default for local dev)

Local development runs against the **Firebase Local Emulator Suite** by default —
no cloud, no deploy, no auth, no `permission-denied` — and it loads the committed
[`firestore.rules`](../firestore.rules) and [`firestore.indexes.json`](../firestore.indexes.json)
locally (so you validate them before deploying). The flag
`VITE_FIRESTORE_EMULATOR=1` is set in [`app/.env.development`](../app/.env.development).

> Prerequisite: the Firestore emulator is a Java process, so you need a JDK
> (11+) installed. `firebase-tools` is fetched on demand via `npx`.

Everyday dev loop:

```bash
pnpm -F mnswpr run dev   # emulator (+ UI) on :8080, auto-seeded with sample scores, + app dev server
```

`dev` seeds the fresh emulator for you (via `emulators:exec "node scripts/seed-dev-scores.js; vite"`). Use the standalone `db:start` / `db:seed` scripts only when running the emulator separately from the app.

Wiring: `app/main.js` passes `{ emulator: { host, port } }` to `FirebaseAdapter`,
which calls `connectFirestoreEmulator`. If the emulator isn't running the board
just shows "unavailable" (a refused connection) — start it, or opt out.

**Opting out** (no Java, or you want the real cloud `mw-test`): create
`app/.env.local` with `VITE_FIRESTORE_EMULATOR=` (empty) — `.env.local` overrides
`.env.development` and is gitignored.

The emulator is disposable — its data is gone on stop unless you use Firebase's
`--import`/`--export-on-exit`.

## Console fallback

Everything above is doable via the CLI. If you can't use it:

- **Indexes**: nothing to do — the queries use automatic single-field indexes.
  (If you ever add a query that needs a composite index, Firestore prints a
  console error with a direct link to create it.)
- **Rules**: edit them directly under **Firestore → Rules** in the Console
  (paste from [`firestore.rules`](../firestore.rules)).
- **Server config**: `mw-config/configuration` (`passingStatus`, `message`) is
  **always** managed by hand in the Console — it is read-only to clients and has
  no code representation. `passingStatus` is the `status` value that makes a game
  eligible for the board (minesweeper: `"win"`).

## Legends (frozen hall of fame)

The old all-time leaders are preserved as a **fully-rendered static page** —
[`app/legends.html`](../app/legends.html). The records are baked straight into the
HTML with times pre-formatted; there is **no JavaScript and no Firebase** at page
load. The data never changes.

The page is generated by [`scripts/export-legends.js`](../scripts/export-legends.js),
which snapshots `mw-leaders/{level}/games` and writes the whole `legends.html`.
It only needs re-running if you ever want to regenerate. Because `firebase` is an
app-workspace dependency, run it so Node can resolve it:

```bash
(cd app && node ../scripts/export-legends.js)
```

The Firebase config for this one-off is hardcoded in the script (public keys).

## Reusing the leaderboard for another game

`@cozy-games/leaderboard` knows nothing about minesweeper **or** Firebase — the
ranked value is a generic `score` and all storage goes through an injected
adapter. Another game supplies its own adapter and config:

```js
import { LeaderBoardService } from '@cozy-games/leaderboard/leader-board.js'
import { FirebaseAdapter } from '@cozy-games/leaderboard/adapters/firebase.js'

new LeaderBoardService({
  adapter: new FirebaseAdapter({ firebaseConfig, namespace: 'yourgame' }),
  scoreOrder: 'desc',      // 'desc' when higher is better (points); 'asc' for time
  formatScore: v => `${v} pts`,
  qualifies: entry => true // default: server passingStatus vs entry.status
})
```

To run on **Supabase** instead, swap in `SupabaseAdapter` — nothing else in the
game changes. The adapter interface and the Supabase table/SQL schema are
documented in [`leaderboard/README.md`](../leaderboard/README.md).

Then submit `{ name, playerId, score, category, time_stamp, status?, meta? }`
and render with `render(category, title, duration)`.

**No composite indexes needed.** Rolling windows filter on `time_stamp` and
all-time sorts by `score` — both use Firestore's automatic single-field indexes,
in either sort direction, so a `desc`-scored game needs no extra index work.
