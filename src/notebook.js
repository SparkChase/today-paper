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

function replaceEntries(notebook, date, sectionId, entries) {
  return {
    ...notebook,
    pages: {
      ...notebook.pages,
      [date]: { ...notebook.pages[date], [sectionId]: entries },
    },
  }
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
    const text = action.text.trim()
    if (!text) throw new Error('先写点内容。')
    return replaceEntries(notebook, date, sectionId, [
      ...entries, { id: entryId, text, done: false },
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
      ...destination, { id: action.copyId, text: entry.text, done: false, copiedFrom: entryId },
    ])
  }

  if (action.type === 'delete-entry') {
    return replaceEntries(notebook, date, sectionId, entries.filter((item) => item.id !== entryId))
  }

  const updatedEntry = { ...entry }
  if (action.type === 'set-checked') {
    if (section.kind !== 'checklist' || entry.done === action.done) return notebook
    updatedEntry.done = action.done
  } else if (action.type === 'edit-entry') {
    updatedEntry.text = action.text.trim()
    if (!updatedEntry.text) throw new Error('先写点内容。')
    if (updatedEntry.text === entry.text) return notebook
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
