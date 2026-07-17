// Publishes @cozy-games/mnswpr to npm using the mnswpr app README.md as the
// package's README (what npmjs.com displays).
//
// packages/mnswpr/README.md is a generated copy (gitignored) — the source of
// truth is apps/mnswpr/README.md. The library's own guide lives in
// packages/mnswpr/TUTORIAL.md.
import { execSync } from 'node:child_process'
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const libDir = resolve(root, 'packages/mnswpr')

console.log('Copying apps/mnswpr/README.md into packages/mnswpr/ for the published package')
copyFileSync(resolve(root, 'apps/mnswpr/README.md'), resolve(libDir, 'README.md'))

execSync('npm login')
// Use `pnpm publish` (not `npm publish`) so `workspace:^` protocol deps are
// rewritten to real version ranges in the published package. `npm publish`
// leaves them verbatim, which produces uninstallable packages.
execSync('pnpm publish', { cwd: libDir, stdio: 'inherit' })
