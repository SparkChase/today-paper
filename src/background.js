import { initialNotebook, STORAGE_KEY, UPDATE_NOTEBOOK, updateNotebook } from './notebook.js'

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error)
})

// Read and write inside the same queue so two open side panels can save independently.
let writes = Promise.resolve()

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== UPDATE_NOTEBOOK || sender.id !== chrome.runtime.id) return false

  const write = writes.then(async () => {
    const saved = await chrome.storage.local.get(STORAGE_KEY)
    const notebook = saved[STORAGE_KEY] ?? initialNotebook
    const updated = updateNotebook(notebook, message.action)
    if (updated !== notebook) {
      await chrome.storage.local.set({ [STORAGE_KEY]: updated })
    }
    return updated
  })
  writes = write.catch(() => {})
  write.then(
    (notebook) => respond({ notebook }),
    (error) => respond({ error: error.message }),
  )
  return true
})
