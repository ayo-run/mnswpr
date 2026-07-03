# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

Classic Minesweeper as a vanilla web game — no framework, no TypeScript (JSDoc + `// @ts-check` only). Deployed at [mnswpr.com](https://mnswpr.com) (Netlify) and published to npm as `@ayo-run/mnswpr`. The game engine has **zero runtime dependencies**; only the website adds Firebase.

**`mnswpr` is the main test app.** It's the reference app for the monorepo and the default target for local runs — `.claude/launch.json` launches it (`dev` on :5173, `preview` on :4173), and it's what you should build/run/preview when verifying changes to the shared packages or tooling.

## Commands

Workspace-wide commands run from the root; per-app commands target the app by name with pnpm's `-F` filter (apps are named `<name>` — there are no mnswpr-specific root scripts).

```bash
pnpm i              # install (pnpm is required — this is a pnpm workspace)
pnpm test           # run the Vitest suite once (jsdom)
pnpm test:watch     # run Vitest in watch mode
pnpm lint           # eslint . (JS + CSS); runs automatically on pre-commit
pnpm lint:fix       # eslint --fix
pnpm build:lib      # build the publishable library -> packages/mnswpr/dist

pnpm -F mnswpr run dev            # Firestore emulator + auto-seed + dev server (emulators:exec) — most common; needs JDK 21+
pnpm -F mnswpr run dev:no-db      # plain vite, no emulator (UI-only work / no JDK)
pnpm -F mnswpr run build          # build the website -> apps/mnswpr/dist
pnpm -F mnswpr run build:preview  # build the app and serve the production preview
```

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

Tests are co-located with the package they exercise (`packages/utils/test/`, `packages/mnswpr/test/`) and run under **Vitest** with a jsdom environment (root config in `vitest.config.js`). They cover the shared utils and drive the engine through real DOM events (mount `#app`, dispatch mouse events, assert on cell/grid attributes). For anything visual or input-timing related, also verify by running `pnpm -F mnswpr run dev` and playing.

Node version: `.nvmrc` pins `lts/*`.

## Repository layout (Cozy Games monorepo, pnpm workspace)

This is the **Cozy Games** monorepo. Workspaces are declared in `pnpm-workspace.yaml` as `apps/*`, `packages/*`, and `sites/*`. `utils/` is now a real workspace package (`@cozy-games/utils`), imported by name — no more `../utils` relative paths.

- **`apps/mnswpr/`** — package `mnswpr`, `@ayo-run/mnswpr`'s host, the mnswpr.com website. Consumes the engine and leaderboard via `workspace:*` (`import mnswpr from '@ayo-run/mnswpr/mnswpr.js'`) and wires them together in `apps/mnswpr/main.js`. Owns its Firebase config (`firebase.json`, `firestore.rules`, `.firebaserc`) and app-specific scripts (`apps/mnswpr/scripts/`). A future app (e.g. sudoku) gets its own `apps/<name>/` and its `package.json` `name` is just the app name (`<name>`, unscoped) so it's addressable directly by name (`pnpm -F <name> run <script>`).
- **`packages/mnswpr/`** — `@ayo-run/mnswpr`, the standalone, framework-free game engine published to npm. `packages/mnswpr/mnswpr.js` is the whole engine; `levels.js` defines the four difficulty presets. Depends only on `@cozy-games/utils`.
- **`packages/leaderboard/`** — `@cozy-games/leaderboard`, a backend-agnostic, time-windowed leaderboard (adapter-injected storage).
- **`packages/utils/`** — `@cozy-games/utils`, shared services with no dependencies, re-exported from `index.js`: `StorageService`, `TimerService` (`pretty()` time formatting used by both engine and leaderboard), `LoggerService`, `LoadingService`, and date-bucket helpers.
- **`sites/`** — docs (Astro Starlight) and UI demos. Placeholders for now.

## Architecture

**The engine is decoupled from the app via two hooks.** `Minesweeper(appId, version, hooks)` (`packages/mnswpr/mnswpr.js`) is a classic constructor function that imperatively builds a `<table>` grid in the DOM. It knows nothing about Firebase or leaderboards. The app injects behavior through:

- `hooks.levelChanged(setting)` — fired when the difficulty level changes; the app uses this to re-fetch and render the leaderboard for that level.
- `hooks.gameDone(game)` — fired when a game ends (win or loss) with a `game` object (`time`, `status`, `level`, `time_stamp`, `isMobile`); the app uses this to submit the score.

When adding engine features that the website needs to react to, prefer adding a new hook over reaching into the app — that separation is what keeps the library publishable on its own. (There are already `TODO` markers in the engine for an `afterGridGenerated` hook.)

**Game state lives in DOM attributes, not a JS model.** The grid's overall state is the `game-status` attribute on the `<table>` (`inactive` → `active` → `over`/`win` → `done`). Each cell carries `data-status` (`default`, `highlighted`, `flagged`, `clicked`, `empty`) and `data-value` (adjacent mine count). Mine positions are the one exception: kept in `minesArray` as `[row, col]` pairs. When changing game logic, read/write these attributes consistently — helpers like `getStatus`/`setStatus`, `isMine`, `isFlagged` are the intended accessors.

**First-click safety:** the first clicked cell is never a mine — if it is, `transferMine()` relocates it to a non-neighboring empty cell before revealing.

**Input handling is intricate.** Mouse (left/right/middle, plus simultaneous left+right "chording") and touch (long-press to flag) are handled through a state machine of flags (`isLeft`, `isRight`, `pressed`, `bothPressed`, `skip`, `isBusy`) in `initializeEventHandlers`/`initializeTouchEventHandlers`. `isBusy` debounces input (`MOBILE_BUSY_DELAY`/`PC_BUSY_DELAY`). Tread carefully here — small changes easily break chording or mobile flagging.

**Test mode:** set `TEST_MODE = true` at the top of `packages/mnswpr/mnswpr.js` to render mine positions as visual hints and enable debug logging.

## Leaderboard / Firebase (`apps/mnswpr/modules/`)

`LeaderBoardService` (`leader-board.js`) reads/writes Firestore (`firebase/firestore/lite`). Structure: top-10 per level in `mw-leaders/{level}/games`, all sessions in `mw-all/{browserId}/games`, and remote runtime `configuration` in `mw-config`. A score is only offered to the leaderboard when it beats the current 10th place *and* matches the server-side `passingStatus`.

The **Firebase config in `leader-board.js` is intentionally public and committed** — for a client-only Firebase app the API key is not a secret (access is governed by Firestore security rules), so don't treat it as a leaked credential or try to move it to env vars.

`UserService` (`user.js`) derives a non-cryptographic `browserId` fingerprint from navigator/screen properties to attribute scores without accounts.

## Conventions

- **Code style is enforced by ESLint Stylistic**, not Prettier: 2-space indent, single quotes, **no semicolons**, no trailing commas, spaces inside `{ braces }` but not `[brackets]`. Run `pnpm lint:fix` before committing. Both `**/*.js` and `**/*.css` are linted (CSS via `@eslint/css`).
- The engine uses **plain functions and `var`/`let` closures**, not classes; `packages/utils/` and `apps/mnswpr/modules/` use ES classes. Match the surrounding style of the file you edit.

## Release & git hooks (maintainer workflow)

- **Husky hooks:** `pre-commit` runs `pnpm lint`; `post-commit` auto-pushes to two extra remotes (`git push gh`, `git push sh`). If those remotes aren't configured locally, expect post-commit failures — that's environmental, not a code problem.
- **Releasing** (`pnpm release`) builds the lib, runs `bumpp` (version bump + tag) in `packages/mnswpr/`, then `scripts/release.js` force-pushes a `release` branch and tags to remotes `gh`/`sh`. Pushing a `v*` tag triggers `.github/workflows/release.yml` (`changelogithub`) to publish GitHub release notes. Only run this when explicitly releasing.
