import { blobFill } from '@/lib/ink/fills'
import { roundRectPoly } from '@/lib/ink/geom'
import { clamp } from '@/lib/ink/rng'
import { n } from '@/lib/ink/paint'
import { defineRecipe } from '@/lib/ink/recipes'
import { dashedBox, focusRing, line, loop } from '@/lib/ink/shapes'
import { svgMaskDefs } from '@/lib/ink/textures'
import { stickerFace } from '@/lib/ink/recipes/sticker-ink'

export interface StickerBoardItem {
  id: string
  name: string
  x: number
  y: number
  rot: number
  scale: number
  z: number
}

const finite = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

export function wholeItems(items: readonly StickerBoardItem[]): StickerBoardItem[] {
  let mended = false
  const next = items.map((s, i) => {
    if (Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.rot) && Number.isFinite(s.scale) && s.scale > 0 && Number.isFinite(s.z)) return s
    mended = true
    return { ...s, x: finite(s.x, 160), y: finite(s.y, 120), rot: finite(s.rot, 0), scale: finite(s.scale, 1) > 0 ? finite(s.scale, 1) : 1, z: finite(s.z, i) }
  })
  return mended ? next : (items as StickerBoardItem[])
}

export const HANDLE = { rotateUp: 30, ring: 8, scaleOut: 6, scaleSize: 13, hit: 28 } as const

const PAD = 40

export interface ItemFrameParams {
  selected: boolean
  handles: boolean
}

export const stickerBoardItemRecipe = defineRecipe<ItemFrameParams>({
  id: 'sticker-board-item',
  kind: 'frame',
  layers: ['rest', 'hover', 'focus'],
  lazy: ['hover', 'focus'],
  pad: PAD,
  draw(ink, { w, h }, { selected, handles }, ctx) {
    const out = 5
    ctx.lazy('focus', (f) => focusRing(f, -out, -out, w + 2 * out, h + 2 * out, { r: 6, gap: 3 }))
    ctx.lazy('hover', (f) => dashedBox(f, -out, -out, w + 2 * out, h + 2 * out, { r: 7, pen: 'pencil', opts: { alpha: 0.55 } }))
    if (ctx.lazyOnly || !selected) return
    ink.layer('rest', () => {
      const x0 = -out, y0 = -out, x1 = w + out, y1 = h + out
      const dash = clamp((2 * (x1 - x0 + y1 - y0)) / 46, 7, 16)
      dashedBox(ink, x0, y0, x1 - x0, y1 - y0, { r: 7, pen: 'bluepencil', dash, gap: dash * 0.72, opts: { width: ctx.calm ? 1 : 1.5 } })
      const t = 7
      const tick = (cx: number, cy: number, sx: number, sy: number) => {
        line(ink, cx - sx * 2, cy, cx + sx * t, cy, { pen: 'blue.fine', opts: { simple: true } })
        line(ink, cx, cy - sy * 2, cx, cy + sy * t, { pen: 'blue.fine', opts: { simple: true } })
      }
      tick(x0 - 1, y0 - 1, 1, 1)
      tick(x1 + 1, y0 - 1, -1, 1)
      tick(x0 - 1, y1 + 1, 1, -1)
      if (!handles) return
      const cx = w / 2
      line(ink, cx, y0 - 1, cx, y0 - HANDLE.rotateUp + HANDLE.ring, { pen: 'blue.fine', opts: { simple: true } })
      loop(ink, cx, y0 - HANDLE.rotateUp, HANDLE.ring, HANDLE.ring, { pen: 'blue', opts: { simple: true, width: 1.2 } })
      const sx = x1 + HANDLE.scaleOut - HANDLE.scaleSize / 2
      const sy = y1 + HANDLE.scaleOut - HANDLE.scaleSize / 2
      ink.part('fill', () => blobFill(ink, roundRectPoly(sx, sy, HANDLE.scaleSize, HANDLE.scaleSize, 2.5), 'ink-you', { alpha: 0.9 }))
      line(ink, x1 - 1, y1 + 1, x1 - t, y1 + 1, { pen: 'blue.fine', opts: { simple: true } })
    })
  },
})

export interface ComposeOptions {
  width: number
  height: number
  size: number
  background?: string | null
  resolve?: (svg: string) => string
}

export function composeBoardSvg(items: readonly StickerBoardItem[], o: ComposeOptions): string {
  const ordered = [...wholeItems(items)].sort((a, b) => a.z - b.z)
  let body = ''
  ordered.forEach((it, i) => {
    const face = stickerFace(it.name, o.size, it.id, { idPrefix: `ll-x${i}` })
    if (!face) return
    const cx = face.box.x + face.box.w / 2, cy = face.box.y + face.box.h / 2
    body += `<g transform="translate(${n(it.x)} ${n(it.y)}) rotate(${n(it.rot)}) scale(${n(it.scale, 100)}) translate(${n(-cx)} ${n(-cy)})">${face.svg}</g>`
  })
  const bg = o.background === null ? '' : `<rect width="${n(o.width)}" height="${n(o.height)}" fill="${o.background ?? 'var(--ll-paper)'}"/>`
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(o.width)}" height="${n(o.height)}" viewBox="0 0 ${n(o.width)} ${n(o.height)}">` +
    `<defs>${svgMaskDefs({ kinds: ['felt', 'marker', 'graphite', 'waxy', 'stamp'] })}</defs>${bg}${body}</svg>`
  return o.resolve ? o.resolve(svg) : svg
}
