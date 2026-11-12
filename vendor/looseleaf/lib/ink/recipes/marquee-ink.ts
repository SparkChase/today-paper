import { tape, type Accent, type TapeKind } from '@/lib/ink/paper/props'
import { defineRecipe } from '@/lib/ink/recipes'
import { clamp } from '@/lib/ink/rng'
import { focusRing, loop } from '@/lib/ink/shapes'
import { blobFill } from '@/lib/ink/fills'
import { ellipsePoly } from '@/lib/ink/geom'

export interface MarqueeBandParams {
  kind?: TapeKind
  color?: Accent
}

export const marqueeBandRecipe = defineRecipe<MarqueeBandParams>({
  id: 'marquee-band',
  kind: 'marquee-band',
  layers: ['rest'],
  pad: 4,
  draw(ink, { w, h }, { kind = 'washi-stripes', color }, ctx) {
    const t = tape(`${ctx.seed}|tape`, { kind, color, length: w, height: h, tier: ctx.tier, calm: ctx.calm })
    ink.layer('rest', () => ink.raw(t.svg, 'top'))
  },
})

export interface MarqueeControlParams {
  paused: boolean
}

export const marqueeControlRecipe = defineRecipe<MarqueeControlParams>({
  id: 'marquee-control',
  kind: 'marquee-control',
  layers: ['rest', 'hover', 'focus'],
  lazy: ['focus'],
  pad: 12,
  draw(ink, { w, h }, { paused }, ctx) {
    const cx = w / 2, cy = h / 2
    const r = Math.min(w, h) / 2 - 2
    ctx.lazy('focus', (f) => focusRing(f, 0, 0, w, h, { shape: 'ellipse' }))
    if (ctx.lazyOnly) return
    ink.layer('rest', () => {
      blobFill(ink, ellipsePoly(cx, cy, r - 1, r - 1.4, 18), 'photo', { alpha: 0.92, mis: 0.6, material: 'wash' })
      loop(ink, cx, cy, r, r * 0.97, { pen: 'ink.fine', turns: 1.07 })
      const k = clamp(r * 0.36, 2.4, 5)
      if (paused) {
        ink.lines([{ pts: [[cx - k * 0.5, cy - k], [cx + k * 0.9, cy], [cx - k * 0.5, cy + k], [cx - k * 0.5, cy - k]], o: { poly: true, round: 0.5 } }], 'ink', { width: 0.9 })
      } else {
        ink.lines([{ pts: [[cx - k * 0.55, cy - k], [cx - k * 0.5, cy + k]], o: { start: 'soft', end: 'soft' } }, { pts: [[cx + k * 0.55, cy - k], [cx + k * 0.6, cy + k]], o: { start: 'soft', end: 'soft' } }], 'ink', { width: 1.1 })
      }
    })
    ink.layer('hover', () => {
      loop(ink, cx, cy, r + 2.2, r + 2, { pen: 'ink.fine', turns: 1.05 })
    })
  },
})
