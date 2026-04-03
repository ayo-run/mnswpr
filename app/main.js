import mnswpr from '@ayo-run/mnswpr/mnswpr.js'
import '@ayo-run/mnswpr/mnswpr.css'
import * as pkg from '@ayo-run/mnswpr/package.json'
import { LoadingService } from '../utils/'

const version = import.meta.env.MODE === 'development'
  ? 'dev'
  : pkg.version

const game = new mnswpr('app', version, {
  levelChanged: () => console.log('[hook]: level reset'),
  gameDone: (game) => console.log('[hook]: game done', game)
})
game.initialize()

const loadingService = new LoadingService()
const loadingWrapper = document.createElement('div')
loadingWrapper.id = 'loading-wrapper'
loadingService.addLoading(loadingWrapper)

const appElement = document.getElementById('app')
appElement.append(loadingWrapper)

