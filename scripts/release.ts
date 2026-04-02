// @ts-check
// forked from https://github.com/elk-zone/elk/blob/main/scripts/release.ts

import Git from 'simple-git'


const git = Git()
const upstream = 'gh'

const hash = await git.revparse(['main'])

console.log('Checkout release branch')
await git.fetch('gh')
await git.checkout(`${upstream}/release`, {l})

console.log(`Reset to main branch (${hash})`)
await git.reset(['--hard', hash])

console.log('Push to release branch')
await git.push(['--force'])

console.log('Checkout main branch')
await git.checkout('main')
