import mnswpr from '@ayo-run/mnswpr/mnswpr.js'
import '@ayo-run/mnswpr/mnswpr.css'
import * as pkg from '@ayo-run/mnswpr/package.json'
import { LoadingService } from '../utils/'
import { LeaderBoardService } from './modules/leader-board/leader-board.js'

const leaderBoardService = new LeaderBoardService()

const version = import.meta.env.MODE === 'development'
  ? 'dev'
  : pkg.version

const initializeGameBoard = async (level) => {
  const prevousLeaderBoard = document.getElementById('leaderboard')
  const loadingService = new LoadingService()
  const loadingWrapper = document.createElement('div')
  loadingWrapper.id = 'loading-wrapper'
  loadingService.addLoading(loadingWrapper)

  const appElement = document.getElementById('app')
  if (prevousLeaderBoard){
    const parent = prevousLeaderBoard.parentNode
    parent.replaceChild(loadingWrapper, prevousLeaderBoard)
  }else{
    appElement.append(loadingWrapper)
  }
  const leaderBoardWrapper = await leaderBoardService.update(level.id, `Best Times (${level.name})`)
  leaderBoardWrapper.id = 'leaderboard'

  appElement.replaceChild(leaderBoardWrapper, loadingWrapper)
}

const sendGameResult = (game) => {
  leaderBoardService.send(game, 'time')
}

const game = new mnswpr('app', version, {
  levelChanged: (level) => initializeGameBoard(level),
  gameDone: (game) => sendGameResult(game)
})
game.initialize()

