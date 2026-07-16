# Cozy Games

A growing collection of small browser games and the shared, reusable packages that power them.

> [!Note]
<!-- content-policy: allow-next-line -->
> This repo was originally for [mnswpr](https://mnswpr.com) (see its [README](apps/mnswpr/README.md)) which has been evolved in _2026_ to understand AI-assisted development. The purpose of mnswpr has always included understanding the web development landscape and this has changed significantly with the rise of LLMs.

# Roadmap

- **Public APIs** — game-agnostic modules (core, move-log, replay, leaderboard, rating) built inside the first game.
- **Second Game** — validate those APIs by adding a second game through the adapter alone.
- **Reusable Packages** — extract proven modules into standalone, versioned packages.
- **Adapters** — freeze the adapter contract for third-party games to build against.

## Packages

| Package              | Develop        | Publish                    | 
| -------------------- | -------------- | -------------------------- |
| `mnswpr` (game core) | ✅ Built       | ✅ @cozy-games/mnswpr      |
| leaderboard          | ✅ Built       | ✅ @cozy-games/leaderboard |
| move-log             | ✅ Built       |                            |
| replay engine        | ✅ Built       |                            |
| rating math          | 🚧 Development |                            |
| `sudoku` (game core) | 🔮 Planned     |                            |

> Note: `@ayo-run/mnswpr` on npm predates this project and will be deprecated in favor of `cozy-games/mnswpr`.

## Contributing

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

MIT © Ayo Ayco
