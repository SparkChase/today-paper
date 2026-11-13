import { extension } from './extension-api.js'
import { imageKey, isPreparedImage } from './attachments.js'
import { dateKey, parseDay } from './dates.js'
import { hasPageEntries, initialNotebook, pageEntries, STORAGE_KEY } from './notebook.js'

const format = 'today-paper'
const version = 1
const validId = (value) => typeof value === 'string' && /^[\w-]{1,200}$/.test(value) &&
  !Object.hasOwn(Object.prototype, value)
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const tones = new Set(['yellow', 'pink', 'blue', 'green', 'peach'])
const invalid = () => { throw new Error('这个文件不是完整的「今天这张纸」备份。') }
const imageIds = (entry) => entry.imageIds ?? []

export function withNotebookLock(write) {
  return navigator.locks.request('today-paper-write', write)
}

export function makeBackup(storage) {
  const notebook = storage[STORAGE_KEY] ?? initialNotebook
  const images = {}
  for (const page of Object.values(notebook.pages)) {
    for (const entries of Object.values(page)) {
      for (const entry of entries) {
        for (const id of imageIds(entry)) {
          const src = storage[imageKey(id)]
          if (!isPreparedImage({ src })) throw new Error('有图片无法读取，暂时无法生成完整备份。')
          images[id] = src
        }
      }
    }
  }
  return { format, version, notebook: { sections: notebook.sections, pages: notebook.pages }, images }
}

export function readBackup(raw) {
  if (!isRecord(raw)) invalid()
  const legacy = !Object.hasOwn(raw, 'format')
  if (!legacy && (raw.format !== format || raw.version !== version)) {
    throw new Error('此备份格式不受支持，请确认扩展已更新。')
  }
  const notebook = legacy ? raw[STORAGE_KEY] : raw.notebook
  if (!isRecord(notebook) || !Array.isArray(notebook.sections) || !isRecord(notebook.pages) ||
      (!legacy && !isRecord(raw.images))) invalid()

  const sectionIds = new Set()
  const sections = notebook.sections.map((section) => {
    if (!isRecord(section)) invalid()
    const { id, title, kind, tone } = section
    if (!validId(id) || sectionIds.has(id) || typeof title !== 'string' || !title.trim() ||
        !['text', 'checklist'].includes(kind) || !tones.has(tone)) invalid()
    sectionIds.add(id)
    return { id, title, kind, tone }
  })

  const entryIds = new Set()
  const images = {}
  const pages = {}
  for (const [date, page] of Object.entries(notebook.pages)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || dateKey(parseDay(date)) !== date || !isRecord(page)) invalid()
    pages[date] = {}
    for (const [sectionId, entries] of Object.entries(page)) {
      if (!sectionIds.has(sectionId) || !Array.isArray(entries)) invalid()
      pages[date][sectionId] = entries.map((entry) => {
        if (!isRecord(entry) || !validId(entry.id) || entryIds.has(entry.id) ||
            typeof entry.text !== 'string' || typeof entry.done !== 'boolean' ||
            !Array.isArray(imageIds(entry)) ||
            (entry.copiedFrom !== undefined && !validId(entry.copiedFrom))) invalid()
        if (!entry.text.trim() && !imageIds(entry).length) invalid()
        entryIds.add(entry.id)
        for (const id of imageIds(entry)) {
          if (!validId(id)) invalid()
          const src = legacy ? raw[imageKey(id)] : raw.images[id]
          if (!isPreparedImage({ src })) invalid()
          images[id] = src
        }
        const clean = { id: entry.id, text: entry.text, done: entry.done, imageIds: imageIds(entry) }
        if (entry.copiedFrom) clean.copiedFrom = entry.copiedFrom
        return clean
      })
    }
  }
  return { sections, pages, images }
}

async function importId(parts) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(parts)))
  return 'import-' + Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function mergeSections(sections, incoming) {
  const sectionMap = new Map()
  const original = [...sections]
  const titles = new Set(sections.map(({ title }) => title.toLowerCase()))
  for (const section of incoming) {
    const same = original.find((item) => item.id === section.id && item.kind === section.kind) ??
      original.find((item) => item.title.toLowerCase() === section.title.toLowerCase() && item.kind === section.kind)
    if (same) {
      sectionMap.set(section.id, same.id)
      continue
    }
    let id = section.id
    let title = section.title
    for (let suffix = 2; sections.some((item) => item.id === id); suffix++) {
      id = section.id.slice(0, 185) + '-import-' + suffix
    }
    for (let suffix = 1; titles.has(title.toLowerCase()); suffix++) {
      const alias = sections.find((item) => item.title.toLowerCase() === title.toLowerCase() && item.kind === section.kind)
      if (alias) {
        sectionMap.set(section.id, alias.id)
        break
      }
      title = section.title + (suffix === 1 ? '（导入）' : '（导入 ' + suffix + '）')
    }
    if (sectionMap.has(section.id)) continue
    sections.push({ ...section, id, title })
    sectionMap.set(section.id, id)
    titles.add(title.toLowerCase())
  }
  return sectionMap
}

const content = (entry) => JSON.stringify([entry.text, entry.done, imageIds(entry)])

export async function planImport(storage, backup) {
  const before = storage[STORAGE_KEY] ?? initialNotebook
  const next = structuredClone(before)
  const sections = mergeSections(next.sections, backup.sections)
  const assets = {}
  const mappedImages = new Map()
  for (const [id, src] of Object.entries(backup.images)) {
    let target = id
    for (let attempt = 0; ; attempt++) {
      const existing = assets[imageKey(target)] ?? storage[imageKey(target)]
      if (existing == null || existing === src) {
        if (existing == null) assets[imageKey(target)] = src
        break
      }
      target = await importId(['image', id, src, attempt])
    }
    mappedImages.set(id, target)
  }

  const existingIds = new Map()
  for (const [date, page] of Object.entries(next.pages)) {
    for (const [sectionId, entries] of Object.entries(page)) {
      for (const entry of entries) existingIds.set(entry.id, { date, sectionId, entry })
    }
  }
  const copiedFrom = new Map()
  const added = []
  const summary = { pages: 0, entries: 0, conflicts: 0, sections: next.sections.length - before.sections.length }
  for (const [date, page] of Object.entries(backup.pages)) {
    let addedOnDate = false
    for (const [sourceId, entries] of Object.entries(page)) {
      const sectionId = sections.get(sourceId)
      for (const entry of entries) {
        const candidate = { ...entry, imageIds: entry.imageIds.map((id) => mappedImages.get(id)) }
        const same = (match) => match.date === date && match.sectionId === sectionId &&
          content(match.entry) === content(candidate)
        const conflict = existingIds.has(candidate.id)
        for (let attempt = 0; existingIds.has(candidate.id) && !same(existingIds.get(candidate.id)); attempt++) {
          candidate.id = await importId(['entry', date, sectionId, entry.id, content(candidate), attempt])
        }
        copiedFrom.set(entry.id, candidate.id)
        if (existingIds.has(candidate.id)) continue
        const destination = (next.pages[date] ??= {})
        const entriesOnDate = (destination[sectionId] ??= [])
        entriesOnDate.push(candidate)
        existingIds.set(candidate.id, { date, sectionId, entry: candidate })
        added.push(candidate)
        summary.entries++
        if (conflict) summary.conflicts++
        addedOnDate = true
      }
    }
    if (addedOnDate && !hasPageEntries(before.pages[date])) summary.pages++
  }
  for (const entry of added) {
    if (entry.copiedFrom) entry.copiedFrom = copiedFrom.get(entry.copiedFrom) ?? entry.copiedFrom
  }
  const additions = {}
  for (const entry of added) {
    for (const id of entry.imageIds) {
      const key = imageKey(id)
      if (Object.hasOwn(assets, key)) additions[key] = assets[key]
    }
  }
  return { revision: before.revision, summary, next, additions }
}

export async function previewImport(backup) {
  return planImport(await extension.storage.local.get(null), backup)
}

export async function commitImport(backup, revision) {
  return withNotebookLock(async () => {
    const plan = await previewImport(backup)
    if (plan.revision !== revision) return { plan }
    if (plan.summary.entries || plan.summary.sections) {
      plan.next.revision = revision + 1
      await extension.storage.local.set({ [STORAGE_KEY]: plan.next, ...plan.additions })
    }
    return { summary: plan.summary }
  })
}
