import { defineRecipe } from '@/lib/ink/recipes'
import { clamp } from '@/lib/ink/rng'
import { dashedBox, focusRing, line } from '@/lib/ink/shapes'

export interface StickerSheetParams {
  top: number
}

export const stickerSheetRecipe = defineRecipe<StickerSheetParams>({
  id: 'sticker-sheet',
  kind: 'print',
  layers: ['rest'],
  pad: 10,
  draw(ink, { w, h }, { top }, ctx) {
    const x0 = 6, x1 = w - 6, y0 = 6 + top, y1 = h - 6
    if (x1 - x0 < 24 || y1 - y0 < 24) return
    ink.layer('rest', () => {
      const dash = clamp((2 * (x1 - x0 + y1 - y0)) / 60, 6, 14)
      dashedBox(ink, x0, y0, x1 - x0, y1 - y0, { r: 14, pen: 'pencil', dash, gap: dash * 0.75, opts: { alpha: 0.6, width: 1.1 } })
      if (ctx.calm) return
      const t = 7, g = 4
      const mark = (cx: number, cy: number, sx: number, sy: number) => {
        line(ink, cx - sx * g, cy, cx - sx * (g + t), cy, { pen: 'pencil.fine', opts: { alpha: 0.75, simple: true } })
        line(ink, cx, cy - sy * g, cx, cy - sy * (g + t), { pen: 'pencil.fine', opts: { alpha: 0.75, simple: true } })
      }
      mark(x0, y0, 1, 1)
      mark(x1, y0, -1, 1)
      mark(x0, y1, 1, -1)
      mark(x1, y1, -1, -1)
    })
  },
})

export const stickerSlotRecipe = defineRecipe<Record<string, never>>({
  id: 'sticker-slot',
  kind: 'frame',
  layers: ['focus'],
  lazy: ['focus'],
  pad: 12,
  draw(_ink, { w, h }, _params, ctx) {
    ctx.lazy('focus', (f) => focusRing(f, 1, 1, w - 2, h - 2, { r: 10 }))
  },
})
