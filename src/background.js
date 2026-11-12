import { withNotebookLock } from './backup.js'
import { attachmentChanges, initialNotebook, STORAGE_KEY, UPDATE_NOTEBOOK, updateNotebook } from './notebook.js'

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error)
})

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== UPDATE_NOTEBOOK || sender.id !== chrome.runtime.id) return false

  const write = withNotebookLock(async () => {
    const saved = await chrome.storage.local.get(STORAGE_KEY)
    const notebook = saved[STORAGE_KEY] ?? initialNotebook
    const updated = updateNotebook(notebook, message.action)
    if (updated !== notebook) {
      const { additions, removedKeys } = attachmentChanges(notebook, updated, message.action)
      // Commit the note and its new attachments in one write. A failed cleanup
      // can leave a null value, but cannot leave a live note without an image.
      const discarded = Object.fromEntries(removedKeys.map((key) => [key, null]))
      await chrome.storage.local.set({ [STORAGE_KEY]: updated, ...additions, ...discarded })
      if (removedKeys.length) await chrome.storage.local.remove(removedKeys).catch(console.warn)
    }
    return updated
  })
  write.then(
    (notebook) => respond({ notebook }),
    (error) => respond({ error: error.message }),
  )
  return true
})
