import { strToU8, zipSync } from 'fflate'
import { imageKey, isPreparedImage } from './attachments.js'
import { withNotebookLock } from './backup.js'
import { extension } from './extension-api.js'
import { noteParts } from './note-links.js'
import { initialNotebook, pageEntries, STORAGE_KEY } from './notebook.js'

function escapeMarkdown(text) {
  return text
    .replace(/[\\`*_{}\[\]<>|~&]/g, '\\$&')
    .replace(/^([#+-])/gm, '\\$1')
    .replace(/^(\d+)([.)])(?=\s)/gm, '$1\\$2')
}

function noteMarkdown(text) {
  return noteParts(text.replace(/\r\n?/g, '\n')).map(({ text, url }) => (
    url ? `<${url}>` : escapeMarkdown(text)
  )).join('').replace(/([^\n])\n(?=[^\n])/g, '$1  \n')
}

async function readPages(dates, sectionIds) {
  return withNotebookLock(async () => {
    const saved = await extension.storage.local.get(STORAGE_KEY)
    const notebook = saved[STORAGE_KEY] ?? initialNotebook
    const sections = notebook.sections.filter(({ id }) => !sectionIds || sectionIds.has(id))
    const pages = dates.map((date) => ({
      date,
      sections: sections.map((section) => ({ ...section, entries: pageEntries(notebook, date, section.id) }))
        .filter(({ entries }) => entries.length),
    })).filter(({ sections }) => sections.length)
    if (pages.length !== dates.length) throw new Error('纸页内容刚有变动，请核对后重新导出。')
    const ids = new Set()
    for (const { sections } of pages) {
      for (const { entries } of sections) {
        for (const entry of entries) {
          for (const id of entry.imageIds ?? []) ids.add(id)
        }
      }
    }
    const images = ids.size ? await extension.storage.local.get(Array.from(ids, imageKey)) : {}
    return { pages, images, ids }
  })
}

export async function makeMarkdownExport(dates, sectionIds) {
  if (!dates.length) throw new Error('没有可导出的纸页。')
  const { pages, images, ids } = await readPages(dates, sectionIds)
  const files = {}
  const attachments = new Map()
  let imageIndex = 0
  for (const id of ids) {
    const src = images[imageKey(id)]
    if (!isPreparedImage({ src })) throw new Error('有图片无法读取，暂时无法完整导出。')
    const path = `attachments/image-${++imageIndex}.webp`
    attachments.set(id, path)
    try {
      const bytes = atob(src.slice('data:image/webp;base64,'.length))
      files[path] = Uint8Array.from(bytes, (char) => char.charCodeAt(0))
    } catch {
      throw new Error('有图片无法读取，暂时无法完整导出。')
    }
  }

  for (const { date, sections } of pages) {
    const content = [`# ${date}`]
    for (const { title, kind, entries } of sections) {
      content.push(`## ${escapeMarkdown(title.replace(/\s+/g, ' '))}`)
      for (const { text, done, imageIds = [] } of entries) {
        const markdown = noteMarkdown(text)
        const pictures = imageIds.map((id) => `![记录图片](${attachments.get(id)})`)
        const body = [markdown, ...pictures].filter(Boolean).join('\n\n')
        if (kind === 'checklist') {
          const marker = done ? '- [x] ' : '- [ ] '
          content.push(marker + body.replace(/\n(?=[^\n])/g, '\n  '))
        } else {
          content.push(body)
        }
      }
    }
    files[`${date}.md`] = strToU8(content.join('\n\n') + '\n')
  }

  const first = pages[0].date
  if (pages.length === 1 && !ids.size) {
    return { blob: new Blob([files[`${first}.md`]], { type: 'text/markdown;charset=utf-8' }), filename: `${first}.md` }
  }
  const entries = Object.values(files)
  if (entries.length >= 65535 || entries.reduce((size, entry) => size + entry.length + 256, 0) >= 0xffffffff) {
    throw new Error('文件太多或太大，请缩小日期范围后重新导出。')
  }
  const last = pages.at(-1).date
  const range = first === last ? first : `${first}至${last}`
  return {
    blob: new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }),
    filename: `今天这张纸-${range}.zip`,
  }
}
