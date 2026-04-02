import './minesweeper.css'
import './modules/loading/loading.css'
import '../public/favicon.ico'
import Minesweeper from './minesweeper.js'

const myMinesweeper = new Minesweeper('app')
myMinesweeper.initialize()
