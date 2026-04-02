import { TimerService } from '../timer/timer'
import { UserService } from '../user/user'
import { LoadingService } from '../loading/loading'
import { LoggerService } from '../logger/logger'

import { initializeApp } from 'firebase/app'
import {
  getFirestore, doc, getDocs, getDoc, setDoc, collection, query, orderBy, limit 
} from 'firebase/firestore/lite'


export class LeaderBoardService {

  timerService = new TimerService()
  loadingService = new LoadingService()
  loggerService = new LoggerService()
  user = new UserService()
  previousLevel

  /**
     * 
     * Create the Leader Board service
     * @param {String} leaders 
     * @param {String} all 
     * @param {String} configuration 
     */
  constructor() {

    // necessary keys to interact with firebase
    // not a secret
    // https://stackoverflow.com/questions/37482366/is-it-safe-to-expose-firebase-apikey-to-the-public/37484053#37484053
    // For Firebase JS SDK v7.20.0 and later, measurementId is optional
    const config = {
      apiKey: 'AIzaSyCTi_5Sm5dHFNf0d_Gn0MNWmlGheFBf6MQ',
      authDomain: 'moment-188701.firebaseapp.com',
      databaseURL: 'https://moment-188701.firebaseio.com',
      projectId: 'secure-moment-188701',
      storageBucket: 'secure-moment-188701.firebasestorage.app',
      messagingSenderId: '113827947104',
      appId: '1:113827947104:web:b176f746d8358302c51905',
      measurementId: 'G-LZRDY0TG46'
    }
    const app = initializeApp(config)
    this._store = getFirestore(app)

    const configRef = doc(this.store, 'mw-config', 'configuration')
    getDoc(configRef)
      .then(res => {
        this.configuration = res.data()
      })
  }

  get store() {
    return this._store
  }

  async update(level, displayElement, title) {

    if (level !== this.previousLevel) {
      this.loadingService.addLoading(displayElement)
      this.previousLevel = level
      this.lastPlace = Number.MAX_SAFE_INTEGER

      const q = query(
        collection(this.store, 'mw-leaders', level, 'games'),
        orderBy('time'),
        limit(10)
      )
      this.topListSnapshot = await getDocs(q)
      this.renderList(displayElement, title, this.topListSnapshot.docs)
    }

  }

  renderList(displayElement, title, docs) {
    if (!displayElement) return

    displayElement.innerHTML = ''
    const leaderHeading = document.createElement('h3')
    leaderHeading.innerText = title
    leaderHeading.style.borderBottom = '1px solid #c0c0c0'
    leaderHeading.style.paddingBottom = '10px'


    displayElement.style.maxWidth = '270px'
    displayElement.style.margin = '0 auto'

    const leaderList = document.createElement('div')

    leaderList.innerHTML = ''
    leaderList.style.listStyle = 'none'
    leaderList.style.textAlign = 'left'
    leaderList.style.marginTop = '-15px'

    if (docs && docs.length) {
      let i = 1
      docs.forEach(game => {
        if (game) {
          const prettyTime = this.timerService.pretty(game.data().time)
          const name = game.data().name || 'Anonymous'
          const item = document.createElement('div')
          item.style.display = 'flex'
          const nameElement =document.createElement('div')
          nameElement.innerHTML = name
          nameElement.setAttribute('title', name)
          nameElement.style.textOverflow = 'ellipsis'
          nameElement.style.whiteSpace = 'nowrap'
          nameElement.style.overflow = 'hidden'
          nameElement.style.padding = '0 5px'
          nameElement.style.cursor = 'pointer'
          nameElement.style.fontWeight = 'bold'
          nameElement.style.fontStyle = 'italic'
          // nameElement.onmousedown = () => console.log(game.data());

          const indexElement = document.createElement('div')
          indexElement.innerText = `#${i++}`
                    
          const timeElement = document.createElement('div')
          timeElement.innerText = prettyTime

          item.append(indexElement, nameElement, timeElement)
          leaderList.append(item)
        }
      })
      if (docs.length >= 10) {
        this.lastPlace = docs[9].data().time
      }

      displayElement.append(leaderHeading, leaderList)
    } else {
      const message = document.createElement('em')
      message.innerText = 'Be the first to the top!'
      displayElement.append(leaderHeading, message)
    }
  }


  async send(game, key) {
    const sessionId = new Date().toDateString().replace(/\s/g, '_')
    const gameId = new Date().toTimeString().replace(/\s/g, '_')
    const data = { }
    data[gameId] = game
    
    const sessionRef = doc(this.store, 'mw-all', this.user.browserId, 'games', sessionId)
    await setDoc(sessionRef, data, { merge: true })

    if (this.configuration && game.status === this.configuration.passingStatus && game[key] < this.lastPlace) {
      let name = window.prompt(this.configuration.message)
      if (!name) {
        name = 'Anonymous'
      }

      const newGame = {
        name,
        browserId: this.user.browserId,
        ...game
      }

      const gameScoreRef = doc(collection(this.store, 'mw-leaders', game.level, 'games'))
      await setDoc(gameScoreRef, newGame)
    }
  }

  configurationPromt() {
    if (!this.configuration) {
      this.loggerService.debug('Failed to fetch server configuration. Please contact your developer.')
    }
  }
}
