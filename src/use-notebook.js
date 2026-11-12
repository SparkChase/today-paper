import { useEffect, useState } from 'react'
import { dateKey, offsetDay, parseDay } from './dates.js'
import { initialNotebook, STORAGE_KEY, UPDATE_NOTEBOOK } from './notebook.js'

export function useNotebook() {
  const [notebook, setNotebook] = useState(null)
  const [loadError, setLoadError] = useState(false)

  function receive(updated) {
    setNotebook((previous) => (
      previous && previous.revision > updated.revision ? previous : updated
    ))
  }

  useEffect(() => {
    function onChange(changes, area) {
      if (area === 'local' && changes[STORAGE_KEY]) {
        const updated = changes[STORAGE_KEY].newValue
        if (updated) receive(updated)
        else setNotebook(initialNotebook)
      }
    }

    chrome.storage.onChanged.addListener(onChange)
    chrome.storage.local.get(STORAGE_KEY).then(
      (saved) => receive(saved[STORAGE_KEY] ?? initialNotebook),
      () => setLoadError(true),
    )
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [])

  async function save(action) {
    const result = await chrome.runtime.sendMessage({ type: UPDATE_NOTEBOOK, action })
    if (!result?.notebook) throw new Error(result?.error || '暂时无法保存。')
    receive(result.notebook)
  }

  return { notebook, loadError, save }
}

export function useToday() {
  const [today, setToday] = useState(dateKey)

  useEffect(() => {
    let timer
    function update() {
      const key = dateKey()
      setToday(key)
      const midnight = parseDay(offsetDay(key, 1))
      midnight.setHours(0, 0, 0, 0)
      clearTimeout(timer)
      timer = setTimeout(update, midnight.getTime() - Date.now() + 100)
    }

    update()
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])

  return today
}
