# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

Classic Minesweeper as a vanilla web game — no framework, no TypeScript (JSDoc + `// @ts-check` only). Deployed at [mnswpr.com](https://mnswpr.com) (Netlify), with a Firestore-backed leaderboard.

**This repo is only the app.** The engine, leaderboard, and shared services (`@cozy-games/mnswpr`, `@cozy-games/leaderboard`, `@cozy-games/utils`) live in [ayo-run/cozy-games](https://github.com/ayo-run/cozy-games) and are consumed here **from npm** — there is no local `packages/` to edit. A change to game mechanics, leaderboard internals, or the shared services belongs in that repo and arrives here as a version bump in `apps/mnswpr/package.json`.

Structurally it is still a pnpm workspace (`pnpm-workspace.yaml` → `apps/*`) with a single member, `apps/mnswpr`, so app scripts are addressed with pnpm's `-F` filter.

## Commands

Workspace-wide commands run from the root; app commands target the app with pnpm's `-F` filter. `pnpm dev` and `pnpm build` are root aliases for the two most common ones.

```bash
pnpm i              # install (pnpm is required — this is a pnpm workspace)
pnpm test           # run the Vitest suite once (jsdom)
pnpm test:watch     # run Vitest in watch mode
pnpm lint           # eslint . (JS + CSS); runs automatically on pre-commit
pnpm lint:fix       # eslint --fix
pnpm scan:secrets   # secretlint over the tree

pnpm -F mnswpr run dev            # Firestore emulator + auto-seed + dev server (emulators:exec) — most common; needs JDK 21+
pnpm -F mnswpr run dev:no-db      # plain vite, no emulator (UI-only work / no JDK)
pnpm -F mnswpr run build          # build the website -> apps/mnswpr/dist
pnpm -F mnswpr run preview        # serve the production build
pnpm -F mnswpr run build:preview  # build the app and serve the production preview
```

Run a single test file or name: `pnpm vitest run scripts/test/check-content.test.js` · `pnpm vitest run -t 'partial name'`.

### Infra (local CLI only — no web dashboards)

**Every infra operation — provision, deploy hosting, deploy DB, manage env — is doable from the CLI, and every configuration/schema is codified in-repo.** Nothing lives only in a web dashboard. There are two distinct layers, both owned by the app:

**1. App infra *config* — declarative, committed, deployed state.** These files ARE the source of truth; deploying just pushes them up. For `mnswpr`, all under `apps/mnswpr/`:

| File | Codifies |
| --- | --- |
| `firebase.json` | Firestore + emulator wiring (rules/indexes paths, emulator ports) |
| `.firebaserc` | Firebase project aliases (`default`/`prod`/`dev`) |
| `firestore.rules` | Firestore security rules (server-side access control) |
| `firestore.indexes.json` | Firestore indexes (none needed — documented inline) |
| `netlify.toml` | Netlify hosting: build command, publish dir, redirects, headers, build env |
| `.env.example` | The full env-var contract; real prod values are set as Netlify env vars via CLI, never committed |

**2. App infra *tools* — the CLIs that act on that config.** They are versioned **devDependencies** of the app (not `npx`-on-demand, not global installs), so `pnpm install` pins them and every machine gets the same version. `mnswpr` depends on `firebase-tools` and `netlify-cli`; its scripts call the `firebase`/`netlify` binaries directly (pnpm puts the app's `node_modules/.bin` on `PATH`). A future app using a different stack (Postgres, a different host) declares *its* CLIs as *its* devDependencies and backs the same generic script names — so `pnpm -F <name> run deploy:db` stays uniform.

Each app **owns its infra scripts** in its own `package.json` under generic, tech-agnostic names (`deploy:db`, not `deploy:firestore`) — run them by targeting the app with pnpm's `-F` filter (no root wrapper scripts):

```bash
pnpm -F mnswpr run db:start      # local DB emulator (mnswpr -> Firestore), standalone
pnpm -F mnswpr run db:seed       # seed the running local emulator
pnpm -F mnswpr run db:stop       # kill a stray/orphaned Firestore emulator holding :8080
pnpm -F mnswpr run deploy:db     # deploy DB rules/indexes (-> firebase deploy --only firestore)
pnpm -F mnswpr run deploy:site   # build + deploy hosting (-> netlify deploy --prod --dir=dist)
```

**One-time per app / per machine (all CLI, no dashboard):**

```bash
pnpm -F mnswpr exec firebase login             # auth the Firebase CLI
pnpm -F mnswpr exec netlify login              # auth the Netlify CLI
pnpm -F mnswpr exec netlify link               # bind the app dir to its Netlify site (writes .netlify/, gitignored)
```

**Managing hosting env vars via CLI** (keeps prod Firebase keys + `VITE_LB_NAMESPACE=mw` out of git while still reproducible):

```bash
pnpm -F mnswpr exec netlify env:set VITE_LB_NAMESPACE mw   # set one var
pnpm -F mnswpr exec netlify env:import .env.production      # bulk-import from a local (gitignored) env file
pnpm -F mnswpr exec netlify env:list                       # inspect what's set
```

**Non-npm tools get a setup script instead of a devDependency.** The Firestore emulator needs **Java** (it's a JVM program), which isn't an npm package — so `pnpm install` runs a root `postinstall` (`scripts/ensure-java.mjs`) that installs a user-local Temurin JRE 21 into `~/.local` without `sudo` when `java` is missing — idempotent, non-fatal, and auto-skipped on `CI` / `SKIP_JRE_SETUP` / unsupported platforms. Any future infra tool that isn't on npm follows the same pattern (a checked-in setup script), never a manual install step.

Tests run under **Vitest** with a jsdom environment (root config in `vitest.config.js`), which collects `apps/**/test/**/*.test.js` and `scripts/test/**/*.test.js`. Today only `scripts/test/` exists (the content scanner); app-level tests go in `apps/mnswpr/test/`. Engine and shared-package tests live in the cozy-games repo, not here. For anything visual or input-timing related, verify by running `pnpm -F mnswpr run dev` and playing.

Node version: `.nvmrc` pins `lts/*`.

## Repository layout

`pnpm-workspace.yaml` declares `apps/*`; `apps/mnswpr/` (package name `mnswpr`) is the only member.

- **`apps/mnswpr/`** — the mnswpr.com website. `main.js` composes the npm packages; `index.html` + `main.css` are the shell; `modules/` holds the two app-owned services; `scripts/` holds app scripts (dev seeding, legends export); `docs/` documents the backend. Owns its infra config (`firebase.json`, `firestore.rules`, `.firebaserc`, `netlify.toml`).
- **`scripts/`** — repo-level tooling: `check-content.mjs` (content policy scanner, tested in `scripts/test/`) and `ensure-java.mjs` (postinstall JRE bootstrap).

## Architecture

`apps/mnswpr/main.js` is ~75 lines and is the whole app: it wires three npm packages together and owns nothing else.

**The engine is decoupled from the app via two hooks.** `new mnswpr(appId, version, hooks)` is a constructor function that imperatively builds a `<table>` grid in the DOM. It knows nothing about Firebase or leaderboards. The app injects behavior through:

- `hooks.levelChanged(level)` — fired when the difficulty level changes; the app repoints the leaderboard element at that level (`title` + `category` attributes).
- `hooks.gameDone(game)` — fired when a game ends (win or loss) with a `game` object (`time`, `status`, `level`, `time_stamp`, `isMobile`); the app maps it onto `board.submit({ name, playerId, score, category, … })`.

If the app needs to react to something new in the engine, the right fix is a **new hook in the cozy-games repo**, not app code reaching into engine internals — that separation is what keeps the library publishable on its own.

**The leaderboard is composed declaratively.** `<cozy-leaderboard>` is placed in `index.html` and re-renders reactively off its attributes; `main.js` only calls `configureLeaderboard({ adapter: new FirebaseAdapter(...) })` once to bind the backend.

The engine-internal notes below describe code that lives in the cozy-games repo — keep them in mind when reasoning about behavior you observe here, but edit them there.

**Game state lives in DOM attributes, not a JS model.** The grid's overall state is the `game-status` attribute on the `<table>` (`inactive` → `active` → `over`/`win` → `done`). Each cell carries `data-status` (`default`, `highlighted`, `flagged`, `clicked`, `empty`) and `data-value` (adjacent mine count). Mine positions are the one exception: kept in `minesArray` as `[row, col]` pairs. When changing game logic, read/write these attributes consistently — helpers like `getStatus`/`setStatus`, `isMine`, `isFlagged` are the intended accessors.

**First-click safety:** the first clicked cell is never a mine — if it is, `transferMine()` relocates it to a non-neighboring empty cell before revealing.

**Input handling is intricate.** Mouse (left/right/middle, plus simultaneous left+right "chording") and touch (long-press to flag) are handled through a state machine of flags (`isLeft`, `isRight`, `pressed`, `bothPressed`, `skip`, `isBusy`) in `initializeEventHandlers`/`initializeTouchEventHandlers`. `isBusy` debounces input (`MOBILE_BUSY_DELAY`/`PC_BUSY_DELAY`). Tread carefully here — small changes easily break chording or mobile flagging.

**Test mode:** the engine has a `TEST_MODE` flag that renders mine positions as visual hints and enables debug logging — it lives in the engine source in the cozy-games repo, so it is not toggleable from this repo.

## Leaderboard / Firebase

Storage goes through `FirebaseAdapter` from `@cozy-games/leaderboard`; this repo supplies only configuration. Full data model, security rules, environments, and deployment: `apps/mnswpr/docs/firebase-leaderboards.md`.

**Firebase config comes from `VITE_FIREBASE_*` env vars** — dev values are committed in `apps/mnswpr/.env.development`, production values are Netlify env vars. For a client-only Firebase app the API key is **not a secret** (access is governed by `firestore.rules`), so don't treat the committed dev config as a leaked credential or try to hide it.

**Namespace guards production.** `VITE_LB_NAMESPACE` selects the Firestore collection prefix and defaults to `mw-test`, so a missing env var can never write into the production board (`mw`). `VITE_FIRESTORE_EMULATOR=1` (set in `.env.development`) points dev at the local emulator; production builds always use real Firestore.

App-owned modules in `apps/mnswpr/modules/`: `UserService` (`user/user.js`) derives a non-cryptographic `browserId` fingerprint from navigator/screen properties to attribute scores without accounts; `NicknameService` (`nickname/nickname.js`) prompts for a display name on first visit and renders the greeting bar.

## Conventions

- **Code style is enforced by ESLint Stylistic**, not Prettier: 2-space indent, single quotes, **no semicolons**, no trailing commas, spaces inside `{ braces }` but not `[brackets]`. Run `pnpm lint:fix` before committing. Both `**/*.js` and `**/*.css` are linted (CSS via `@eslint/css`).
- `apps/mnswpr/modules/` uses ES classes; `scripts/` uses plain functions. Match the surrounding style of the file you edit.
- **Content policy.** Commit messages, branch names, PR text, and contributed lines are checked by `scripts/check-content.mjs` (hooks + the `Checks` workflow) against `.repo-policy.json`. Write commit messages in plain project voice; no tool-attribution trailers or footers, no `Co-Authored-By:` line for anyone outside the policy's `allowedCoAuthors`, no session links.
- The same scanner matches text against a maintainer-managed reserved-terms list. Findings report a location and a masked preview, never the term. If one flags your change, reword it or ask a maintainer — don't edit `.repo-policy.json`.
- **Source stays JS + JSDoc (`// @ts-check`)** — no TypeScript. Nothing is published from this repo, so there is no type-generation step here; the `.d.ts` files shipped by `@cozy-games/*` are generated in the cozy-games repo.

## Git hooks

- `pre-commit` runs `pnpm lint`, the secret scan, and the content check (staged diff + branch name); `commit-msg` runs the content check over the message; `post-commit` auto-pushes to two extra remotes (`git push gh`, `git push sh`). If those remotes aren't configured locally, expect post-commit failures — that's environmental, not a code problem.
- CI (`.github/workflows/checks.yml`) runs the same three gates on pull requests and pushes to `main`: `lint`, `test`, and the content scan over the PR commit range.
