import type { Ink } from '@/lib/ink/builder'
import { wash } from '@/lib/ink/fills'
import { clamp } from '@/lib/ink/rng'
import { focusRing, line, tallyLines } from '@/lib/ink/shapes'
import { defineRecipe } from '@/lib/ink/recipes'
import { layoutHeat, layoutSpark, layoutTally } from '@/lib/ink/charts/chart-mini'
import { slotKey, type HeatSpec, type SparkSpec, type TallySpec } from '@/lib/ink/charts/chart-types'
import { drawPolyline } from '@/lib/ink/recipes/chart-ink/parts'
import type { PaintKey } from '@/lib/ink/paint'
import type { Pt } from '@/lib/ink/types'

export function roughSquare(ink: Ink, x: number, y: number, w: number, h: number, amt: number): string {
  const r = ink.next('cell')
  if (amt <= 0) return `M${+x.toFixed(1)} ${+y.toFixed(1)}h${+w.toFixed(1)}v${+h.toFixed(1)}h${+(-w).toFixed(1)}z`
  const j = () => r.gauss(0, amt)
  const p = (a: number, b: number) => `${(a + j()).toFixed(1)} ${(b + j()).toFixed(1)}`
  return `M${p(x, y)}L${p(x + w, y)} ${p(x + w, y + h)} ${p(x, y + h)}z`
}

export const sparkRecipe = defineRecipe<SparkSpec>({
  id: 'chart-spark',
  kind: 'chart',
  layers: ['rest', 'focus'],
  lazy: ['focus'],
  pad: 8,
  draw(ink, box, spec, ctx) {
    ctx.lazy('focus', (f) => focusRing(f, 0, 0, box.w, box.h, { r: 4 }))
    if (ctx.lazyOnly) return
    const L = layoutSpark(spec, box)
    const key = slotKey(spec.slot)
    const calm = ctx.calm
    ink.layer('rest', () => {
      if (spec.state !== 'ready' || !L.pts.some(Boolean)) {
        line(ink, 4, box.h / 2, box.w - 4, box.h / 2 - 0.6, { pen: 'pencil', opts: { simple: true, alpha: 0.6, width: 0.9 } })
        return
      }
      ink.group(
        { part: 'wipe' },
        () => {
          if (spec.variant === 'bar') {
            let d = ''
            for (const b of L.bars) d += roughSquare(ink, b.x, b.y, b.w, b.h, calm ? 0 : 0.35)
            ink.flat('marker', d, key, calm ? 0.8 : 0.9)
            return
          }
          if (spec.variant === 'area') {
            for (const s of L.segs) {
              if (s.length < 2) continue
              const poly: Pt[] = [...s, [s[s.length - 1][0], L.baseY], [s[0][0], L.baseY]]
              wash(ink, poly, key, { alpha: 0.28, shift: calm ? 0 : 0.9, inset: 0.3, wobble: 0.3 })
            }
          }
          for (const s of L.segs) {
            if (s.length < 2) continue
            drawPolyline(ink, s, 'solid', calm ? 'ink.fine' : 'ink', { color: key, width: calm ? 1 : 1.05, simple: true })
          }
          if (spec.extremes) {
            for (const p of [L.minPt, L.maxPt]) if (p) ink.dot(p[0], p[1], 1.9, 'ink', { color: 'pencil' })
          }
          if (spec.ends && L.last) ink.dot(L.last[0], L.last[1], calm ? 2.2 : 2.7, 'redfelt')
        },
        'top',
      )
    })
  },
})

export const tallyRecipe = defineRecipe<TallySpec>({
  id: 'chart-tally',
  kind: 'chart',
  layers: ['rest', 'focus'],
  lazy: ['focus'],
  pad: 12,
  draw(ink, box, spec, ctx) {
    ctx.lazy('focus', (f) => focusRing(f, 0, 0, box.w, box.h, { r: 6 }))
    if (ctx.lazyOnly) return
    const L = layoutTally(spec, box, ctx.calm)
    ink.layer('rest', () => {
      if (spec.state !== 'ready' || !L.rows.length) {
        line(ink, 8, box.h / 2, box.w - 8, box.h / 2 - 0.6, { pen: 'pencil', opts: { simple: true, alpha: 0.6, width: 0.9 } })
        return
      }
      for (const r of L.rows) {
        line(ink, L.markArea.x0 - 6, r.y + r.gh + 4, L.markArea.x1, r.y + r.gh + 3.4, { pen: 'pencil', opts: { simple: true, alpha: ctx.calm ? 0.3 : 0.38, width: 0.75, wobble: ctx.calm ? 0.2 : 1 } })
      }
      ink.group(
        { part: 'wipe' },
        () => {
          const heavy = L.rows.reduce((n, r) => n + r.marks, 0) > 60
          for (const r of L.rows) {
            const key: PaintKey = slotKey(spec.rows[r.index].slot)
            const t = tallyLines(ink.next('tally'), r.x, r.y, r.marks, r.gh)
            ink.lines(t.lines, ctx.calm ? 'ink.fine' : 'ink', { color: key, simple: heavy || ctx.calm, width: ctx.calm ? 1.1 : 1.25 })
          }
        },
        'top',
      )
    })
  },
})

export function heatAlpha(level: number, count: number): number {
  if (level <= 0) return 0.16
  return 0.26 + (0.68 * (level - 1)) / Math.max(1, count - 2)
}

export const heatRecipe = defineRecipe<HeatSpec>({
  id: 'chart-heat',
  kind: 'chart',
  layers: ['rest', 'focus'],
  lazy: ['focus'],
  pad: 12,
  draw(ink, box, spec, ctx) {
    ctx.lazy('focus', (f) => focusRing(f, 0, 0, box.w, box.h, { r: 6 }))
    if (ctx.lazyOnly) return
    const L = layoutHeat(spec, box, ctx.calm)
    const key = slotKey(spec.slot)
    const calm = ctx.calm
    ink.layer('rest', () => {
      if (spec.state !== 'ready' || !L.cells.length) {
        ink.group({ part: 'pulse' }, () => {
          let d = ''
          for (let i = 0; i < spec.cols * spec.rows; i++) d += roughSquare(ink, L.gx + (i % spec.cols) * L.cs, L.gy + Math.floor(i / spec.cols) * L.cs, L.cell, L.cell, 0.3)
          ink.flat('wash', d, 'pencil-mark', 0.2)
        }, 'top')
        return
      }
      const amt = calm || L.cell < 6 ? 0 : clamp(L.cell * 0.05, 0.2, 0.6)
      ink.group(
        { part: 'wipe' },
        () => {
          const byLevel: string[] = Array.from({ length: spec.levelCount }, () => '')
          for (const c of L.cells) byLevel[Math.min(spec.levelCount - 1, c.level)] += roughSquare(ink, c.x, c.y, L.cell, L.cell, amt)
          byLevel.forEach((d, lv) => {
            if (!d) return
            if (lv === 0) ink.flat('wash', d, 'pencil-mark', 0.2)
            else ink.flat('marker', d, key, calm ? heatAlpha(lv, spec.levelCount) * 0.9 : heatAlpha(lv, spec.levelCount))
          })
          if (L.legend) {
            let d0 = ''
            const per: string[] = Array.from({ length: spec.levelCount }, () => '')
            for (let lv = 0; lv < spec.levelCount; lv++) per[lv] += roughSquare(ink, L.legend.x + lv * (L.legend.cell + 3), L.legend.y, L.legend.cell, L.legend.cell, amt)
            void d0
            per.forEach((d, lv) => {
              if (lv === 0) ink.flat('wash', d, 'pencil-mark', 0.2)
              else ink.flat('marker', d, key, heatAlpha(lv, spec.levelCount))
            })
          }
        },
        'top',
      )
    })
  },
})
