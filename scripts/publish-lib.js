// Publishes @ayo-run/mnswpr to npm using the root project README.md as the
// package's README (what npmjs.com displays).
//
// lib/README.md is a generated copy (gitignored) — the source of truth is the
// root README.md. The library's own guide lives in lib/TUTORIAL.md.
import { execSync } from 'node:child_process'
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const libDir = resolve(root, 'lib')

console.log('Copying root README.md into lib/ for the published package')
copyFileSync(resolve(root, 'README.md'), resolve(libDir, 'README.md'))

execSync('npm publish', { cwd: libDir, stdio: 'inherit' })
