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

## Separable read & write surfaces

The service is composed of two independently importable halves, so you never pull
in code you don't use — and can point each half at a differently-privileged
backend instance:

| Surface | Import | Uses | Adapter methods |
| ------- | ------ | ---- | --------------- |
| **Read / subscribe** | `@cozy-games/leaderboard/leaderboard-read.js` → `LeaderBoardReader` | `render()` — query a window + render the list | `listScores` |
| **Write** | `@cozy-games/leaderboard/leaderboard-write.js` → `LeaderBoardWriter` | `submit()` — archive + ranked entry | `addScore`, optional `archive`, `getConfig` |

```js
// Read-only page (public, less-privileged instance) — no write code loaded:
import { LeaderBoardReader } from '@cozy-games/leaderboard/leaderboard-read.js'
const board = new LeaderBoardReader({ adapter: readAdapter, formatScore })
document.body.append(await board.render('beginner', 'Best Times'))

// Server / trusted path (privileged instance) — no DOM or render code loaded:
import { LeaderBoardWriter } from '@cozy-games/leaderboard/leaderboard-write.js'
const writer = new LeaderBoardWriter({ adapter: writeAdapter })
await writer.submit(entry)
```

The read module imports **no** write-path code (no bucket-key computation, no
write adapter calls) and the write module imports **no** read/render code (no
DOM, no `listScores`) — which also keeps each surface trivial to test in
isolation. `LeaderBoardService` (and `<cozy-leaderboard>`) remain the combined
facade — same `render()` + `submit()` API — for consumers that want both; it just
composes a `LeaderBoardReader` and a `LeaderBoardWriter` (exposed as `.reader` /
`.writer`).

## Choosing a backend

### Bring your own backend instance (injection)

Both adapters let the **consumer own the backend instance** — including a
privileged/admin-level or server-side one — rather than the package creating its
own. This is the injection point per adapter:

| Adapter    | Injection point            | Internal init fallback              |
| ---------- | -------------------------- | ----------------------------------- |
| Supabase   | `client` (a supabase-js client you build) — **always** consumer-supplied; the package takes no supabase dependency | none — a client is required |
| Firebase   | `store` (a Firestore instance you build) | `firebaseConfig` → the package initializes its own app |

Supply a privileged instance and every read/write runs against it — the package
adds no auth or app lifecycle of its own.

### Firebase (Firestore)

```js
import { FirebaseAdapter } from '@cozy-games/leaderboard/adapters/firebase.js'

// (a) let the package initialize from a public config:
const adapter = new FirebaseAdapter({ firebaseConfig, namespace: 'mw' })

// (b) OR inject a Firestore instance you built (e.g. privileged/server-side):
const adapter = new FirebaseAdapter({ store: myFirestore, namespace: 'mw' })
```

Needs the `firebase` peer dependency. Uses collections
`{ns}-scores/{category}/games`, `{ns}-all/{playerId}/games`,
`{ns}-config/configuration`. Time windows are **rolling** (`time_stamp >= cutoff`)
and all-time sorts by `score`, so only Firestore's automatic single-field indexes
are needed — no composite indexes to deploy.

With an injected `store` the package initializes nothing and owns no app
lifecycle. For internal init, pass `emulator` to run against the
[Firestore emulator](https://firebase.google.com/docs/emulator-suite) — no cloud,
no deploy (wire the emulator into your own store if you inject one):

```js
new FirebaseAdapter({ firebaseConfig, namespace: 'mw', emulator: { host: '127.0.0.1', port: 8080 } })
```

#### Client SDK vs Admin SDK (server-side writes)

`FirebaseAdapter` is built on the **client** SDK (`firebase/firestore/lite`) —
the right choice for browser reads and for deployments where clients write
directly. When writes must run in a **privileged server context** — a Cloud
Function writing the ranked board that security rules deny to browsers — use the
Admin SDK instead. The two Firestore SDKs are call-incompatible (the client SDK
is free functions, `doc(store, …)`/`getDoc(ref)`; the Admin SDK is instance
methods, `store.doc(path).get()`), so the package ships a **second adapter**
rather than trying to make one `store` serve both:

```js
import { getFirestore } from 'firebase-admin/firestore'
import { FirebaseAdminAdapter } from '@cozy-games/leaderboard/adapters/firebase-admin.js'
import { LeaderBoardWriter } from '@cozy-games/leaderboard/leaderboard-write.js'

// inside a Cloud Function / trusted server context:
const adapter = new FirebaseAdminAdapter({ store: getFirestore(adminApp), namespace: 'mw' })
await new LeaderBoardWriter({ adapter }).submit(entry)
```

Both adapters use the **same collections** (`{ns}-scores/{category}/games`,
`{ns}-all/{playerId}/games`, `{ns}-config/configuration`) and implement the same
`getConfig`/`listScores`/`addScore`/`archive` contract, so a client instance can
read exactly what an Admin instance wrote. `FirebaseAdminAdapter` **always**
takes an injected `store` (it never initializes an app and takes no
`firebase-admin` dependency of its own).

**Injection contract — the exact Firestore methods each adapter calls** on the
injected `store`, so you can confirm an instance satisfies it:

| Adapter | SDK | Methods called on `store` |
| --- | --- | --- |
| `FirebaseAdapter` | `firebase/firestore/lite` (client) | free functions `doc`, `getDoc`, `collection`, `query`, `where`, `orderBy`, `limit`, `getDocs`, `setDoc` — each passed the `store`/refs |
| `FirebaseAdminAdapter` | `firebase-admin/firestore` (Admin) | `store.doc(path)` → `.get()` / `.set(data, { merge })`; `store.collection(path)` → `.doc()` (auto-id), `.where()/.orderBy()/.limit()` (chainable) → `.get()` |

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
