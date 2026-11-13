import { imageKey, isPreparedImage } from './attachments.js'
import { dateKey } from './dates.js'

export const STORAGE_KEY = 'todayPaper'
export const UPDATE_NOTEBOOK = 'update-notebook'

export const initialNotebook = {
  revision: 0,
  sections: [
    { id: 'scratch', title: '随手记', kind: 'text', tone: 'yellow' },
    { id: 'thoughts', title: '感想', kind: 'text', tone: 'pink' },
    { id: 'reading', title: '待看', kind: 'checklist', tone: 'blue' },
    { id: 'tasks', title: '待办', kind: 'checklist', tone: 'green' },
  ],
  pages: {},
}

const tones = ['yellow', 'pink', 'blue', 'green', 'peach']

export function pageEntries(notebook, date, sectionId) {
  return notebook.pages[date]?.[sectionId] ?? []
}

export function hasPageEntries(page) {
  return Object.values(page ?? {}).some((entries) => entries.length > 0)
}

export function writtenDates(notebook) {
  return Object.keys(notebook.pages).filter((date) => hasPageEntries(notebook.pages[date])).sort()
}

function replaceEntries(notebook, date, sectionId, entries) {
  return {
    ...notebook,
    pages: {
      ...notebook.pages,
      [date]: { ...notebook.pages[date], [sectionId]: entries },
    },
  }
}

function entryContent(action, entry) {
  const text = action.text.trim()
  const attachments = action.attachments ?? (entry?.imageIds ?? []).map((id) => ({ id }))
  const existing = new Set(entry?.imageIds)
  for (const attachment of attachments) {
    if (attachment.src ? !isPreparedImage(attachment) : !existing.has(attachment.id)) {
      throw new Error('图片已变动，请重新打开这条记录再试。')
    }
  }
  const imageIds = attachments.map(({ id }) => id)
  if (!text && imageIds.length === 0) throw new Error('先写点内容，或粘贴一张图片。')
  return { text, imageIds }
}

function applyChange(notebook, action) {
  if (action.type === 'add-section') {
    const title = action.title.trim()
    if (!title) throw new Error('先给这个区域起个名字。')
    if (notebook.sections.some((section) => section.title.toLowerCase() === title.toLowerCase())) {
      throw new Error('已经有同名的区域了。')
    }
    const section = {
      id: action.sectionId,
      title,
      kind: action.kind,
      tone: tones[notebook.sections.length % tones.length],
    }
    return { ...notebook, sections: [...notebook.sections, section] }
  }

  const { date, sectionId, entryId } = action
  const section = notebook.sections.find((item) => item.id === sectionId)
  if (!section) throw new Error('这个区域已找不到。')

  const entries = pageEntries(notebook, date, sectionId)

  if (action.type === 'add-entry') {
    if (entries.some((entry) => entry.id === entryId)) return notebook
    const content = entryContent(action)
    return replaceEntries(notebook, date, sectionId, [
      ...entries, { id: entryId, ...content, done: false },
    ])
  }

  const entry = entries.find((item) => item.id === entryId)
  if (!entry) {
    if (action.type === 'delete-entry') return notebook
    throw new Error('这条记录已找不到。')
  }

  if (action.type === 'copy-entry') {
    const today = dateKey()
    if (date === today) return notebook
    const destination = pageEntries(notebook, today, sectionId)
    if (destination.some((item) => item.copiedFrom === entryId)) return notebook
    return replaceEntries(notebook, today, sectionId, [
      ...destination, { id: action.copyId, text: entry.text, imageIds: entry.imageIds ?? [], done: false, copiedFrom: entryId },
    ])
  }

  if (action.type === 'delete-entry') {
    return replaceEntries(notebook, date, sectionId, entries.filter((item) => item.id !== entryId))
  }

  let updatedEntry
  if (action.type === 'set-checked') {
    if (section.kind !== 'checklist' || entry.done === action.done) return notebook
    updatedEntry = { ...entry, done: action.done }
  } else if (action.type === 'edit-entry') {
    const content = entryContent(action, entry)
    const originalIds = entry.imageIds ?? []
    if (content.text === entry.text && content.imageIds.length === originalIds.length &&
        content.imageIds.every((id, index) => id === originalIds[index])) return notebook
    updatedEntry = { ...entry, ...content }
  } else {
    throw new Error('无法识别这项操作。')
  }
  return replaceEntries(notebook, date, sectionId, entries.map((item) =>
    item.id === entryId ? updatedEntry : item,
  ))
}

export function updateNotebook(notebook, action) {
  const updated = applyChange(notebook, action)
  return updated === notebook ? notebook : { ...updated, revision: notebook.revision + 1 }
}

export function attachmentChanges(previous, updated, action) {
  const additions = {}
  if (action.type === 'add-entry' || action.type === 'edit-entry') {
    for (const { id, src } of action.attachments ?? []) {
      if (src) additions[imageKey(id)] = src
    }
  }

  if (action.type !== 'edit-entry' && action.type !== 'delete-entry') {
    return { additions, removedKeys: [] }
  }
  const { date, sectionId, entryId } = action
  const before = pageEntries(previous, date, sectionId).find((entry) => entry.id === entryId)
  if (!before?.imageIds?.length) return { additions, removedKeys: [] }

  const stillUsed = new Set()
  for (const page of Object.values(updated.pages)) {
    for (const entries of Object.values(page)) {
      for (const entry of entries) {
        for (const id of entry.imageIds ?? []) stillUsed.add(id)
      }
    }
  }
  const removedKeys = before.imageIds.filter((id) => !stillUsed.has(id)).map(imageKey)
  return { additions, removedKeys }
}
