import MineSweeper from '../lib/mnswpr.js'
import * as pkg from '../package.json'

const version = import.meta.env.MODE === 'development'
  ? 'dev'
  : pkg.version

const mnswpr = new MineSweeper('app', version)
mnswpr.initialize()