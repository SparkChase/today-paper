import { bandFill, blobFill, wash } from '@/lib/ink/fills'
import { ellipsePoly, roundRectPoly } from '@/lib/ink/geom'
import type { PaintKey } from '@/lib/ink/paint'
import { defineRecipe } from '@/lib/ink/recipes'
import { box, dashedBox, focusRing, line, RULER } from '@/lib/ink/shapes'
import type { Pt } from '@/lib/ink/types'

export const stampInkList = ['red', 'ink-you', 'green', 'ink'] as const
export type StampInk = (typeof stampInkList)[number]

export const STAMP_KNOB = 30

const RULE_PEN: Record<StampInk, 'redfelt' | 'blue' | 'greenfelt' | 'ink'> = { red: 'redfelt', 'ink-you': 'blue', green: 'greenfelt', ink: 'ink' }

export interface StampButtonParams {
  ink: StampInk
  disabled?: boolean
}

export const stampButtonRecipe = defineRecipe<StampButtonParams>({
  id: 'stamp-button',
  kind: 'stamp-tool',
  layers: ['rest', 'hover', 'pressed', 'focus', 'disabled'],
  lazy: ['pressed', 'focus'],
  pad: 12,
  draw(ink, { w, h }, { ink: tone, disabled }, ctx) {
    const K = STAMP_KNOB
    const cx = w / 2
    const dieY = K - 3
    const dieH = h - dieY
    const pen = RULE_PEN[tone]
    const colour: PaintKey = tone
    ctx.lazy('focus', (f) => focusRing(f, 0, 0, w, h, { r: 4 }))
    if (disabled) {
      if (ctx.lazyOnly) return
      ink.layer('disabled', () => {
        dashedBox(ink, 1, dieY, w - 2, dieH - 1, { r: 3, pen: 'pencil', opts: { color: 'pencil', width: 1.2 } })
        const knob = ellipsePoly(cx, 9.5, 14, 8.2, 28)
        ink.stroke([...knob, knob[0]], 'pencil.fine', { poly: true, round: 1, simple: true, alpha: 0.7 })
        line(ink, cx - 4.6, 16, cx - 4, dieY - 1, { pen: 'pencil.fine', opts: { simple: true } })
        line(ink, cx + 4.6, 16, cx + 4, dieY - 1, { pen: 'pencil.fine', opts: { simple: true } })
      })
      return
    }
    ctx.lazy('pressed', (p) => {
      const die: Pt[] = [[2, dieY + 2], [w - 2, dieY + 2], [w - 2, h - 2], [2, h - 2]]
      wash(p, die, colour, { alpha: 0.22, inset: 0 })
    })
    if (ctx.lazyOnly) return

    ink.layer('rest', () => {
      const knob = ellipsePoly(cx, 9.5, 14, 8.2, 28)
      const neck: Pt[] = [[cx - 4.6, 15], [cx + 4.6, 15], [cx + 3.6, 21.5], [cx + 5.4, 23], [cx - 5.4, 23], [cx - 3.6, 21.5]]
      const flange = roundRectPoly(cx - 15.5, 22.5, 31, dieY - 22.5 + 1.5, 2)
      ink.part('fill', () => {
        blobFill(ink, neck, 'kraft', { alpha: 0.95, mis: false })
        blobFill(ink, flange, 'kraft', { alpha: 0.95, mis: false })
        return blobFill(ink, knob, 'kraft', { alpha: 0.95, mis: ctx.calm ? false : undefined })
      })
      wash(ink, knob, 'orange-text', { alpha: 0.28, inset: 1 })
      wash(ink, flange, 'orange-text', { alpha: 0.2, inset: 0.5 })
      const outline = ctx.calm ? 'pencil.fine' : 'ink.fine'
      ink.stroke([...knob, knob[0]], outline, { poly: true, round: 1, simple: true })
      ink.stroke([...flange, flange[0]], outline, { poly: true, round: 1, simple: true })
      line(ink, cx - 4.6, 16, cx - 3.6, 22, { pen: outline, opts: { simple: true } })
      line(ink, cx + 4.6, 16, cx + 3.6, 22, { pen: outline, opts: { simple: true } })
      line(ink, cx - 7.5, 8.6, cx + 5, 7, { pen: 'pencil.fine', opts: { simple: true, alpha: 0.6 } })
      const die: Pt[] = [[2, dieY + 2], [w - 2, dieY + 2], [w - 2, h - 2], [2, h - 2]]
      ink.part('fill', () => bandFill(ink, die, colour, { alpha: 0.2, passes: 1, ends: 'square' }))
      box(ink, 0, dieY, w, dieH, { pen, corner: 3, opts: ctx.calm ? { simple: true } : undefined })
      box(ink, 4.5, dieY + 4.5, w - 9, dieH - 9, { pen: `${pen}.fine`, corner: 2, opts: { simple: true } })
    })

    ink.layer('hover', () => {
      if (!ctx.calm) wash(ink, [[2, dieY + 2], [w - 2, dieY + 2], [w - 2, h - 2], [2, h - 2]], colour, { alpha: 0.12, inset: 0 })
      ink.lines([{ pts: [[6, h + 3.4], [w - 4, h + 3.4]], o: RULER }], 'ink.fine', { width: 1.2 })
    })
  },
})
