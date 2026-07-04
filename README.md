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

## Contributing & development

Setup, running games locally, testing, code style, and local infra all live in
**[CONTRIBUTING.md](CONTRIBUTING.md)**. In short — this is a
[pnpm](https://pnpm.io) workspace:

```bash
pnpm i                     # install
pnpm test                  # run the test suite
pnpm -F mnswpr run dev     # run the Minesweeper app locally
```

See [apps/mnswpr/README.md](apps/mnswpr/README.md) for the game itself, and each
package's README for library usage.

## License

BSD-2-Clause © Ayo Ayco
