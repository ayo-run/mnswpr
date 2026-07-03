/**
 * Seed the DEVELOPMENT leaderboard with sample scores so the boards aren't empty
 * while developing. Writes to the `mw-test-*` namespace by default.
 *
 * Two ways to run it:
 *
 * 1. Against the local Firestore EMULATOR (recommended — no cloud, no deploy):
 *      pnpm emulators           # in one terminal
 *      pnpm seed:emulator       # in another
 *    (seed:emulator sets FIRESTORE_EMULATOR_HOST so writes hit the emulator.)
 *
 * 2. Against the real cloud dev database: REQUIRES the generalized
 *    firestore.rules to be deployed first (they permit writes to
 *    `mw-test-scores`), else every write returns permission-denied:
 *      npx firebase deploy --only firestore:rules --project dev
 *      (cd apps/mnswpr && node scripts/seed-dev-scores.js)
 *
 * `firebase` is an app-workspace dependency, so run it from the app directory so
 * Node can resolve it. Optional namespace override: LB_NAMESPACE=mw-test.
 */
import { initializeApp } from 'firebase/app'
import { getFirestore, connectFirestoreEmulator, doc, collection, setDoc } from 'firebase/firestore/lite'

import { buckets } from '@cozy-games/utils/date-bucket/date-bucket.js'

const firebaseConfig = {
  apiKey: 'AIzaSyCTi_5Sm5dHFNf0d_Gn0MNWmlGheFBf6MQ',
  authDomain: 'moment-188701.firebaseapp.com',
  databaseURL: 'https://moment-188701.firebaseio.com',
  projectId: 'secure-moment-188701',
  storageBucket: 'secure-moment-188701.firebasestorage.app',
  messagingSenderId: '113827947104',
  appId: '1:113827947104:web:b176f746d8358302c51905'
}

const namespace = process.env.LB_NAMESPACE || 'mw-test'

// Per-level rough time ranges (ms) so sample times look believable.
const LEVELS = {
  beginner: [1800, 12000],
  intermediate: [28000, 95000],
  expert: [90000, 260000],
  nightmare: [180000, 620000]
}

const NAMES = [
  'Ayo', 'Sweeper', 'MineWizard', 'jenjereren', 'wasd', 'kaboom',
  'flagella', 'ClickClick', 'Torpedo', 'S-Davies', 'Anonymous', 'zero-day',
  'BoomBot', 'gridlock', 'NoNiner', 'chord-lord', 'tenten', 'quicksilver'
]

// Ages (days ago) spread so Today / Week / Month / All Time all get entries.
const AGE_DAYS = [0, 0, 0, 1, 2, 4, 6, 10, 18, 27, 45, 80]

const now = Date.now()
const rand = (min, max) => Math.floor(min + Math.random() * (max - min))
const pick = arr => arr[Math.floor(Math.random() * arr.length)]

const store = getFirestore(initializeApp(firebaseConfig))

// Point at a local Firestore emulator when FIRESTORE_EMULATOR_HOST is set
// (e.g. "127.0.0.1:8080"). Writes then hit the local emulator, not the cloud.
if (process.env.FIRESTORE_EMULATOR_HOST) {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  connectFirestoreEmulator(store, host, Number(port))
  console.log(`Using Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`)
}

let ok = 0
let failed = 0
let firstError

for (const [level, [min, max]] of Object.entries(LEVELS)) {
  for (let i = 0; i < AGE_DAYS.length; i++) {
    const stamp = new Date(now - AGE_DAYS[i] * 86400000 - rand(0, 3600000))
    const bucket = buckets(stamp)
    const entry = {
      name: pick(NAMES),
      playerId: `seed-${level}-${i}`,
      score: rand(min, max),
      category: level,
      time_stamp: stamp,
      day: bucket.day,
      week: bucket.week,
      month: bucket.month,
      meta: { isMobile: Math.random() < 0.3, seed: true }
    }
    try {
      await setDoc(doc(collection(store, `${namespace}-scores`, level, 'games')), entry)
      ok++
    } catch (error) {
      failed++
      firstError = firstError || (error.code || error.message)
    }
  }
  console.log(`${level}: seeded`)
}

console.log(`\nDone. Wrote ${ok} sample score(s) to ${namespace}-scores, ${failed} failed.`)
if (failed) {
  console.error(`\nWrites failed (${firstError}). If this is 'permission-denied', deploy the rules first:`)
  console.error('  npx firebase deploy --only firestore:rules --project dev')
  process.exit(1)
}
