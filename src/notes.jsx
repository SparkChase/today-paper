import { Fragment, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Stamp } from '@/components/ui/stamp'
import { clipboardImages, imageKey, prepareImage } from './attachments.js'

const prompts = {
  scratch: '记下刚想到的事',
  thoughts: '写一段今天的感想',
  reading: '记一个想看的东西，或贴个链接',
  tasks: '加一件要做的事',
}

const urlPattern = /(https?:\/\/[^\s<>"，。！？；、（）【】]+)/gi

function NoteText({ text }) {
  return text.split(urlPattern).map((part, index) => {
    if (index % 2 === 0) return <Fragment key={index}>{part}</Fragment>
    const url = part.replace(/[.,;!?]+$/, '')
    return (
      <Fragment key={index}>
        <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
        {part.slice(url.length)}
      </Fragment>
    )
  })
}

function AttachmentImage({ id, preview }) {
  const [stored, setStored] = useState(undefined)

  useEffect(() => {
    if (preview) return
    let active = true
    const key = imageKey(id)
    chrome.storage.local.get(key).then(
      (result) => { if (active) setStored(result[key] ?? null) },
      () => { if (active) setStored(null) },
    )
    return () => { active = false }
  }, [id, preview])

  const source = preview ?? stored
  if (source === undefined) return null
  if (source === null) return <span className="missing-image">图片暂时无法读取</span>
  return <img src={source} alt={preview ? '待保存的图片' : '记录图片'} />
}

function Composer({ section, initialText = '', initialImages = [], editing = false, onSave, onCancel }) {
  const [text, setText] = useState(initialText)
  const [attachments, setAttachments] = useState(() => initialImages.map((id) => ({ id })))
  const [busy, setBusy] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [imageError, setImageError] = useState('')
  const canSave = Boolean(text.trim() || attachments.length) && !preparing && !busy

  async function paste(event) {
    const files = clipboardImages(event.clipboardData)
    if (!files.length) return
    event.preventDefault()
    if (busy || preparing) return
    setPreparing(true)
    setImageError('')
    try {
      const images = []
      for (const file of files) images.push(await prepareImage(file))
      setAttachments((previous) => [...previous, ...images])
    } catch {
      setImageError('这次粘贴的图片无法读取，请复制一张 PNG、JPEG 或 WebP 图片再试。')
    } finally {
      setPreparing(false)
    }
  }

  async function submit(event) {
    event.preventDefault()
    if (!canSave) return
    setBusy(true)
    try {
      await onSave({ text, attachments })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      <textarea
        autoFocus
        aria-label={`${editing ? '编辑' : '写入'}${section.title}`}
        placeholder={prompts[section.id] ?? '写在这里'}
        value={text}
        readOnly={busy}
        rows={section.kind === 'checklist' ? 1 : 2}
        onPaste={paste}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return
          if (event.key === 'Escape' && !busy) onCancel()
          const quickSubmit = event.metaKey || event.ctrlKey ||
            (section.kind === 'checklist' && !event.shiftKey)
          if (event.key === 'Enter' && quickSubmit) {
            event.preventDefault()
            event.currentTarget.form.requestSubmit()
          }
        }}
      />
      {attachments.length > 0 && (
        <div className="composer-images">
          {attachments.map(({ id, src }, index) => (
            <div className="attachment-preview" key={id}>
              <AttachmentImage id={id} preview={src} />
              <button
                type="button"
                disabled={busy}
                aria-label={`移除第 ${index + 1} 张图片`}
                onClick={() => setAttachments((items) => items.filter((image) => image.id !== id))}
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      {imageError && <p className="form-error" role="alert">{imageError}</p>}
      <div className="composer-actions">
        <span className="paste-hint" role="status">{preparing ? '正在处理图片…' : '可粘贴图片'}</span>
        <button type="button" className="text-action" disabled={busy} onClick={onCancel}>取消</button>
        <Button variant="secondary" size="sm" type="submit" disabled={!canSave}>
          {editing ? '保存' : '记下'}
        </Button>
      </div>
    </form>
  )
}

function EntryActions({ onEdit, onDelete, busy }) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <details
      className="entry-actions"
      onToggle={(event) => { if (!event.currentTarget.open) setConfirmDelete(false) }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.currentTarget.open = false
        event.currentTarget.querySelector('summary').focus()
      }}
    >
      <summary aria-label="记录操作" title="记录操作"><Icon name="ellipsis" size={17} /></summary>
      <div className="entry-menu">
        {confirmDelete ? (
          <>
            <button type="button" className="delete-action" disabled={busy} onClick={onDelete}>确认删除</button>
            <button type="button" onClick={() => setConfirmDelete(false)}>取消</button>
          </>
        ) : (
          <>
            <button type="button" onClick={onEdit}><Icon name="pencil" size={15} />编辑</button>
            <button type="button" className="delete-action" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={15} />删除
            </button>
          </>
        )}
      </div>
    </details>
  )
}

function Entry({ section, entry, date, current, copied, save }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const target = { date, sectionId: section.id, entryId: entry.id }

  async function change(type, fields = {}) {
    if (busy) return false
    setBusy(true)
    try {
      return await save({ ...target, type, ...fields })
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <li>
        <Composer
          section={section}
          initialText={entry.text}
          initialImages={entry.imageIds}
          editing
          onSave={async (content) => {
            if (await change('edit-entry', content)) setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    )
  }

  const hasCheckbox = section.kind === 'checklist'
  return (
    <li className="entry" data-done={entry.done}>
      {hasCheckbox ? (
        <div className="check-area">
          <Checkbox
            seed={entry.id}
            aria-label={entry.text || '图片记录'}
            checked={entry.done}
            disabled={!current || busy}
            onCheckedChange={(done) => change('set-checked', { done })}
          />
        </div>
      ) : <span className="ink-dot" aria-hidden="true" />}
      <div className="note-content">
        {entry.text && <p className="entry-text"><NoteText text={entry.text} /></p>}
        {entry.imageIds?.length > 0 && (
          <div className="entry-images">
            {entry.imageIds.map((id) => <AttachmentImage key={id} id={id} />)}
          </div>
        )}
      </div>
      {current ? (
        <EntryActions
          onEdit={() => setEditing(true)}
          onDelete={() => change('delete-entry')}
          busy={busy}
        />
      ) : (
        <button
          className="copy-action"
          type="button"
          disabled={copied || busy}
          onClick={() => change('copy-entry', { copyId: crypto.randomUUID() })}
        >
          <Icon name={copied ? 'check' : 'copy'} size={14} />
          {copied ? '已抄到今天' : '抄到今天'}
        </button>
      )}
    </li>
  )
}

export function NoteSection({ section, entries, date, current, copiedIds, save, onShare }) {
  const [entryId, setEntryId] = useState(null)
  const checked = entries.filter((entry) => entry.done).length
  const checklist = section.kind === 'checklist'

  return (
    <section className="note-section" data-tone={section.tone} aria-labelledby={`heading-${section.id}`}>
      <header className="section-heading">
        <h2 id={`heading-${section.id}`}>{section.title}</h2>
        {checklist && entries.length > 0 && (
          <span className="section-count" aria-label={`已完成 ${checked} 项，共 ${entries.length} 项`}>
            {checked}/{entries.length}
          </span>
        )}
        {section.id === 'tasks' && entries.length > 0 && checked === entries.length && (
          <div className="stamp-share">
            <span className="done-stamp">
              <Stamp text=" " ink="red" w={53} h={28} tilt={0} seed="finished" aria-hidden="true" />
              <span>收工</span>
            </span>
            {onShare && <button type="button" className="text-action" onClick={onShare}>分享这页</button>}
          </div>
        )}
      </header>
      {entries.length > 0 && (
        <ul className="entries">
          {entries.map((entry) => (
            <Entry
              key={entry.id}
              section={section}
              entry={entry}
              date={date}
              current={current}
              copied={copiedIds.has(entry.id)}
              save={save}
            />
          ))}
        </ul>
      )}
      {current && (entryId ? (
        <Composer
          section={section}
          onSave={async (content) => {
            if (await save({ type: 'add-entry', sectionId: section.id, date, entryId, ...content })) {
              setEntryId(null)
            }
          }}
          onCancel={() => setEntryId(null)}
        />
      ) : (
        <button className="add-entry" type="button" onClick={() => setEntryId(crypto.randomUUID())}>
          <Icon name="plus" size={15} />
          <span>{prompts[section.id] ?? `写一条${section.title}`}</span>
        </button>
      ))}
    </section>
  )
}
