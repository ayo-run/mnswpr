# mnswpr

The [mnswpr.com](https://mnswpr.com) web app — classic Minesweeper in the browser.

![screenshot](screenshot.png)

This repo is the game app. The shared, reusable modules it builds on
(`@cozy-games/mnswpr`, `@cozy-games/leaderboard`, `@cozy-games/utils`, and the
rest of the `@cozy-games/*` family) live in their own repo:
[ayo-run/cozy-games](https://github.com/ayo-run/cozy-games), and are consumed
here from npm.

## Contributing

Setup, running the game locally, testing, code style, and local infra all live
in **[CONTRIBUTING.md](CONTRIBUTING.md)**. In short — this is a
[pnpm](https://pnpm.io) workspace:

```bash
pnpm i                     # install
pnpm test                  # run the test suite
pnpm -F mnswpr run dev     # run the Minesweeper app locally
```

See [apps/mnswpr/README.md](apps/mnswpr/README.md) for the game itself.

## License

MIT © Ayo Ayco
