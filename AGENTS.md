# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

Classic Minesweeper as a vanilla web game — no framework, no TypeScript (JSDoc + `// @ts-check` only). Deployed at [mnswpr.com](https://mnswpr.com) (Netlify) and published to npm as `@ayo-run/mnswpr`. The game engine has **zero runtime dependencies**; only the website adds Firebase.

## Commands

```bash
pnpm i              # install (pnpm is required — this is a pnpm workspace)
pnpm dev            # run the website dev server (vite app) — most common
pnpm build          # build the website  -> app/dist
pnpm build:lib      # build the publishable library -> lib/dist
pnpm lint           # eslint . (JS + CSS); runs automatically on pre-commit
pnpm lint:fix       # eslint --fix
pnpm build:preview  # build the app and serve the production preview
pnpm test           # run the Vitest suite once (jsdom)
pnpm test:watch     # run Vitest in watch mode
```

Tests live in `test/` and run under **Vitest** with a jsdom environment (config in `vitest.config.js`). They cover the shared utils and drive the engine through real DOM events (mount `#app`, dispatch mouse events, assert on cell/grid attributes). For anything visual or input-timing related, also verify by running `pnpm dev` and playing.

Node version: `.nvmrc` pins `lts/*`.

## Repository layout (pnpm workspace)

Workspaces are declared in `pnpm-workspace.yaml` as `lib` and `app`. Note that `utils/` is **not** a workspace package — it's a plain shared folder imported by relative path from both `lib` and `app`.

- **`lib/`** — `@ayo-run/mnswpr`, the standalone, framework-free game engine. This is what gets published to npm. `lib/mnswpr.js` is the whole engine; `lib/levels.js` defines the four difficulty presets. Depends only on `utils/`.
- **`app/`** — the mnswpr.com website. Consumes the library via `workspace:*` (`import mnswpr from '@ayo-run/mnswpr/mnswpr.js'`) and adds the Firebase leaderboard. `app/main.js` wires the engine to the leaderboard through the engine's hooks.
- **`utils/`** — shared services with no dependencies, re-exported from `utils/index.js`: `StorageService` (localStorage/sessionStorage JSON wrapper), `TimerService` (game clock + `pretty()` time formatting used by both engine and leaderboard), `LoggerService`, `LoadingService`.

## Architecture

**The engine is decoupled from the app via two hooks.** `Minesweeper(appId, version, hooks)` (`lib/mnswpr.js`) is a classic constructor function that imperatively builds a `<table>` grid in the DOM. It knows nothing about Firebase or leaderboards. The app injects behavior through:

- `hooks.levelChanged(setting)` — fired when the difficulty level changes; the app uses this to re-fetch and render the leaderboard for that level.
- `hooks.gameDone(game)` — fired when a game ends (win or loss) with a `game` object (`time`, `status`, `level`, `time_stamp`, `isMobile`); the app uses this to submit the score.

When adding engine features that the website needs to react to, prefer adding a new hook over reaching into the app — that separation is what keeps the library publishable on its own. (There are already `TODO` markers in the engine for an `afterGridGenerated` hook.)

**Game state lives in DOM attributes, not a JS model.** The grid's overall state is the `game-status` attribute on the `<table>` (`inactive` → `active` → `over`/`win` → `done`). Each cell carries `data-status` (`default`, `highlighted`, `flagged`, `clicked`, `empty`) and `data-value` (adjacent mine count). Mine positions are the one exception: kept in `minesArray` as `[row, col]` pairs. When changing game logic, read/write these attributes consistently — helpers like `getStatus`/`setStatus`, `isMine`, `isFlagged` are the intended accessors.

**First-click safety:** the first clicked cell is never a mine — if it is, `transferMine()` relocates it to a non-neighboring empty cell before revealing.

**Input handling is intricate.** Mouse (left/right/middle, plus simultaneous left+right "chording") and touch (long-press to flag) are handled through a state machine of flags (`isLeft`, `isRight`, `pressed`, `bothPressed`, `skip`, `isBusy`) in `initializeEventHandlers`/`initializeTouchEventHandlers`. `isBusy` debounces input (`MOBILE_BUSY_DELAY`/`PC_BUSY_DELAY`). Tread carefully here — small changes easily break chording or mobile flagging.

**Test mode:** set `TEST_MODE = true` at the top of `lib/mnswpr.js` to render mine positions as visual hints and enable debug logging.

## Leaderboard / Firebase (`app/modules/`)

`LeaderBoardService` (`leader-board.js`) reads/writes Firestore (`firebase/firestore/lite`). Structure: top-10 per level in `mw-leaders/{level}/games`, all sessions in `mw-all/{browserId}/games`, and remote runtime `configuration` in `mw-config`. A score is only offered to the leaderboard when it beats the current 10th place *and* matches the server-side `passingStatus`.

The **Firebase config in `leader-board.js` is intentionally public and committed** — for a client-only Firebase app the API key is not a secret (access is governed by Firestore security rules), so don't treat it as a leaked credential or try to move it to env vars.

`UserService` (`user.js`) derives a non-cryptographic `browserId` fingerprint from navigator/screen properties to attribute scores without accounts.

## Conventions

- **Code style is enforced by ESLint Stylistic**, not Prettier: 2-space indent, single quotes, **no semicolons**, no trailing commas, spaces inside `{ braces }` but not `[brackets]`. Run `pnpm lint:fix` before committing. Both `**/*.js` and `**/*.css` are linted (CSS via `@eslint/css`).
- The engine uses **plain functions and `var`/`let` closures**, not classes; `utils/` and `app/modules/` use ES classes. Match the surrounding style of the file you edit.

## Release & git hooks (maintainer workflow)

- **Husky hooks:** `pre-commit` runs `pnpm lint`; `post-commit` auto-pushes to two extra remotes (`git push gh`, `git push sh`). If those remotes aren't configured locally, expect post-commit failures — that's environmental, not a code problem.
- **Releasing** (`pnpm release`) builds the lib, runs `bumpp` (version bump + tag) in `lib/`, then `scripts/release.js` force-pushes a `release` branch and tags to remotes `gh`/`sh`. Pushing a `v*` tag triggers `.github/workflows/release.yml` (`changelogithub`) to publish GitHub release notes. Only run this when explicitly releasing.
