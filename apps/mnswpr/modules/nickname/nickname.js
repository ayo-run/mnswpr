import { StorageService } from '@cozy-games/utils'

const NICK_KEY = 'nickname'
const MAX_LENGTH = 24

/**
 * A few friendly greetings; `{nick}` is replaced with the player's nickname.
 */
const GREETINGS = [
  'Welcome back, {nick}!',
  'Good to see you, {nick}!',
  'Hey {nick}, ready to sweep?',
  'Let\'s go, {nick}!',
  'Happy sweeping, {nick}!',
  'Nice to have you, {nick}!'
]

/**
 * Owns the player's display nickname: prompts for it once on first visit,
 * persists it in localStorage, and renders a friendly greeting bar. The
 * leaderboard package stays name-agnostic — the app passes this nickname in.
 */
export class NicknameService {

  constructor() {
    this.storage = new StorageService()
  }

  /**
   * The stored nickname, or 'Anonymous' if none has been set yet.
   * @returns {String}
   */
  get() {
    return this.storage.getFromLocal(NICK_KEY) || 'Anonymous'
  }

  /**
   * Prompt for a nickname the first time only — used on page load.
   */
  ensure() {
    if (!this.storage.getFromLocal(NICK_KEY)) {
      this.prompt()
    }
  }

  /**
   * Ask for a nickname and persist it (trimmed, capped). Cancelling keeps the
   * current value. A failing/unsupported prompt must never break page load, so
   * it is guarded — the player just stays 'Anonymous'.
   */
  prompt() {
    let next
    try {
      next = window.prompt('Pick a nickname for the leaderboard', this.storage.getFromLocal(NICK_KEY) || '')
    } catch {
      return
    }
    if (next && next.trim()) {
      this.storage.saveToLocal(NICK_KEY, next.trim().slice(0, MAX_LENGTH))
    }
  }

  /**
   * Render the greeting bar into a container. Clicking the nickname (or the
   * pencil) re-prompts and re-renders in place.
   * @param {HTMLElement} container
   */
  render(container) {
    if (!container) return
    container.innerHTML = ''

    const template = GREETINGS[Math.floor(Math.random() * GREETINGS.length)]
    const [before, after] = template.split('{nick}')

    const nameElement = document.createElement('span')
    nameElement.innerText = this.get()
    nameElement.style.fontWeight = 'bold'
    nameElement.style.fontStyle = 'italic'
    nameElement.style.cursor = 'pointer'
    nameElement.style.textDecoration = 'underline'
    nameElement.style.textDecorationColor = 'orange'
    nameElement.setAttribute('title', 'Click to change your nickname')

    const icon = document.createElement('span')
    icon.innerText = ' ✏️'
    icon.style.cursor = 'pointer'
    icon.style.fontSize = '0.8em'
    icon.style.opacity = '0.6'
    icon.setAttribute('title', 'Click to change your nickname')

    const change = () => {
      this.prompt()
      this.render(container)
    }
    nameElement.onclick = change
    icon.onclick = change

    container.append(document.createTextNode(before), nameElement, icon, document.createTextNode(after))
  }
}
