import mnswpr from '@ayo-run/mnswpr/mnswpr.js'
import '@ayo-run/mnswpr/mnswpr.css'
import '@cozy-games/utils/loading/loading.css'
import * as pkg from '@ayo-run/mnswpr/package.json'
import { configureLeaderboard } from '@cozy-games/leaderboard/leaderboard-element.js'
import { FirebaseAdapter } from '@cozy-games/leaderboard/adapters/firebase.js'
import { NicknameService } from './modules/nickname/nickname.js'
import { UserService } from './modules/user/user.js'

// Firebase config comes from Vite env vars so dev and production point at
// different databases: dev values live in app/.env.development (committed —
// these keys are public, not secrets, and access is governed by
// firestore.rules); production values are supplied as Netlify env vars.
// https://stackoverflow.com/questions/37482366/is-it-safe-to-expose-firebase-apikey-to-the-public/37484053#37484053
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
}

const user = new UserService()
const nickname = new NicknameService()

// The leaderboard UI is composed declaratively as <cozy-leaderboard> in
// index.html; here we only wire its backend once. Namespace selects prod (`mw`)
// vs test (`mw-test`) collections in the same Firebase project, defaulting to
// test so a missing env var can never write into the production board.
// Local dev runs against the Firestore emulator by default (VITE_FIRESTORE_EMULATOR
// in app/.env.development); production builds always use real Firestore.
const useEmulator = ['1', 'true', 'yes'].includes(String(import.meta.env.VITE_FIRESTORE_EMULATOR))
configureLeaderboard({
  adapter: new FirebaseAdapter({
    firebaseConfig,
    namespace: import.meta.env.VITE_LB_NAMESPACE || 'mw-test',
    emulator: useEmulator ? { host: '127.0.0.1', port: 8080 } : undefined
  })
})

const version = import.meta.env.MODE === 'development'
  ? 'dev'
  : pkg.version

// Ask for a nickname on first visit and show the greeting bar.
nickname.ensure()
const greeting = document.getElementById('greeting')
if (greeting) nickname.render(greeting)

const board = document.querySelector('cozy-leaderboard')

const game = new mnswpr('app', version, {
  // Point the board at the current level; the element re-renders reactively and
  // keeps the selected duration tab.
  levelChanged: (level) => {
    board.setAttribute('title', `Best Times (${level.name})`)
    board.setAttribute('category', level.id)
  },
  // Submit the finished game through the element's service.
  gameDone: (game) => board.submit({
    name: nickname.get(),
    playerId: user.browserId,
    score: game.time,
    category: game.level,
    time_stamp: game.time_stamp,
    status: game.status,
    meta: { isMobile: game.isMobile }
  })
})

game.initialize()
