import { wash } from '@/lib/ink/fills'
import { roundRectPoly } from '@/lib/ink/geom'
import { n } from '@/lib/ink/paint'
import { clamp } from '@/lib/ink/rng'
import { box } from '@/lib/ink/shapes'
import { defineRecipe } from '@/lib/ink/recipes'

const MAX_TICKS = 72

export const menubarRecipe = defineRecipe<Record<string, never>>({
  id: 'menubar',
  kind: 'bar',
  layers: ['rest'],
  pad: 12,
  draw(ink, { w, h }, _p, ctx) {
    const r = clamp(h * 0.09, 2.5, 4.4)
    const inset = clamp(h * 0.06, 1.6, 3)
    ink.layer('rest', () => {
      wash(ink, roundRectPoly(inset, inset, w - 2 * inset, h - 2 * inset, r), 'paper-shade', { alpha: 0.85, material: 'wash' })
      if (ctx.calm) {
        box(ink, 0, 0, w, h, { pen: 'pencil.fine', corner: r, opts: { simple: w > 360 || undefined } })
        return
      }
      const from = 12
      const to = w - 12
      const count = Math.max(1, Math.round((to - from) / Math.max(6, (to - from) / MAX_TICKS)))
      const step = (to - from) / count
      const y = h - inset - 1.4
      let d = ''
      for (let i = 0; i <= count; i++) {
        const x = from + i * step
        const hh = i % 5 === 0 ? 5.2 : 3
        const wd = i % 5 === 0 ? 1 : 0.8
        d += `M${n(x - wd / 2)} ${n(y)}L${n(x + wd / 2)} ${n(y)}L${n(x + wd / 2)} ${n(y - hh)}L${n(x - wd / 2)} ${n(y - hh)}Z`
      }
      ink.flat('pencil', d, 'pencil-mark', 0.7)
      box(ink, 0, 0, w, h, { pen: 'ink.fine', corner: r, opts: w > 360 ? { simple: true } : undefined })
    })
  },
})
