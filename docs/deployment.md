# First-time deployment

Everything needed to take this repo from a fresh clone to a live deploy of
[mnswpr.com](https://mnswpr.com). Once it's set up you won't need this again —
day to day, `pnpm release` is the whole story.

Two services are involved: **Netlify** hosts the site, **Firebase** (Firestore)
stores the leaderboard. Both are driven entirely from the CLI; nothing here
requires a web dashboard except one Netlify setting noted below.

For the conceptual split between infra *config* (committed, declarative) and
infra *tools* (pinned devDependencies), see AGENTS.md → "Infra".

---

## 0. Prerequisites

```bash
pnpm i     # installs firebase-tools and netlify-cli as pinned devDependencies
```

Both CLIs are invoked through `pnpm exec`, so you never need a global install.

---

## 1. Netlify

### Log in and link the repo

```bash
pnpm exec netlify login
pnpm exec netlify link      # binds this directory to the site; writes .netlify/ (gitignored)
```

If you know the site ID you can skip the prompts:

```bash
pnpm exec netlify link --id <site-id>
```

Losing `.netlify/` is harmless — it's local state. Re-run `netlify link`.

### Set the base directory

The site's **base directory must be the repo root**. This is the one setting
that isn't in a config file — it lives on the site itself (Site configuration →
Build & deploy → Base directory) and must be **empty**.

If it points at a subdirectory that doesn't exist, git-triggered builds fail
before they start.

### Set the environment variables

This is the step most likely to be missed, because it only affects one of the
two deploy paths:

- **`pnpm run deploy:site`** builds *locally* and uploads `dist/`. It reads your
  local, gitignored `.env.production` — Netlify's env vars are never consulted.
- **`pnpm release`** force-pushes the `release` branch, and **Netlify builds it
  from git**. That build runs on Netlify's machines with no access to any local
  file, so it needs the variables set on the site.

A site that deploys fine via `deploy:site` can still ship a broken build from
git if these are missing — the Firebase config comes out `undefined` and the
leaderboard fails for every visitor.

The eight values are the same ones committed in `.env.development`: `prod` and
`dev` are the *same* Firebase project (see `firebase/.firebaserc`), separated
only by collection namespace. So you can set them straight from that file:

```bash
grep -E '^VITE_FIREBASE_' .env.development | while IFS='=' read -r k v; do
  pnpm exec netlify env:set "$k" "$v"
done
```

That covers:

```
VITE_FIREBASE_API_KEY            VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_AUTH_DOMAIN        VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_DATABASE_URL       VITE_FIREBASE_APP_ID
VITE_FIREBASE_PROJECT_ID         VITE_FIREBASE_MEASUREMENT_ID
```

Two variables are deliberately **not** in that list:

- **`VITE_LB_NAMESPACE`** is already set to `mw` in `netlify.toml`, so it ships
  with the repo. (`src/main.js` defaults to `mw-test` when it's missing, so a
  misconfigured build writes to the test board, never production.)
- **`VITE_FIRESTORE_EMULATOR`** must stay **absent or empty** in production.
  `src/main.js` treats `1`/`true`/`yes` as "connect to a local emulator", so if
  it leaks into the site's environment the live leaderboard silently tries to
  reach `127.0.0.1:8080` and fails for everyone. It belongs only in
  `.env.development`.

Verify what's actually set:

```bash
pnpm exec netlify env:list
```

> **These are not secrets.** Firebase Web API keys are public by design — they
> identify the project, they don't authorize anything. Access is governed by
> `firebase/firestore.rules`. They're kept out of git as prod hygiene, not
> because exposure is dangerous; the dev values are committed for this reason.

---

## 2. Firebase

### Log in

```bash
pnpm exec firebase login
```

### Deploy the security rules

**Do this before the first real release.** `firebase/firestore.rules` is the
source of truth for who can read and write the leaderboard, but it only takes
effect once deployed — a project can be running rules set by hand in the console
long ago, which won't match the repo.

```bash
pnpm run deploy:db     # firebase --config firebase/firebase.json deploy --only firestore
```

That deploys rules *and* indexes. Note that `prod` and `dev` are the same
Firebase project, so a rules deploy affects both environments at once.

If the rules are stale, leaderboard writes fail with permission-denied even
though the site loads fine — worth confirming after the first deploy by
finishing a game and checking the score appears.

---

## 3. Deploy

Two paths, both supported:

```bash
pnpm run deploy:site   # build locally, upload dist/ via the Netlify CLI
```

or the full release, which is what tags a version and triggers the git build:

```bash
pnpm release           # lint + test, then bumpp, then sync the release branch
```

`pnpm release` runs `scripts/release.js`, which force-pushes `main` to the
`release` branch on the `gh` remote. **That push is the deploy** — Netlify
watches that branch. It refuses to run from a branch other than `main` or with a
dirty working tree.

---

## Verifying a first deploy

1. `pnpm exec netlify env:list` shows all eight `VITE_FIREBASE_*` and no
   `VITE_FIRESTORE_EMULATOR`.
2. The site loads and the version in the heading matches `package.json`.
3. Finish a game — your score appears on the board. This is the real end-to-end
   check: it exercises the env vars, the rules, and the namespace together.
4. The leaderboard shows the `mw` namespace, not `mw-test`.

## Related

- [`firebase-leaderboards.md`](./firebase-leaderboards.md) — data model, rules,
  environments, deployment details
- [`firestore-emulator.md`](./firestore-emulator.md) — running the leaderboard
  locally
- [`leaderboard-env-migration.md`](./leaderboard-env-migration.md) — history of
  the env-var/namespace migration
