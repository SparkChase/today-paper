import { extension } from './extension-api.js'
import { withNotebookLock } from './backup.js'
import { attachmentChanges, initialNotebook, STORAGE_KEY, UPDATE_NOTEBOOK, updateNotebook } from './notebook.js'

if (extension.sidebarAction) {
  extension.action.onClicked.addListener(() => {
    extension.sidebarAction.toggle().catch(console.error)
  })
} else {
  extension.runtime.onInstalled.addListener(() => {
    extension.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error)
  })
}

extension.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== UPDATE_NOTEBOOK || sender.id !== extension.runtime.id) return false

  const write = withNotebookLock(async () => {
    const saved = await extension.storage.local.get(STORAGE_KEY)
    const notebook = saved[STORAGE_KEY] ?? initialNotebook
    const updated = updateNotebook(notebook, message.action)
    if (updated !== notebook) {
      const { additions, removedKeys } = attachmentChanges(notebook, updated, message.action)
      // Commit the note and its new attachments in one write. A failed cleanup
      // can leave a null value, but cannot leave a live note without an image.
      const discarded = Object.fromEntries(removedKeys.map((key) => [key, null]))
      await extension.storage.local.set({ [STORAGE_KEY]: updated, ...additions, ...discarded })
      if (removedKeys.length) await extension.storage.local.remove(removedKeys).catch(console.warn)
    }
    return updated
  })
  write.then(
    (notebook) => respond({ notebook }),
    (error) => respond({ error: error.message }),
  )
  return true
})
