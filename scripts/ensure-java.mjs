/**
 * Post-install convenience: make a Java runtime available for the Firebase
 * Firestore emulator (used by `pnpm run dev` / `db:start`). The emulator is
 * a Java program and firebase-tools does not bundle a JRE.
 *
 * Installs a Temurin JRE 21 into the user's home (~/.local) WITHOUT sudo and
 * symlinks `java` into ~/.local/bin (already on most PATHs). Properties:
 *   - idempotent: does nothing if `java` is already on PATH
 *   - non-fatal:  never fails `pnpm install` — on any problem it warns, exits 0
 *   - opt-out:    set SKIP_JRE_SETUP=1 (also auto-skips when CI is set)
 * Only Linux/macOS on x64/arm64 are auto-handled; anything else prints manual
 * instructions (see README.md).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir, platform, arch } from 'node:os'
import { join } from 'node:path'

const log = msg => console.log(`[ensure-java] ${msg}`)
const warn = msg => console.warn(`[ensure-java] ${msg}`)

// This is a convenience, never a blocker — always exit 0.
try {
  await main()
} catch (err) {
  warn(`skipped (${err?.message || err}).`)
  warn('The Firestore emulator needs Java 11+ — install it manually, see README.md.')
}
process.exit(0)

async function main() {
  if (process.env.SKIP_JRE_SETUP) return log('SKIP_JRE_SETUP set — skipping.')
  if (process.env.CI) return log('CI detected — skipping JRE setup.')
  if (hasJava('java')) return log('Java already on PATH — nothing to do.')

  const adoptOs = { linux: 'linux', darwin: 'mac' }[platform()]
  const adoptArch = { x64: 'x64', arm64: 'aarch64' }[arch()]
  if (!adoptOs || !adoptArch) {
    warn(`no auto-install for ${platform()}/${arch()} — install a JRE 21 manually (README.md).`)
    return
  }
  if (!hasTool('tar')) {
    warn('`tar` not found — cannot unpack the JRE. Install Java manually (README.md).')
    return
  }

  const prefix = process.env.JAVA_SETUP_PREFIX || join(homedir(), '.local')
  const libDir = join(prefix, 'lib')
  const binDir = join(prefix, 'bin')
  mkdirSync(libDir, { recursive: true })
  mkdirSync(binDir, { recursive: true })

  const url = `https://api.adoptium.net/v3/binary/latest/21/ga/${adoptOs}/${adoptArch}/jre/hotspot/normal/eclipse`
  log(`no Java found — downloading Temurin JRE 21 (${adoptOs}/${adoptArch})…`)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`)
  const tgz = join(tmpdir(), `temurin-jre-21-${adoptOs}-${adoptArch}.tar.gz`)
  writeFileSync(tgz, Buffer.from(await res.arrayBuffer()))

  const before = new Set(readdirSync(libDir))
  const untar = spawnSync('tar', ['xzf', tgz, '-C', libDir], { stdio: 'inherit' })
  rmSync(tgz, { force: true })
  if (untar.status !== 0) throw new Error('tar extraction failed')

  // the top-level dir the tarball created (e.g. jdk-21.0.11+10-jre); on re-runs
  // it already exists, so fall back to the newest matching dir.
  const jreDir = readdirSync(libDir).find(d => !before.has(d) && /jdk.*jre/i.test(d))
    || readdirSync(libDir).filter(d => /jdk.*jre/i.test(d)).sort().pop()
  if (!jreDir) throw new Error('could not locate the unpacked JRE directory')

  // java is at bin/java (linux) or Contents/Home/bin/java (macOS)
  const javaBin = [
    join(libDir, jreDir, 'bin', 'java'),
    join(libDir, jreDir, 'Contents', 'Home', 'bin', 'java')
  ].find(existsSync)
  if (!javaBin) throw new Error('java binary not found in the unpacked JRE')

  for (const tool of ['java', 'keytool']) {
    const src = javaBin.replace(/java$/, tool)
    const dst = join(binDir, tool)
    if (existsSync(src)) { rmSync(dst, { force: true }); symlinkSync(src, dst) }
  }
  if (!hasJava(join(binDir, 'java'))) throw new Error('the installed java did not run')

  log(`installed JRE 21 → ${join(libDir, jreDir)}`)
  log(`linked java → ${join(binDir, 'java')}`)
  if (!(process.env.PATH || '').split(':').includes(binDir)) {
    warn(`${binDir} is not on your PATH — add it (e.g. in ~/.profile) so \`java\` is found.`)
  }
}

function hasJava(bin) {
  const r = spawnSync(bin, ['-version'], { stdio: 'ignore' })
  return !r.error && r.status === 0
}
function hasTool(name) {
  const r = spawnSync(name, ['--version'], { stdio: 'ignore' })
  return !r.error
}
