# 🧹 AYO — Leaderboard Migration Checklist

Manual steps to finish the leaderboard rollout. **All code changes are already
applied** in the working tree — these are the external actions on Firebase and
Netlify that have to be done by hand.

> One project (`secure-moment-188701`), one difference between environments: the
> **collection namespace**. Production uses `mw-*`, dev/test uses `mw-test-*`.
> Full rationale: [`docs/leaderboard-env-migration.md`](docs/leaderboard-env-migration.md).

---

## ✅ Step 1 — Deploy Firestore rules + indexes

From the repo root:

```bash
npx firebase login
npx firebase deploy --only firestore:rules,firestore:indexes --project prod
```

- Uses committed [`firestore.rules`](firestore.rules) + [`firestore.indexes.json`](firestore.indexes.json).
- `prod` → `secure-moment-188701` (via [`.firebaserc`](.firebaserc)).
- ⚠️ Deploying **replaces** the console rules. The committed rules cover every
  collection (`mw-*` and `mw-test-*`), so it's safe — but review first.
- No composite indexes to build — rolling windows (`time_stamp >=`) and all-time
  (`orderBy score`) use Firestore's automatic single-field indexes.

## ✅ Step 2 — Set Netlify environment variables

In the Netlify site settings, add:

| Variable | Value |
| --- | --- |
| `VITE_FIREBASE_API_KEY` … (all 8) | **same as [`app/.env.development`](app/.env.development)** (same project) |
| `VITE_LB_NAMESPACE` | **`mw`** ← makes production use the `mw-*` collections |

> Local dev already uses `mw-test` via the committed `.env.development` — nothing
> to do there.

## ✅ Step 3 — (Optional) Seed the test config doc

Create `mw-test-config/configuration` in Firestore with the same `passingStatus`
and `message` as the prod `mw-config/configuration`.

Skip it and the test board still works — the default qualifier just accepts all
wins in test.

## ✅ Step 4 — Seed the dev database with sample scores

> ⚠️ **Must run _after_ Step 1.** The seed writes to `mw-test-scores`, which is
> only allowed once the generalized rules are deployed — otherwise every write
> returns `permission-denied`. (No indexes to wait on — the windows use
> automatic single-field indexes.)

Populate the dev boards so they aren't empty while developing:

```bash
(cd app && node ../scripts/seed-dev-scores.js)
```

- Uses [`scripts/seed-dev-scores.js`](scripts/seed-dev-scores.js) — ~12 sample
  scores per level, timestamps spread across today / this week / this month /
  older so **all four tabs** populate.
- Dev-only and idempotent-ish (re-running just adds more rows); it never touches
  the production `mw-*` collections.

> 💡 **Local dev uses the emulator by default — this cloud seed is optional.**
> `pnpm dev` points at the local **Firestore emulator** (needs a JDK): run
> `pnpm emulators` + `pnpm seed:emulator` and you're set — no deploy, no cloud.
> The cloud seed above is only needed for a hosted/preview environment. To opt
> out of the emulator, set `VITE_FIRESTORE_EMULATOR=` empty in `app/.env.local`.
> See [`docs/firebase-leaderboards.md`](docs/firebase-leaderboards.md#local-firestore-emulator-default-for-local-dev).

## ✅ Step 5 — Verify

| Environment | How | Expected |
| --- | --- | --- |
| **Production** (`mw`) | Win a game on the live site | Score shows; doc in `mw-scores/{level}/games` |
| **Local dev** (`mw-test`) | `pnpm dev` (after Step 4) | Board shows sample scores; winning adds to `mw-test-scores/{level}/games`; prod `mw-scores` untouched |
| **Rules** | Read both boards | Reads succeed; a malformed write is rejected |

---

## 📦 Step 6 — Extract `@cozy-games/leaderboard` into its own `cozy-games` repo

> **Separate, non-blocking migration.** Steps 1–5 finish the leaderboard rollout
> _inside this monorepo_. This step spins the leaderboard out into a standalone
> **`cozy-games`** repo so it can become the home for other reusable, game-agnostic
> components (leaderboard first, then things like achievements, profiles, and a
> shared score/config schema). The package is already published-shaped
> (`@cozy-games/leaderboard`, backend-agnostic via adapters) — it just currently
> lives in [`leaderboard/`](leaderboard) as a `workspace:*` dependency of the app.

### 6.1 — Create the repo

- Create **`ayo-run/cozy-games`** on GitHub (public, `BSD-2-Clause` to match
  [`leaderboard/package.json`](leaderboard/package.json)).
- Lay it out as a monorepo so future components sit beside the leaderboard:

  ```
  cozy-games/
    packages/
      leaderboard/      ← moved from mnswpr's leaderboard/
      <next component>/ ← future: achievements, profiles, …
    pnpm-workspace.yaml  (packages: ["packages/*"])
    package.json         (private root, name: "cozy-games")
  ```

### 6.2 — Move the code (keep history)

From a clone of this repo, extract the `leaderboard/` subtree with its history so
blame/commits survive the move:

```bash
# in a throwaway clone of ayo-run/mnswpr
git subtree split --prefix=leaderboard -b cozy-leaderboard-split
# then, in the new cozy-games repo:
git pull <path-to-mnswpr-clone> cozy-leaderboard-split --prefix=packages/leaderboard
```

- Update `@cozy-games/leaderboard`'s `repository.url` in its
  [`package.json`](leaderboard/package.json) to point at the new
  `ayo-run/cozy-games` repo (it currently points at `ayo-run/mnswpr`).
- Bring the leaderboard docs along:
  [`leaderboard/README.md`](leaderboard/README.md) +
  [`leaderboard/CONFIGURATION.md`](leaderboard/CONFIGURATION.md). The Firebase-
  specific guides ([`docs/firebase-leaderboards.md`](docs/firebase-leaderboards.md),
  [`docs/leaderboard-env-migration.md`](docs/leaderboard-env-migration.md)) describe
  **this app's** deployment and stay here.

### 6.3 — Publish to npm

The package builds to `dist/` (`vite build` via
[`leaderboard/vite.config.js`](leaderboard/vite.config.js), `firebase` externalized).
From the new repo:

```bash
(cd packages/leaderboard && pnpm build && npm publish --access public)
```

- Bump off `0.0.1` for the first real release (e.g. `0.1.0`).
- `firebase` stays a **peer** dependency (optional) — consumers bring their own,
  exactly as [`app/main.js`](app/main.js) does today.

### 6.4 — Point mnswpr at the published package

Once `@cozy-games/leaderboard` is on npm:

- In [`app/package.json`](app/package.json), change the dependency from
  `"@cozy-games/leaderboard": "workspace:*"` to the published range
  (e.g. `"^0.1.0"`).
- Remove `"leaderboard"` from [`pnpm-workspace.yaml`](pnpm-workspace.yaml) and
  delete the [`leaderboard/`](leaderboard) directory from this repo.
- `pnpm install` to refresh the lockfile, then re-run **Step 5** (win a game on
  both boards) to confirm the app behaves identically against the published build.

> 💡 No Firestore/Netlify changes here — collections, rules, indexes, and env
> vars are unchanged. This is purely a **code-ownership** move: the app keeps
> wiring its own `FirebaseAdapter` + namespace; only the import source changes
> from a workspace package to a published one.

---

## 📌 Still open (not blocking)

- **Nothing is committed yet** — all changes are in the working tree.
- **`scripts/export-legends.js`** still hard-codes the (dev = prod) Firebase keys
  from the one-off Legends export. It's identical to `app/.env.development`; can
  be de-duped to read from the env file on request.
- **Legends** is already frozen into static HTML ([`app/legends.html`](app/legends.html))
  — no action needed.
