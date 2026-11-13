import { extension } from './extension-api.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { commitImport, makeBackup, previewImport, readBackup } from './backup.js'
import { dateKey, offsetDay, parseDay } from './dates.js'
import { downloadFile } from './download.js'
import { makeMarkdownExport } from './markdown-export.js'
import { pageEntries, writtenDates } from './notebook.js'
import { makeShareImage } from './share-image.js'

function ToolDialog({ title, onClose, busy, children }) {
  const dialog = useRef(null)
  useEffect(() => { dialog.current.showModal() }, [])

  return (
    <dialog
      ref={dialog}
      className="paper-tool"
      aria-labelledby="paper-tool-title"
      onClose={onClose}
      onCancel={(event) => { if (busy) event.preventDefault() }}
    >
      <div className="paper-tool-header">
        <h2 id="paper-tool-title">{title}</h2>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="返回这页" disabled={busy}
          onClick={() => dialog.current.close()}>
          <Icon name="x" />
        </Button>
      </div>
      {children}
    </dialog>
  )
}

function useMarkdownDownload() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function saveMarkdown(dates, sectionIds) {
    setBusy(true)
    setError('')
    try {
      const { blob, filename } = await makeMarkdownExport(dates, sectionIds)
      downloadFile(blob, filename)
    } catch (issue) {
      setError(issue.message || '暂时无法导出 Markdown。')
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, saveMarkdown }
}

const historyDay = new Intl.DateTimeFormat('zh-CN', {
  month: 'long', day: 'numeric', weekday: 'short',
})
const historyMonth = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' })
const historyBatch = 40
const searchable = (text) => text.normalize('NFKC').toLowerCase()

function findHistory(notebook, dates, query) {
  const months = []
  for (const date of dates) {
    let match = ''
    let count = 0
    const matchesDate = date.includes(query)
    for (const section of notebook.sections) {
      const entries = pageEntries(notebook, date, section.id)
      count += entries.length
      if (match || entries.length === 0) continue
      const matchesTitle = searchable(section.title).includes(query)
      const entry = matchesDate || matchesTitle
        ? entries[0]
        : entries.find(({ text }) => searchable(text).includes(query))
      if (entry) match = entry.text || `${section.title} · 图片`
    }
    if (!match) continue
    const month = date.slice(0, 7)
    if (months.at(-1)?.month !== month) months.push({ month, pages: [] })
    months.at(-1).pages.push({ date, count, match })
  }
  return months
}

export function HistoryDialog({ notebook, today, onOpenDate, onClose }) {
  const markdown = useMarkdownDownload()
  const [query, setQuery] = useState('')
  const [days, setDays] = useState(0)
  const [limit, setLimit] = useState(historyBatch)
  const dates = useMemo(() => writtenDates(notebook).reverse().filter((date) => date <= today), [notebook, today])
  const since = days ? offsetDay(today, 1 - days) : ''
  const months = useMemo(
    () => findHistory(notebook, dates.filter((date) => date >= since), searchable(query.trim())),
    [notebook, dates, since, query],
  )
  const total = months.reduce((sum, { pages }) => sum + pages.length, 0)
  let remaining = limit

  return (
    <ToolDialog title="翻旧纸" onClose={onClose} busy={markdown.busy}>
      <div className="history-filters">
        <input type="search" aria-label="搜索旧纸" placeholder="搜索笔记、分区或日期" disabled={markdown.busy}
          value={query} onChange={(event) => { setQuery(event.target.value); setLimit(historyBatch) }} />
        <select aria-label="日期范围" value={days} disabled={markdown.busy}
          onChange={(event) => { setDays(Number(event.target.value)); setLimit(historyBatch) }}>
          <option value={0}>全部日期</option>
          <option value={7}>最近 7 天</option>
          <option value={30}>最近 30 天</option>
        </select>
      </div>
      <p className="history-count" role="status">
        {total ? `${total} 页` : dates.length ? '没找到符合条件的纸页。' : '还没有写过的纸页。'}
      </p>
      {total > 0 && (
        <div className="paper-tool-actions history-export">
          <Button type="button" size="sm" variant="outline" disabled={markdown.busy}
            onClick={() => markdown.saveMarkdown(months.flatMap(({ pages }) => pages.map(({ date }) => date)).reverse())}>
            <Icon name="download" />{markdown.busy ? '正在导出…' : `导出 ${total} 页 Markdown`}
          </Button>
        </div>
      )}
      {markdown.error && <p className="form-error" role="alert">{markdown.error}</p>}
      {months.map(({ month, pages }) => {
        const visible = pages.slice(0, Math.max(0, remaining))
        remaining -= visible.length
        if (!visible.length) return null
        const label = historyMonth.format(parseDay(pages[0].date))
        return (
          <section className="history-month" key={month} aria-label={label}>
            <h3>{label}</h3>
            <ul>
              {visible.map(({ date, count, match }) => (
                <li key={date}>
                  <button type="button" className="history-page" disabled={markdown.busy} onClick={() => onOpenDate(date)}>
                    <span className="history-page-label">
                      <time dateTime={date}>{historyDay.format(parseDay(date))}</time>
                      <span>{count} 条</span>
                    </span>
                    <span className="history-preview">{match}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      {total > limit && <button type="button" className="text-action history-more"
        onClick={() => setLimit((count) => count + historyBatch)}>再翻一些</button>}
    </ToolDialog>
  )
}

export function BackupDialog({ notebook, onClose }) {
  const picker = useRef(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const dates = writtenDates(notebook)

  async function run(task) {
    setBusy(true)
    setStatus('')
    setError('')
    try {
      await task()
    } catch (issue) {
      setError(issue instanceof SyntaxError ? '这个文件不是可读取的 JSON 备份。' : issue.message)
    } finally {
      setBusy(false)
    }
  }

  function exportBackup() {
    run(async () => {
      const snapshot = makeBackup(await extension.storage.local.get(null))
      downloadFile(new Blob([JSON.stringify(snapshot)], { type: 'application/json' }), `今天这张纸-备份-${dateKey()}.json`)
      setStatus('已生成备份文件。')
    })
  }

  function chooseBackup(event) {
    const file = event.target.files[0]
    event.target.value = ''
    if (!file) return
    setPreview(null)
    run(async () => {
      const backup = readBackup(JSON.parse(await file.text()))
      const { summary, revision } = await previewImport(backup)
      setPreview({ backup, filename: file.name, summary, revision })
    })
  }

  function merge() {
    run(async () => {
      const result = await commitImport(preview.backup, preview.revision)
      if (result.plan) {
        const { summary, revision } = result.plan
        setPreview({ ...preview, summary, revision })
        setStatus('笔记刚有变动，请核对更新后的预览。')
      } else {
        setPreview(null)
        setStatus(`已合并 ${result.summary.entries} 条记录。`)
      }
    })
  }

  return (
    <ToolDialog title="备份与导入" onClose={onClose} busy={busy}>
      <div className="archive-envelope">
        <div className="archive-label">
          <strong>今天这张纸</strong>
          <small>{dates.length ? `${dates[0]}${dates.length > 1 ? ' 至 ' + dates.at(-1) : ''} · ${dates.length} 页` : '还没有写过的页'}</small>
        </div>
      </div>
      <div className="paper-tool-actions">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => picker.current.click()}>
          <Icon name="folder-open" />导入备份
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={exportBackup}>
          <Icon name="download" />导出备份
        </Button>
        <input ref={picker} type="file" accept=".json,application/json" aria-label="选择备份文件"
          onChange={chooseBackup} hidden />
      </div>
      {preview && (
        <section className="import-receipt" aria-label="合并预览">
          <h3>合并预览</h3>
          <p>{preview.filename}</p>
          <dl>
            <div><dt>新增页</dt><dd>{preview.summary.pages} 页</dd></div>
            <div><dt>新增分区</dt><dd>{preview.summary.sections} 个</dd></div>
            <div><dt>带入记录</dt><dd>{preview.summary.entries} 条</dd></div>
            {preview.summary.conflicts > 0 && <div><dt>同一记录有改动</dt><dd>{preview.summary.conflicts} 条 · 保留两版</dd></div>}
          </dl>
          <div className="paper-tool-actions">
            <button type="button" className="text-action" disabled={busy} onClick={() => setPreview(null)}>取消</button>
            <Button type="button" size="sm" variant="secondary" onClick={merge}
              disabled={busy || !(preview.summary.entries || preview.summary.sections)}>确认合并</Button>
          </div>
          {!preview.summary.entries && !preview.summary.sections && <p>这份备份里的内容已经在本机。</p>}
        </section>
      )}
      {busy && <p className="tool-status" role="status">正在处理备份…</p>}
      {status && <p className="tool-status" role="status">{status}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </ToolDialog>
  )
}

export function ShareDialog({ notebook, date, onClose }) {
  const markdown = useMarkdownDownload()
  const [selected, setSelected] = useState(() => new Set(
    pageEntries(notebook, date, 'tasks').length ? ['tasks'] : [],
  ))
  const [image, setImage] = useState(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    let active = true
    let url
    setImage(null)
    setError('')
    setStatus('')
    const included = notebook.sections.filter(({ id }) => selected.has(id))
      .map((section) => ({ section, entries: pageEntries(notebook, date, section.id) }))
      .filter(({ entries }) => entries.length > 0)
    if (included.length > 0) {
      makeShareImage(date, included).then((blob) => {
        if (!active) return
        url = URL.createObjectURL(blob)
        setImage({ blob, url, selected, date, notebook })
      }).catch((issue) => {
        if (active) setError(issue.message)
      })
    }
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [notebook, date, selected])

  const ready = image && image.selected === selected && image.date === date && image.notebook === notebook
  const options = notebook.sections.filter(({ id }) => pageEntries(notebook, date, id).length)
  const hasSelection = options.some(({ id }) => selected.has(id))

  function toggle(id, checked) {
    setSelected((previous) => {
      const next = new Set(previous)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function copy() {
    setStatus('')
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': image.blob })])
      setStatus('已复制图片。')
    } catch {
      setStatus('暂时无法复制，可以下载 PNG。')
    }
  }

  return (
    <ToolDialog title="分享这页" onClose={onClose} busy={markdown.busy}>
      <div className="share-options" role="group" aria-label="要分享的分区">
        {options.map(({ id, title }) => (
          <label key={id}>
            <input type="checkbox" checked={selected.has(id)} disabled={markdown.busy}
              onChange={(event) => toggle(id, event.target.checked)} />
            {title}
          </label>
        ))}
      </div>
      {ready && <img className="share-preview" src={image.url} alt="分享长图预览" />}
      {!ready && !error && (
        <p className="tool-status" role="status">{hasSelection ? '正在生成图片…' : '选一个分区，就能预览分享图。'}</p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      {markdown.error && <p className="form-error" role="alert">{markdown.error}</p>}
      <div className="paper-tool-actions share-tools">
        <Button type="button" size="sm" variant="outline" disabled={!hasSelection || markdown.busy}
          onClick={() => markdown.saveMarkdown([date], selected)}>
          <Icon name="download" />{markdown.busy ? '正在导出…' : '导出 Markdown'}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!ready}
          onClick={() => downloadFile(image.blob, `今天这张纸-${date}.png`)}>
          <Icon name="download" />下载 PNG
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={!ready} onClick={copy}>
          <Icon name="copy" />复制图片
        </Button>
      </div>
      {status && <p className="tool-status" role="status">{status}</p>}
    </ToolDialog>
  )
}
