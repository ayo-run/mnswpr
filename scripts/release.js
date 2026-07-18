/**
 * Release: sync the `release` branch to `main` and push the tags.
 *
 * Run via `pnpm release`, which is `bumpp && node scripts/release.js` — bumpp
 * bumps package.json, commits, and tags first, so by the time this runs `main`
 * already carries the release commit.
 *
 * Netlify builds mnswpr.com from the `release` branch on the `gh` remote, so the
 * force-push below IS the deploy. Everything before it is a guard against
 * shipping a tree you didn't mean to ship.
 *
 * Originally forked from https://github.com/elk-zone/elk/blob/main/scripts/release.ts
 */
import { simpleGit } from 'simple-git'

// Netlify watches gh/release; the others just mirror tags.
const DEPLOY_REMOTE = 'gh'
const TAG_REMOTES = ['origin', 'gh', 'sh']

const git = simpleGit()

const fail = (message) => {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}

const status = await git.status()

if (status.current !== 'main')
  fail(`Release must run from main — you are on "${status.current}".`)

if (!status.isClean())
  fail('Working tree is dirty. Commit or stash before releasing.')

const hash = await git.revparse(['main'])
const { latest } = await git.tags()
console.log(`Releasing ${latest} (main @ ${hash.slice(0, 8)})`)

// A leftover local `release` branch from an interrupted run would make the
// checkout below fail, so drop it before recreating it from the remote.
const branches = await git.branchLocal()
if (branches.all.includes('release')) {
  console.log('Removing a stale local release branch')
  await git.branch(['-D', 'release'])
}

console.log(`Fetching ${DEPLOY_REMOTE}`)
await git.fetch(DEPLOY_REMOTE)

try {
  console.log('Checking out release')
  await git.checkout(['-b', 'release', '--track', `${DEPLOY_REMOTE}/release`])

  console.log(`Resetting release to main (${hash.slice(0, 8)})`)
  await git.reset(['--hard', hash])

  console.log(`Pushing release to ${DEPLOY_REMOTE} — this triggers the Netlify deploy`)
  await git.push([DEPLOY_REMOTE, 'release', '--force'])
} finally {
  // Never strand the user on the release branch, even if a step above threw.
  await git.checkout('main')
  const after = await git.branchLocal()
  if (after.all.includes('release')) await git.branch(['-D', 'release'])
}

for (const remote of TAG_REMOTES) {
  console.log(`Pushing tags to ${remote}`)
  await git.push([remote, '--tags'])
}

console.log(`\n✓ Released ${latest} — Netlify is building from ${DEPLOY_REMOTE}/release`)
