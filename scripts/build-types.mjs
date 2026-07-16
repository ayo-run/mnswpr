// Generate the packages' TypeScript declarations (.d.ts) from their JSDoc.
//
// The repo stays JS-authored (JSDoc + `// @ts-check`); this is a build-time step
// that ships types with the published `@cozy-games/*` packages so consumers get
// them without an ambient shim. Declarations are emitted co-located next to each
// source file and committed.
//
// Why the clean step: once a `.d.ts` sits next to its `.js`, TypeScript treats it
// as that file's authoritative types and refuses to re-emit over it (TS5055). So
// we delete the previously generated declarations before re-running tsc, making
// the build repeatable. Configured by tsconfig.types.json.
import { readdirSync, statSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const packagesDir = resolve(root, 'packages')

function removeDeclarations(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue
    const entry = join(dir, name)
    if (statSync(entry).isDirectory()) removeDeclarations(entry)
    else if (name.endsWith('.d.ts')) rmSync(entry)
  }
}

removeDeclarations(packagesDir)

const tsc = resolve(root, 'node_modules/.bin/tsc')
execFileSync(tsc, ['-p', resolve(root, 'tsconfig.types.json')], { cwd: root, stdio: 'inherit' })
