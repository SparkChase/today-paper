import { imageKey } from './attachments.js'
import { parseDay } from './dates.js'

const width = 488
const inset = 36
const textWidth = width - inset * 2
const lineHeight = 23
const serif = '"Songti SC", "Noto Serif CJK SC", "SimSun", serif'
const sans = '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' })
const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'long' })

function wrap(ctx, text, max) {
  const rows = []
  for (const paragraph of text.split('\n')) {
    let row = ''
    for (const { segment } of segmenter.segment(paragraph)) {
      const candidate = row + segment
      if (row && ctx.measureText(candidate).width > max) {
        rows.push(row)
        row = segment
      } else row = candidate
    }
    rows.push(row)
  }
  return rows
}

function drawStamp(ctx, y) {
  ctx.save()
  ctx.translate(width - inset - 36, y)
  ctx.rotate(-0.15)
  ctx.strokeStyle = '#9d3928'
  ctx.lineWidth = 1.8
  ctx.strokeRect(-32, -14, 64, 28)
  ctx.lineWidth = .8
  ctx.strokeRect(-29, -11, 58, 22)
  ctx.font = `700 16px ${serif}`
  ctx.textAlign = 'center'
  ctx.fillStyle = '#9d3928'
  ctx.fillText('收 工', 0, 6)
  ctx.restore()
}

async function loadImages(sections) {
  const ids = new Set(sections.flatMap(({ entries }) => entries.flatMap(({ imageIds }) => imageIds ?? [])))
  const stored = await chrome.storage.local.get([...ids].map(imageKey))
  return new Map(await Promise.all([...ids].map(async (id) => {
    const source = stored[imageKey(id)]
    if (!source) throw new Error('这页有图片无法读取。可以取消选择对应的区域。')
    const image = new Image()
    image.src = source
    await image.decode()
    return [id, image]
  })))
}

function drawPaper(ctx, height) {
  ctx.fillStyle = '#b9d0c0'
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = '#49695219'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0.5; x < width; x += 18) { ctx.moveTo(x, 0); ctx.lineTo(x, height) }
  for (let y = 0.5; y < height; y += 18) { ctx.moveTo(0, y); ctx.lineTo(width, y) }
  ctx.stroke()

  const paper = new Path2D()
  paper.moveTo(14, 13)
  paper.lineTo(width - 15, 15)
  paper.lineTo(width - 12, height - 15)
  for (let x = width - 14; x >= 14; x -= 4) paper.lineTo(x, height - 14 + 1.1 * Math.sin(x * 1.9))
  for (let y = height - 14; y > 14; y -= 4) paper.lineTo(14 + 1.3 * Math.sin(y * 2.4), y)
  paper.closePath()
  ctx.save()
  ctx.shadowBlur = 9
  ctx.shadowOffsetY = 4
  ctx.shadowColor = '#31483a40'
  ctx.fillStyle = '#faf5e8'
  ctx.fill(paper)
  ctx.restore()
  ctx.save()
  ctx.translate(52, 15)
  ctx.rotate(-0.1)
  ctx.fillStyle = '#ead393bb'
  ctx.fillRect(-28, -6, 72, 13)
  ctx.restore()
}

function rule(ctx, y) {
  ctx.strokeStyle = '#d9cfbd'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(inset, y + 0.5)
  ctx.lineTo(width - inset, y + 0.5)
  ctx.stroke()
}

export async function makeShareImage(date, sections) {
  const images = await loadImages(sections)
  const canvas = document.createElement('canvas')
  let ctx = canvas.getContext('2d')
  ctx.font = `15px ${sans}`
  const layout = sections.map(({ section, entries }) => {
    const checklist = section.kind === 'checklist'
    return {
      section, checklist,
      entries: entries.map((entry) => ({
        ...entry,
        lines: entry.text ? wrap(ctx, entry.text, textWidth - 20) : [],
        photos: (entry.imageIds ?? []).map((id) => {
          const img = images.get(id)
          const ratio = Math.min(1, (textWidth - 22) / img.naturalWidth, 355 / img.naturalHeight)
          return { img, width: img.naturalWidth * ratio, height: img.naturalHeight * ratio }
        }),
      })),
    }
  })

  let height = 132
  for (const { entries } of layout) {
    height += 40
    for (const { lines, photos } of entries) {
      height += lines.length * lineHeight + photos.reduce((sum, photo) => sum + photo.height + 8, 0) + 6
    }
  }
  const scale = Math.min(2, 16000 / height)
  if (scale < .75) throw new Error('这页内容太长，请少选几个区域后再生成图片。')
  canvas.width = Math.ceil(width * scale)
  canvas.height = Math.ceil(height * scale)
  ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)
  drawPaper(ctx, height)

  ctx.fillStyle = '#625b50'
  ctx.font = `12px ${sans}`
  ctx.fillText(date.replaceAll('-', '.') + '  ·  ' + weekday.format(parseDay(date)), inset, 47)
  ctx.fillStyle = '#2c2922'
  ctx.font = `700 33px ${serif}`
  ctx.fillText('今天这张纸', inset, 86)
  if (layout.some(({ section, entries }) => section.id === 'tasks' && entries.every(({ done }) => done))) {
    drawStamp(ctx, 70)
  }

  let y = 109
  for (const { section, checklist, entries } of layout) {
    rule(ctx, y)
    ctx.fillStyle = '#665e50'
    ctx.font = `700 15px ${serif}`
    ctx.fillText(section.title, inset, y + 24, textWidth)
    y += 38
    for (const { done, lines, photos } of entries) {
      ctx.font = `15px ${sans}`
      ctx.fillStyle = done ? '#43644b' : '#625b50'
      ctx.fillText(checklist ? (done ? '✓' : '□') : '·', inset, y + 14)
      ctx.fillStyle = '#2c2922'
      for (const line of lines) {
        ctx.fillText(line, inset + 20, y + 14)
        y += lineHeight
      }
      for (const photo of photos) {
        ctx.drawImage(photo.img, inset + 20, y + 2, photo.width, photo.height)
        y += photo.height + 8
      }
      y += 6
    }
    y += 2
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('暂时无法生成分享图片。'))
    }, 'image/png')
  })
}
