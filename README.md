# Cozy Games

A monorepo for **Cozy Games** — a growing collection of small, framework-free browser
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

```bash
pnpm i              # install
pnpm dev            # run the mnswpr app (Vite dev server)
pnpm test           # run all package tests (vitest)
pnpm lint           # eslint
pnpm build          # build the mnswpr app     -> apps/mnswpr/dist
pnpm build:lib      # build the engine package -> packages/mnswpr/dist
```

See [apps/mnswpr/README.md](apps/mnswpr/README.md) for the game itself, and each package's
README for library usage.

## License

BSD-2-Clause © Ayo Ayco
