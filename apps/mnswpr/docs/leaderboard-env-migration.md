# Migration: env-var-driven prod/test separation

## Why

Today the leaderboard has **no separation between production and test data**.
Every environment — a developer running `pnpm dev`, a Netlify preview, and the
live site — reads and writes the same collections (`mw-scores`, `mw-all`,
`mw-config`, legacy `mw-leaders`) in the single Firebase project
`secure-moment-188701`. `version`/`import.meta.env.MODE` only affects UI text
([lib/mnswpr.js:96](../lib/mnswpr.js:96)); it never changes collection names. So
local play pollutes the production leaderboard.

We keep **one Firebase project** (there is no separate prod project — see
[docs/firebase-leaderboards.md](firebase-leaderboards.md)) and separate data by
**collection namespace**, chosen at build time via an env var:

| Environment | `VITE_LB_NAMESPACE` | Collections |
| --- | --- | --- |
| Production (Netlify) | `mw` | `mw-scores`, `mw-all`, `mw-config` |
| Local dev / previews | `mw-test` | `mw-test-scores`, `mw-test-all`, `mw-test-config` |

The Firebase web config (`VITE_FIREBASE_*`) is **identical** in both — same
project — so the *only* thing distinguishing prod from test is the namespace.
Existing production data under `mw-*` is untouched; `mw-test-*` starts empty.

## Current vs target

| Piece | Now | After |
| --- | --- | --- |
| Namespace | hardcoded `'mw'` in [app/main.js](../app/main.js) | `import.meta.env.VITE_LB_NAMESPACE` |
| Dev writes | into prod `mw-*` | into `mw-test-*` |
| Rules | only `mw-*` matches | any `mw` / `mw-test` namespace |
| Indexes | `games` collection group | unchanged (already covers all namespaces) |
| `.firebaserc` | `REPLACE_WITH_PROD_PROJECT_ID` placeholder | `secure-moment-188701` |

## Steps

### 1. Add the namespace env var

- [app/.env.development](../app/.env.development): add `VITE_LB_NAMESPACE=mw-test`
- [app/.env.example](../app/.env.example): document `VITE_LB_NAMESPACE`
- Netlify (production build): set `VITE_LB_NAMESPACE=mw` **and** the same
  `VITE_FIREBASE_*` values as dev (same project).

### 2. Read it in the app

In [app/main.js](../app/main.js), replace the hardcoded namespace. Default to the
**test** namespace so a missing/misconfigured var can never write to production:

```js
new FirebaseAdapter({
  firebaseConfig,
  namespace: import.meta.env.VITE_LB_NAMESPACE || 'mw-test'
})
```

Production must set `VITE_LB_NAMESPACE=mw` explicitly. (Fail-safe: the worst case
of a missing var is an empty test board, never prod pollution.)

### 3. Generalize the security rules

Rewrite [firestore.rules](../firestore.rules) so a rule matches by the namespace
*suffix* instead of a literal `mw-` prefix. Firestore ORs all matching rules, so
one set of generic blocks covers `mw`, `mw-test`, and any future namespace.
Note: `{ns}-scores/{cat}/games/{id}`, `{ns}-all/{id}/games/{s}` and
`{ns}-leaders/{cat}/games/{id}` share the same 4-segment shape, so each block is
guarded by a regex on the captured collection name.

```
rules_version = '2'
service cloud.firestore {
  match /databases/{database}/documents {

    // Ranked, windowed scores — public read, validated create-only.
    match /{scores}/{category}/games/{game} {
      allow read:   if scores.matches('mw(-[a-z]+)?-scores');
      allow create: if scores.matches('mw(-[a-z]+)?-scores') && isValidScore(category);
      allow update, delete: if false;
    }

    // Legacy all-time (now frozen into Legends) — read-only.
    match /{leaders}/{category}/games/{game} {
      allow read:  if leaders.matches('mw(-[a-z]+)?-leaders');
      allow write: if false;
    }

    // Per-browser personal archive — permissive, as before.
    match /{all}/{browserId}/games/{session} {
      allow read, write: if all.matches('mw(-[a-z]+)?-all');
    }

    // Server config — public read, no client write.
    match /{config}/{document} {
      allow read:  if config.matches('mw(-[a-z]+)?-config');
      allow write: if false;
    }

    function isValidScore(category) {
      let d = request.resource.data;
      return d.score is number
        && d.score >= 0
        && d.category == category
        && d.name is string
        && d.name.size() <= 24
        && d.day is string
        && d.week is string
        && d.month is string;
    }
  }
}
```

The regex `mw(-[a-z]+)?-scores` matches `mw-scores` and `mw-test-scores`
(and e.g. `mw-preview-scores`).

### 4. Indexes — none needed

Time windows are rolling (`time_stamp >=`) and all-time sorts by `score`, so the
queries use Firestore's automatic single-field indexes.
[firestore.indexes.json](../firestore.indexes.json) is empty — nothing to add for
any namespace.

### 5. Seed the test config doc

Windowed qualification reads `{ns}-config/configuration`. Create
`mw-test-config/configuration` once (copy `passingStatus` and `message` from the
prod `mw-config/configuration`) via the Console, or a tiny one-off script. If it
is absent the default qualifier simply allows all entries — acceptable for test.

### 6. Point `.firebaserc` at the real project

Both aliases target the one project we actually have:

```json
{ "projects": { "default": "secure-moment-188701", "prod": "secure-moment-188701", "dev": "secure-moment-188701" } }
```

(If a separate prod Firebase project is ever created, split these then.)

### 7. Deploy & verify

1. `pnpm -F mnswpr exec firebase deploy --only firestore:rules,firestore:indexes --project prod`
2. Set the Netlify env vars via CLI: `pnpm -F mnswpr exec netlify env:import .env.production` (or `netlify env:set VITE_LB_NAMESPACE mw` + each `VITE_FIREBASE_*`).
3. `pnpm dev`, win a game → confirm the write lands in **`mw-test-scores`**, and
   the prod `mw-scores` is untouched (Firestore console).
4. Confirm reads on both `mw-scores` and `mw-test-scores` succeed under the new
   rules, and a malformed write is rejected.

## Not affected

- **Legends** — static, already exported from legacy `mw-leaders`; no runtime DB.
- **Data migration** — none. Prod keeps `mw-*`; test starts fresh in `mw-test-*`.
- **The `@cozy-games/leaderboard` package** — already namespace-parameterized;
  only the app's wiring changes.

## Rollback

Set `VITE_LB_NAMESPACE=mw` everywhere (or revert [app/main.js](../app/main.js) to
the hardcoded `'mw'`) to return to shared collections. The generalized rules are
a superset of the old ones, so they stay valid either way.
