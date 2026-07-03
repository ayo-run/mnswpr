# Cozy Games

A monorepo for **Cozy Games** — a growing collection of small browser
games and the shared, reusable packages that power them.

## Layout

```
cozy-games/
├── apps/          Playable games (each deploys independently)
│   └── mnswpr/    Minesweeper — mnswpr.com  (@ayo-run/mnswpr engine + Firebase leaderboard)
├── packages/      Shared, publishable libraries
│   ├── mnswpr/       @ayo-run/mnswpr   — the vanilla Minesweeper game engine
│   ├── leaderboard/  @cozy-games/leaderboard — backend-agnostic, time-windowed leaderboard
│   └── utils/        @cozy-games/utils — shared browser utilities (storage, timer, …)
└── sites/         Docs (Astro Starlight) and UI demos  — placeholders for now
```

Each app owns its own backend config (e.g. mnswpr's Firestore rules live in
`apps/mnswpr/`); the shared packages stay backend-agnostic.

## Getting started

This is a [pnpm](https://pnpm.io) workspace (pnpm is required).

Workspace-wide commands run from the root:

```bash
pnpm i              # install
pnpm test           # run all package tests (vitest)
pnpm lint           # eslint
pnpm build:lib      # build the engine package -> packages/mnswpr/dist
```

### Per-app local development

Apps aren't run from the root — target the app by name with pnpm's `-F` filter. Apps are
named `<name>` (e.g. `mnswpr`), so every app runs the same way:

```bash
pnpm -F mnswpr run dev       # start that app's Vite dev server
pnpm -F mnswpr run build     # build just that app  -> apps/mnswpr/dist
pnpm -F mnswpr run preview   # preview its production build
```

## Infra (per-app, via local CLI)

Every infra operation runs through local CLIs — never web dashboards — and every
config/schema is codified in-repo. Two layers, both owned by the app:

- **Config** (declarative, committed state): for `mnswpr`, `firebase.json`, `.firebaserc`,
  `firestore.rules`, `firestore.indexes.json`, `netlify.toml`, and `.env.example`.
- **Tools** (the CLIs acting on that config): versioned **devDependencies** of the app
  (`firebase-tools`, `netlify-cli`) — installed by `pnpm install`, not `npx`/global.

Each app owns its infra scripts under generic names — run them by targeting the app
with pnpm's `-F` filter:

```bash
pnpm -F mnswpr run db:start    # start the local DB emulator (Firestore) — needs Java, see app README
pnpm -F mnswpr run db:seed       # seed the running emulator with dev data
pnpm -F mnswpr run db:stop       # kill a stray emulator left holding :8080
pnpm -F mnswpr run deploy:db     # deploy DB rules/indexes  (firebase deploy --only firestore)
pnpm -F mnswpr run deploy:site   # build + deploy hosting   (netlify deploy --prod --dir=dist)
```

Apps are named `<name>`, so a future app uses the same command shape
(`pnpm -F <name> run deploy:db`), backed by whatever stack (and CLIs) that app declares.
One-time per app: `pnpm -F mnswpr exec firebase login`, and
`pnpm -F mnswpr exec netlify login && pnpm -F mnswpr exec netlify link`. Manage prod
hosting env vars via CLI too (e.g. `netlify env:set` / `netlify env:import`). See
[AGENTS.md](AGENTS.md) for the full infra reference.

See [apps/mnswpr/README.md](apps/mnswpr/README.md) for the game itself, and each package's
README for library usage.

## License

BSD-2-Clause © Ayo Ayco
