# 🧹 Leaderboard Migration Checklist

Manual steps to finish the leaderboard rollout for **mnswpr**. **All code changes
are already applied** in the working tree — these are the external actions on
Firebase and Netlify that have to be done by hand.

> All commands below run from this app directory (`apps/mnswpr`) unless noted.

> One project (`secure-moment-188701`), one difference between environments: the
> **collection namespace**. Production uses `mw-*`, dev/test uses `mw-test-*`.
> Full rationale: [`docs/leaderboard-env-migration.md`](docs/leaderboard-env-migration.md).

---

## ✅ Step 1 — Deploy Firestore rules + indexes

From this app directory (`apps/mnswpr`):

```bash
pnpm -F mnswpr exec firebase login
pnpm -F mnswpr exec firebase deploy --only firestore:rules,firestore:indexes --project prod
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
| `VITE_FIREBASE_API_KEY` … (all 8) | **same as [`.env.development`](.env.development)** (same project) |
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

Populate the dev boards so they aren't empty while developing, from this app
directory (`apps/mnswpr`):

```bash
node scripts/seed-dev-scores.js
```

- Uses [`scripts/seed-dev-scores.js`](scripts/seed-dev-scores.js) — ~12 sample
  scores per level, timestamps spread across today / this week / this month /
  older so **all four tabs** populate.
- Dev-only and idempotent-ish (re-running just adds more rows); it never touches
  the production `mw-*` collections.

> 💡 **Local dev uses the emulator by default — this cloud seed is optional.**
> `pnpm dev` points at the local **Firestore emulator** (needs a JDK): run
> `pnpm emulators` + `pnpm seed:emulator` from the workspace root and you're set
> — no deploy, no cloud. The cloud seed above is only needed for a hosted/preview
> environment. To opt out of the emulator, set `VITE_FIRESTORE_EMULATOR=` empty
> in `.env.local`.
> See [`docs/firebase-leaderboards.md`](docs/firebase-leaderboards.md#local-firestore-emulator-default-for-local-dev).

## ✅ Step 5 — Verify

| Environment | How | Expected |
| --- | --- | --- |
| **Production** (`mw`) | Win a game on the live site | Score shows; doc in `mw-scores/{level}/games` |
| **Local dev** (`mw-test`) | `pnpm dev` (after Step 4) | Board shows sample scores; winning adds to `mw-test-scores/{level}/games`; prod `mw-scores` untouched |
| **Rules** | Read both boards | Reads succeed; a malformed write is rejected |

---

## 📌 Still open (not blocking)

- **Nothing is committed yet** — all changes are in the working tree.
- **`scripts/export-legends.js`** still hard-codes the (dev = prod) Firebase keys
  from the one-off Legends export. It's identical to `.env.development`; can
  be de-duped to read from the env file on request.
- **Legends** is already frozen into static HTML ([`legends.html`](legends.html))
  — no action needed.
