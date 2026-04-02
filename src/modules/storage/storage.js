export class StorageService {

  constructor() {
  }
    
  saveToLocal(key, value) {
    localStorage.setItem(key, JSON.stringify(value))
  }

  saveToSession(key, value) {
    sessionStorage.setItem(key, JSON.stringify(value))
  }

  getFromLocal(key) {
    const data = localStorage.getItem(key)
    if (data !== 'undefined') return JSON.parse(data)
  }

  getFromSession(key) {
    const data = sessionStorage.getItem(key)
    if (data !== 'undefined') return JSON.parse(data)
  }
}
