# @cozy-games/leaderboard

A generic, framework-free leaderboard with **Today / Week / Month / All Time**
time windows. It is game-agnostic (the ranked value is a plain `score`) and
**backend-agnostic**: all storage I/O goes through an injected *adapter*, so you
can run it on Firebase, Supabase, or anything else.

```
LeaderBoardService (core: windows, sorting, rendering, submit)
        │  uses
        ▼
   Adapter  ── FirebaseAdapter | SupabaseAdapter | your own
```

## Quick start

```js
import { LeaderBoardService } from '@cozy-games/leaderboard/leader-board.js'
import { FirebaseAdapter } from '@cozy-games/leaderboard/adapters/firebase.js'

const service = new LeaderBoardService({
  adapter: new FirebaseAdapter({ firebaseConfig, namespace: 'mw' }),
  scoreOrder: 'asc',                       // 'asc' = lower is better (time); 'desc' = points
  formatScore: ms => prettyTime(ms)        // how a score is displayed
})

// render into the page (Today tab by default)
document.body.append(await service.render('beginner', 'Best Times'))

// submit a finished game
service.submit({
  name: 'Ayo',
  playerId: 'browser-abc',
  score: 4200,
  category: 'beginner',
  time_stamp: new Date(),
  status: 'win',                           // optional; used by default qualifier
  meta: { isMobile: false }                // optional extras
})
```

### Service options

| option | required | meaning |
| --- | --- | --- |
| `adapter` | yes | storage backend (see below) |
| `scoreOrder` | no | `'asc'` (default) or `'desc'` |
| `formatScore` | no | `(value) => string`; defaults to `String(value)` |
| `qualifies` | no | `(entry) => boolean`; default ranks entries whose `status` matches the server config's `passingStatus` (all entries if none) |
| `labels` | no | override tab labels, keyed by `today`/`week`/`month`/`all` |
| `tooltips` | no | override tab hover text, keyed by `today`/`week`/`month`/`all` |
| `emptyMessages` | no | `string[]` shown when a window has no scores (one picked at random) |
| `loadingText` | no | text shown while a window loads (default `Loading…`) |
| `errorText` | no | text shown when a window fails to load |
| `anonymousName` | no | fallback display name for entries without one (default `Anonymous`) |

**Localization** lives with you, not this package: every user-facing string —
tab `labels`, `emptyMessages`, `loadingText`, `errorText`, `anonymousName` — is an
option, so you pass your translated copy (from `<cozy-leaderboard>` use it via
`configureLeaderboard({ ... })`). The package only ships English defaults.

📖 **Full reference:** every option, the web-component attributes/properties,
adapters, i18n, and precedence rules are documented in
[CONFIGURATION.md](./CONFIGURATION.md).

## Use it as a web component

Prefer to **compose the UI in your HTML** instead of wiring it in JavaScript? The
package ships a `<cozy-leaderboard>` custom element. Configure the backend once,
then drop the element anywhere in your markup — the board (duration tabs + list)
renders itself.

```html
<!-- 1. configure the backend once (the only JS you need) -->
<script type="module">
  import { configureLeaderboard } from '@cozy-games/leaderboard/leaderboard-element.js'
  import { FirebaseAdapter } from '@cozy-games/leaderboard/adapters/firebase.js'

  configureLeaderboard({
    adapter: new FirebaseAdapter({ firebaseConfig, namespace: 'mw' })
  })
</script>

<!-- 2. compose the UI declaratively, anywhere -->
<cozy-leaderboard category="beginner" title="Best Times" format="time"></cozy-leaderboard>
```

No build step required — it works straight from a CDN too:

```html
<script type="module">
  import { configureLeaderboard } from 'https://esm.sh/@cozy-games/leaderboard/leaderboard-element.js'
  import { FirebaseAdapter } from 'https://esm.sh/@cozy-games/leaderboard/adapters/firebase.js'
  configureLeaderboard({ adapter: new FirebaseAdapter({ firebaseConfig, namespace: 'mw' }) })
</script>

<cozy-leaderboard category="expert" title="Legends" format="time" score-order="asc"></cozy-leaderboard>
```

### Attributes

| attribute | meaning |
| --- | --- |
| `category` | which board to show (e.g. a difficulty/level id) |
| `title` | heading text above the tabs |
| `duration` | initial tab: `today` (default) · `week` · `month` · `all` |
| `score-order` | `asc` (lower is better, default) or `desc` (higher is better) |
| `format` | score display preset: `time` (ms → `mm:ss.t`), `number`, or `plain` |

Change `category`/`title` at runtime and the board re-renders reactively while
**keeping the selected duration tab** — e.g. `el.setAttribute('category', 'expert')`.

### Properties & methods

- `.adapter`, `.formatScore`, `.qualifies` — per-element overrides of the shared
  `configureLeaderboard()` defaults (for advanced/multi-backend pages).
- `.submit(entry)` — submit a finished game through this element's service:
  ```js
  document.querySelector('cozy-leaderboard').submit({
    name: 'Ayo', playerId: 'browser-abc', score: 4200,
    category: 'beginner', time_stamp: new Date(), status: 'win'
  })
  ```

## Why a web component?

`<cozy-leaderboard>` is built on **[web-component-base](https://github.com/ayo-run/wcb)**
(WCB) — a zero-dependency, tiny base class for reactive custom elements
([webcomponent.io](https://webcomponent.io)). Shipping the leaderboard as a web
component means:

- **Framework-agnostic & native.** A custom element is part of the platform, so
  it drops into React, Vue, Svelte, Angular, Astro, or a plain HTML file
  identically — no per-framework wrappers.
- **Declarative composition.** You place the board where it belongs in your
  markup and set attributes, instead of imperative `createElement`/`append`
  plumbing in JS.
- **Reactive.** Change an attribute (`category`, `title`, …) and the element
  updates itself — the reactivity model WCB is built around.
- **Encapsulated & reusable.** One tag, one contract; reuse it across pages and
  projects without copy-pasting wiring.
- **No build step.** Works today in every modern browser, straight from a CDN —
  no compilers, transpilers, or polyfills. That "just use the platform" ethos is
  exactly what WCB is for.

Want to author your own custom elements this way? Check out
**[webcomponent.io](https://webcomponent.io)** and
**[web-component-base](https://github.com/ayo-run/wcb)**.

## Choosing a backend

### Firebase (Firestore)

```js
import { FirebaseAdapter } from '@cozy-games/leaderboard/adapters/firebase.js'
const adapter = new FirebaseAdapter({ firebaseConfig, namespace: 'mw' })
```

Needs the `firebase` peer dependency. Uses collections
`{ns}-scores/{category}/games`, `{ns}-all/{playerId}/games`,
`{ns}-config/configuration`. Time windows are **rolling** (`time_stamp >= cutoff`)
and all-time sorts by `score`, so only Firestore's automatic single-field indexes
are needed — no composite indexes to deploy.

For local development, pass `emulator` to run against the
[Firestore emulator](https://firebase.google.com/docs/emulator-suite) — no cloud,
no deploy:

```js
new FirebaseAdapter({ firebaseConfig, namespace: 'mw', emulator: { host: '127.0.0.1', port: 8080 } })
```

### Supabase (Postgres)

```js
import { createClient } from '@supabase/supabase-js'
import { SupabaseAdapter } from '@cozy-games/leaderboard/adapters/supabase.js'

const client = createClient(url, anonKey)
const adapter = new SupabaseAdapter({ client, namespace: 'mw' })
```

You construct the supabase client yourself (the package takes no supabase
dependency). Create these tables (namespace `mw` shown):

```sql
create table mw_scores (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(name) <= 24),
  player_id   text,
  score       numeric not null,
  category    text not null,
  time_stamp  timestamptz not null default now(),
  day         text not null,   -- '2026-07-03'
  week        text not null,   -- '2026-W27'
  month       text not null,   -- '2026-07'
  meta        jsonb
);
-- rolling-window lookups (time_stamp >= cutoff) + top-N by score
create index on mw_scores (category, time_stamp);
create index on mw_scores (category, score);

create table mw_archive (
  id          bigint generated always as identity primary key,
  player_id   text,
  score       numeric,
  category    text,
  time_stamp  timestamptz not null default now(),
  meta        jsonb
);

create table mw_config (
  id       text primary key,   -- 'configuration'
  passingStatus text,
  message  text
);

-- public read on the boards, append-only inserts on scores
alter table mw_scores enable row level security;
create policy read_scores  on mw_scores for select using (true);
create policy write_scores on mw_scores for insert with check (score is not null);
alter table mw_config enable row level security;
create policy read_config on mw_config for select using (true);
```

Note: the `day`/`week`/`month` columns are still written (kept as metadata) but
windows query by `time_stamp`. For a `desc` game, add `(category, score desc)`.

## Writing your own adapter

An adapter is any object implementing:

```ts
getConfig(): Promise<object | undefined>
listScores(q: {
  category: string,
  since: Date | null,   // rolling cutoff (time_stamp >= since); null = All Time
  order: 'asc' | 'desc',
  limit: number
}): Promise<Array<{ name: string, score: number, ...}>>
addScore(category: string, entry: object): Promise<void>
archive?(entry: object): Promise<void>     // optional personal history
```

`listScores` must return the top `limit` records for the window, best-first,
exposing at least `name` and `score`. The core builds `entry` and the query
descriptor; the adapter only performs raw reads/writes. That's the whole
contract — implement it against any store.
