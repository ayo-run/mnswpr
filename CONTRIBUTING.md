# Contributing to Cozy Games

Thanks for your interest in contributing! This guide covers what you need to
develop, test, and submit changes.

> Working as an AI coding agent? See [AGENTS.md](AGENTS.md) for machine-oriented
> guidance. This document is for human contributors.

## Prerequisites

- **Node.js** — the version pinned in [`.nvmrc`](.nvmrc) (`lts/*`). With
  [nvm](https://github.com/nvm-sh/nvm): `nvm use`.
- **pnpm** — this is a [pnpm](https://pnpm.io) workspace; **pnpm is required**
  (npm/yarn will not work). The repo pins its pnpm version via the
  `packageManager` field, so the simplest way to get the right one is Corepack:
  `corepack enable`.
- **Java (JDK 11+, 21 recommended)** — only needed to run the local Firestore
  emulator (used by the mnswpr app's leaderboard in development). `pnpm install`
  tries to install a user-local Temurin JRE automatically; if that is skipped (CI
  or an unsupported platform) install a JDK yourself. You can avoid Java entirely
  with the `dev:no-db` script below.

## Project Structure

- `apps/` - Playable games (each deploys independently)
- `packages/` - Shared, publishable libraries
- `sites/` - Docs (Astro Starlight) and UI demos  — placeholders for now
```

Each app owns its own backend config (e.g. mnswpr's Firestore rules live in
`apps/mnswpr/`); the shared packages stay backend-agnostic.

## Setup

```bash
pnpm i        # install all workspace dependencies
```

## Workspace commands (run from the repo root)

```bash
pnpm test           # run the whole test suite once (Vitest, jsdom)
pnpm test:watch     # tests in watch mode
pnpm lint           # eslint (JS + CSS)
pnpm lint:fix       # eslint --fix
pnpm build:lib      # build the publishable engine -> packages/mnswpr/dist
```

## Running a game locally

Apps aren't run from the root — target one by name with pnpm's `-F` filter. Apps
are named `<name>` (e.g. `mnswpr`), so every app runs the same way
(`pnpm -F <name> run <script>`):

```bash
pnpm -F mnswpr run dev          # Vite dev server + Firestore emulator (auto-seeded) — needs Java
pnpm -F mnswpr run dev:no-db    # Vite only, no emulator (UI work, or no Java)
pnpm -F mnswpr run build        # build the app     -> apps/mnswpr/dist
pnpm -F mnswpr run preview      # preview the production build
```

## Tests

Tests run under **Vitest** with a **jsdom** environment and live next to the code
they exercise (`packages/*/test/`). They drive real behavior — e.g. mounting the
game and dispatching DOM events — not just isolated unit calls. Run `pnpm test`
(or `pnpm test:watch`) before opening a PR, and add tests for new behavior.

## Code style

Style is enforced by **ESLint (Stylistic)**, not Prettier:

- 2-space indent, single quotes, **no semicolons**, no trailing commas
- spaces inside `{ braces }` but not `[brackets]`
- both `**/*.js` and `**/*.css` are linted

Run `pnpm lint:fix` before committing. The codebase is **plain JavaScript with
JSDoc + `// @ts-check`** — no TypeScript. Match the style and patterns of the file
you're editing (the game engine uses plain functions and closures; `packages/utils`
and the app modules use ES classes).

A **pre-commit hook** runs the linter and a secret scan automatically — commits
fail if either does. Keep credentials and any `.env.production` out of commits.

## Infra & local backend (optional)

Only relevant if you're working on backend-touching features. Every app **owns its
own backend config** (declarative, committed in-repo) and its tooling (CLIs as
devDependencies) — no web dashboards. For mnswpr (Firestore + Netlify), the local
DB emulator is all a contributor needs:

```bash
pnpm -F mnswpr run db:start   # start the local Firestore emulator (standalone) — needs Java
pnpm -F mnswpr run db:seed    # seed the running emulator with sample data
pnpm -F mnswpr run db:stop    # stop a stray emulator holding :8080
```

Deploy scripts (`deploy:db`, `deploy:site`) also exist but require project
credentials, so they're for maintainers. See
[apps/mnswpr/README.md](apps/mnswpr/README.md) and that app's `docs/` for the full
backend reference.

## Project structure & decisions

The repo layout is in the [README](README.md#layout). Significant architecture
choices are recorded in [`docs/decisions/`](docs/decisions/) — worth a read before
a large change. Shared packages stay backend-agnostic; each app owns its own
backend config.

## Submitting changes

1. Create a branch off `main`.
2. Make a focused change.
3. Run `pnpm lint` and `pnpm test` — both must pass.
4. Write clear, conventional commit messages (`feat:`, `fix:`, `chore:`, …).
5. Open a pull request describing **what** changed and **why**; link any related issue.

For anything large, open an issue to discuss the approach first.

## License

By contributing, you agree that your contributions are licensed under the
project's [BSD-2-Clause license](LICENSE).
