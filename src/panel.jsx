import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from '@/components/ui/button'
import { Doodle } from '@/components/ui/doodle'
import { Icon } from '@/components/ui/icon'
import { Paper } from '@/components/ui/paper'
import { Tape } from '@/components/ui/tape'
import { InkProvider } from '@/lib/ink/react'
import '../vendor/looseleaf/styles/looseleaf.css'
import './panel.css'
import { offsetDay, parseDay } from './dates.js'
import { pageEntries } from './notebook.js'
import { NoteSection } from './notes.jsx'
import { useNotebook, useToday } from './use-notebook.js'

const edge = { left: 'torn', bottom: 'deckle' }
const formatDate = new Intl.DateTimeFormat('zh-CN', {
  month: 'long', day: 'numeric', weekday: 'short',
})
const formatFullDate = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
})

function DateNavigation({ date, today, select }) {
  const picker = useRef(null)
  const current = date === today
  const formatted = formatDate.format(parseDay(date))
  return (
    <nav className="day-navigation" aria-label="翻页">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="前一天"
        onClick={() => select(offsetDay(date, -1))}
      >
        <Icon name="chevron-left" />
      </Button>
      <div className="date-control">
        <button
          type="button"
          className="date-button"
          aria-label={`选择日期，当前为${formatFullDate.format(parseDay(date))}`}
          onClick={() => picker.current.showPicker()}
        >
          <Icon name="calendar" size={16} />
          <time dateTime={date}>{formatted}</time>
          {date.slice(0, 4) !== today.slice(0, 4) && <span>{date.slice(0, 4)}年</span>}
        </button>
        <input
          ref={picker}
          className="date-picker"
          type="date"
          aria-label="跳转到日期"
          tabIndex={-1}
          value={date}
          max={today}
          onChange={(event) => {
            if (event.target.value && event.target.value <= today) select(event.target.value)
          }}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="后一天"
        disabled={current}
        onClick={() => select(offsetDay(date, 1))}
      >
        <Icon name="chevron-right" />
      </Button>
    </nav>
  )
}

function NewSection({ onClose, save }) {
  const dialog = useRef(null)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState('text')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { dialog.current.showModal() }, [])

  async function submit(event) {
    event.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      await save({ type: 'add-section', title, kind, sectionId: crypto.randomUUID() })
      onClose()
    } catch (issue) {
      setError(issue.message || '暂时无法保存。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={dialog}
      className="section-dialog"
      aria-labelledby="new-section-title"
      onClose={onClose}
      onCancel={(event) => { if (busy) event.preventDefault() }}
    >
      <form onSubmit={submit}>
        <h2 id="new-section-title">加一个区域</h2>
        <label className="field-label" htmlFor="section-title">区域名称</label>
        <input
          id="section-title"
          autoFocus
          placeholder="比如「选题灵感」"
          value={title}
          maxLength={36}
          onChange={(event) => { setTitle(event.target.value); setError('') }}
        />
        <fieldset>
          <legend className="field-label">记录方式</legend>
          <div className="section-types">
            <label><input type="radio" name="kind" checked={kind === 'text'} onChange={() => setKind('text')} />文字</label>
            <label><input type="radio" name="kind" checked={kind === 'checklist'} onChange={() => setKind('checklist')} />可勾选</label>
          </div>
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="composer-actions">
          <button type="button" className="text-action" disabled={busy} onClick={() => dialog.current.close()}>取消</button>
          <Button type="submit" size="sm" variant="secondary" disabled={busy || !title.trim()}>添加</Button>
        </div>
      </form>
    </dialog>
  )
}

function App() {
  const { notebook, loadError, save } = useNotebook()
  const today = useToday()
  const [selected, setSelected] = useState(null)
  const [addingSection, setAddingSection] = useState(false)
  const [error, setError] = useState('')
  const date = selected ?? today
  const current = date === today
  const activeSections = notebook?.sections.filter((section) =>
    current || pageEntries(notebook, date, section.id).length > 0,
  )
  const copiedIds = new Set(Object.values(notebook?.pages[today] ?? {}).flatMap(
    (entries) => entries.map((entry) => entry.copiedFrom),
  ))

  function select(key) {
    setSelected(key === today ? null : key)
    setError('')
  }

  async function saveEntry(action) {
    setError('')
    try {
      await save(action)
      return true
    } catch (issue) {
      setError(issue.message || '暂时无法保存。')
      return false
    }
  }

  return (
    <main className="desk">
      <DateNavigation date={date} today={today} select={select} />
      <div className="sheet-stack">
        <Paper className="notebook-sheet" as="article" seed="today-paper" edge={edge} tilt={false}>
          <Tape className="paper-tape" kind="masking" length={70} height={18} angle={-7} seed="tape" />
          <header className="sheet-header">
            <h1>今天这张纸</h1>
            <Doodle className="pencil-doodle" name="pencil" size={55} rotate={-11} seed="header-pencil" />
          </header>
          {!current && (
            <div className="past-actions">
              <button type="button" className="text-action return-action" onClick={() => select(today)}>
                <Icon name="arrow-right" size={15} />回到今天
              </button>
            </div>
          )}
          {error && (
            <p className="form-error save-error" role="alert">
              {error}
              <button type="button" aria-label="关闭错误提示" onClick={() => setError('')}>×</button>
            </p>
          )}
          {notebook ? (
            <>
              {activeSections.length === 0 && (
                <div className="empty-day">
                  <Doodle name="cup" size={46} />
                  <p>这天没有写东西。</p>
                </div>
              )}
              {activeSections.map((section) => (
                <NoteSection
                  key={`${date}-${section.id}`}
                  section={section}
                  entries={pageEntries(notebook, date, section.id)}
                  date={date}
                  current={current}
                  copiedIds={copiedIds}
                  save={saveEntry}
                />
              ))}
              {current && (
                <div className="sheet-footer">
                  <button type="button" className="add-section" onClick={() => setAddingSection(true)}>
                    <Icon name="plus" size={16} />加一个区域
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="loading" role={loadError ? 'alert' : 'status'}>
              {loadError ? '暂时无法打开这张纸。请重新打开侧栏。' : '正在打开这张纸…'}
            </p>
          )}
        </Paper>
      </div>
      {addingSection && <NewSection onClose={() => setAddingSection(false)} save={save} />}
    </main>
  )
}

createRoot(document.getElementById('root')).render(
  <InkProvider>
    <App />
  </InkProvider>,
)
