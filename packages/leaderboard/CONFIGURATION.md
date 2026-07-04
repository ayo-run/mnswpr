# Leaderboard configuration reference

Complete reference for configuring `@cozy-games/leaderboard`. There are two ways
to use it — a **JS API** and a **web component** — and they share the same option
set. The element simply forwards options to the service under the hood.

- [Options at a glance](#options-at-a-glance)
- [JS API — `LeaderBoardService`](#js-api--leaderboardservice)
- [Web component — `<cozy-leaderboard>`](#web-component--cozy-leaderboard)
- [Adapters (backend config)](#adapters-backend-config)
- [Localization (i18n)](#localization-i18n)
- [Score entry shape](#score-entry-shape)
- [Where config is read / precedence](#where-config-is-read--precedence)

---

## Options at a glance

| option | type | default | purpose |
| --- | --- | --- | --- |
| `adapter` | object | — (**required**) | storage backend — a `FirebaseAdapter`, `SupabaseAdapter`, or your own |
| `scoreOrder` | `'asc'` \| `'desc'` | `'asc'` | `asc` = lower is better (time); `desc` = higher is better (points) |
| `formatScore` | `(value) => string` | `String(value)` | how a score is displayed |
| `qualifies` | `(entry) => boolean` | server `passingStatus` vs `entry.status` | whether a submitted entry is ranked |
| `labels` | object | `{today,week,month,all}` English | tab labels, keyed by `today`/`week`/`month`/`all` |
| `tooltips` | object | `Last 24 hours` / `Last 7 days` / `Last 30 days` / `All time` | tab hover text, keyed by `today`/`week`/`month`/`all` |
| `emptyMessages` | `string[]` | built-in pool | messages for an empty window (one picked at random) |
| `loadingText` | string | `Loading…` | shown while a window loads |
| `errorText` | string | `Leaderboard unavailable right now.` | shown when a window fails to load |
| `anonymousName` | string | `Anonymous` | fallback display name for entries without one |

Every user-facing string (`labels`, `emptyMessages`, `loadingText`, `errorText`,
`anonymousName`) is an option — see [Localization](#localization-i18n).

---

## JS API — `LeaderBoardService`

```js
import { LeaderBoardService } from '@cozy-games/leaderboard/leader-board.js'
import { FirebaseAdapter } from '@cozy-games/leaderboard/adapters/firebase.js'

const service = new LeaderBoardService({
  adapter: new FirebaseAdapter({ firebaseConfig, namespace: 'mw' }),
  scoreOrder: 'asc',
  formatScore: ms => prettyTime(ms)
})
```

### Methods

- **`render(category, title, duration?) → Promise<HTMLElement>`**
  Builds the board (duration tabs + list) for `category` with heading `title`.
  `duration` is one of `today` (default) · `week` · `month` · `all`. When omitted
  on a re-render, the last-selected tab is kept. Append the returned element to
  the page.

  Windows are **rolling** and strictly nested: `today` = last 24h, `week` = last
  7 days, `month` = last 30 days, `all` = everything — each shows the top scores
  whose `time_stamp` falls in the window. Each tab's hover text (`tooltips`)
  spells this out.

- **`submit(entry) → Promise`**
  Records a finished game (archives it; ranks it if it `qualifies`). See
  [Score entry shape](#score-entry-shape).

---

## Web component — `<cozy-leaderboard>`

Configure the backend once in JS, then compose the UI in HTML.

```html
<script type="module">
  import { configureLeaderboard } from '@cozy-games/leaderboard/leaderboard-element.js'
  import { FirebaseAdapter } from '@cozy-games/leaderboard/adapters/firebase.js'

  configureLeaderboard({
    adapter: new FirebaseAdapter({ firebaseConfig, namespace: 'mw' }),
    scoreOrder: 'asc',
    format: 'time'
  })
</script>

<cozy-leaderboard category="beginner" title="Best Times" format="time"></cozy-leaderboard>
```

### `configureLeaderboard(options)`

Sets shared defaults for **every** `<cozy-leaderboard>` on the page. Accepts all
the [options above](#options-at-a-glance), plus `format` (a preset shorthand for
`formatScore` — see below). Call it once at startup. Calling it again re-renders
mounted elements.

### Attributes

| attribute | values | purpose |
| --- | --- | --- |
| `category` | string | which board to show (e.g. a difficulty/level id) |
| `title` | string | heading text above the tabs |
| `duration` | `today` \| `week` \| `month` \| `all` | initial tab (default `today`) |
| `score-order` | `asc` \| `desc` | overrides the shared `scoreOrder` |
| `format` | `time` \| `number` \| `plain` | score display preset (below) |

Attributes are reactive: change `category`/`title` at runtime and the board
re-renders, keeping the selected duration tab. Changing `score-order`/`format`
rebuilds the element's service so the new order/preset takes effect.

### `format` presets

| `format` | result |
| --- | --- |
| `time` | milliseconds → `mm:ss.t` (e.g. `01:34.6`) |
| `number` / `plain` / unset | `String(value)` |

For anything else, set a `formatScore` function (via `configureLeaderboard` or the
per-element property).

### Override properties & method

Set these JS properties on an element to override the shared config for that one
element (useful for multi-board or multi-backend pages):

`adapter`, `formatScore`, `qualifies`, `labels`, `emptyMessages`, `loadingText`,
`errorText`, `anonymousName`.

```js
const el = document.querySelector('cozy-leaderboard')
el.emptyMessages = ['¡Sé el primero!']
el.formatScore = pts => `${pts} pts`
```

- **`submit(entry)`** — submit a finished game through this element's service:
  ```js
  el.submit({ name: 'Ayo', playerId: 'abc', score: 4200, category: 'beginner', time_stamp: new Date(), status: 'win' })
  ```

---

## Adapters (backend config)

### `FirebaseAdapter`

```js
import { FirebaseAdapter } from '@cozy-games/leaderboard/adapters/firebase.js'
new FirebaseAdapter({ firebaseConfig, namespace: 'mw', emulator })
```

| option | type | default | purpose |
| --- | --- | --- | --- |
| `firebaseConfig` | object | — | Firebase web config (public; access governed by rules) |
| `namespace` | string | `lb` | collection prefix → `{ns}-scores`, `{ns}-all`, `{ns}-config` |
| `emulator` | `{ host?, port? }` | — | point at a local Firestore emulator (dev only); host `127.0.0.1`, port `8080` |

Needs the `firebase` peer dependency. Rolling-window and all-time queries use
Firestore's automatic single-field indexes — no composite indexes to deploy.

### `SupabaseAdapter`

```js
import { createClient } from '@supabase/supabase-js'
import { SupabaseAdapter } from '@cozy-games/leaderboard/adapters/supabase.js'
new SupabaseAdapter({ client: createClient(url, anonKey), namespace: 'mw' })
```

| option | type | default | purpose |
| --- | --- | --- | --- |
| `client` | supabase-js client | — | you construct it (package takes no supabase dep) |
| `namespace` | string | `lb` | table prefix → `{ns}_scores`, `{ns}_archive`, `{ns}_config` |

See the [README](./README.md#supabase-postgres) for the SQL schema.

---

## Localization (i18n)

This package ships **English defaults only** — localization is your app's job.
Pass translated copy for every user-facing string:

```js
configureLeaderboard({
  adapter,
  labels: { today: 'Hoy', week: 'Semana', month: 'Mes', all: 'Histórico' },
  emptyMessages: [
    '¡Sé el primero en el marcador!',
    'Aún no hay puntajes. ¡Reclama la cima!'
  ],
  loadingText: 'Cargando…',
  errorText: 'Marcador no disponible ahora.',
  anonymousName: 'Anónimo'
})
```

The same keys work when constructing `LeaderBoardService` directly. To switch
languages at runtime, call `configureLeaderboard()` again with the new strings
(mounted elements re-render).

---

## Score entry shape

The object passed to `submit(entry)`:

```js
{
  name,        // string — display name (falls back to `anonymousName`)
  playerId,    // string — opaque id (e.g. a browser fingerprint)
  score,       // number — the ranked value (minesweeper: finish time in ms)
  category,    // string — which board (minesweeper: level id)
  time_stamp,  // Date — when the game finished (used to compute day/week/month)
  status,      // string, optional — read by the default `qualifies`
  meta         // object, optional — extra fields to store (e.g. { isMobile })
}
```

The package computes the `day`/`week`/`month` bucket keys from `time_stamp`
(UTC) before storing — you don't set those.

---

## Where config is read / precedence

- **JS API:** options are read when you construct `LeaderBoardService`.
- **Web component:** the element builds its service on first render (on connect),
  reading — in order — its **own attribute/property**, then the shared
  **`configureLeaderboard()`** value, then the **package default**:

  ```
  per-element attribute/property  >  configureLeaderboard(...)  >  built-in default
  ```

  The service is cached per element, so set overrides **before** the element
  connects (or set the property and clear the element's `_svc` to force a
  rebuild — changing the `score-order`/`format` attributes does this
  automatically). `score-order` and `format` are read from attributes; the
  function/array/string overrides are read from properties.
