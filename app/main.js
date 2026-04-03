import mnswpr from '../lib/mnswpr.js'
import * as pkg from '../package.json'

const version = import.meta.env.MODE === 'development'
  ? 'dev'
  : pkg.version

const game = new mnswpr('app', version, {
  levelChanged: () => console.log('[hook]: level reset'),
  gameDone: (game) => console.log('[hook] game done', game)
})
game.initialize()