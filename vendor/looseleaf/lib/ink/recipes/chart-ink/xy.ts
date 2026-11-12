import type { Ink } from '@/lib/ink/builder'
import { blobFill, flatFill } from '@/lib/ink/fills'
import { ellipsePoly } from '@/lib/ink/geom'
import { clamp } from '@/lib/ink/rng'
import { arrow, dashedBox, focusRing, loop, squiggle, underline, RULER } from '@/lib/ink/shapes'
import { defineRecipe } from '@/lib/ink/recipes'
import { layoutXY, type XYBar, type XYLayout } from '@/lib/ink/charts/chart-xy'
import { slotKey, type XYSpec } from '@/lib/ink/charts/chart-types'
import { NOTE_PEN, drawAxisLines, drawGrid, drawMarker, drawPolyline, patternFill, rectPts, swipeFill } from '@/lib/ink/recipes/chart-ink/parts'
import type { PaintKey } from '@/lib/ink/paint'
import type { PenName, Pt } from '@/lib/ink/types'

export const HATCH_ON: readonly PaintKey[] = ['ink', 'photo', 'photo', 'photo', 'photo', 'photo', 'photo', 'photo']
export const hatchOn = (slot: number): PaintKey => HATCH_ON[((Math.trunc(slot) % 8) + 8) % 8]

function barShape(b: XYBar, horizontal: boolean): Pt[] {
  const r = Math.min(3, Math.min(b.w, b.h) * 0.35)
  const steps = 5
  const arc = (cx: number, cy: number, a0: number): Pt[] => Array.from({ length: steps + 1 }, (_, i) => {
    const a = a0 + (i / steps) * (Math.PI / 2)
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as Pt
  })
  const { x, y, w, h } = b
  if (horizontal) {
    if (b.neg) return [[x + w, y], ...arc(x + r, y + r, Math.PI * 1.5).reverse(), ...arc(x + r, y + h - r, Math.PI * 0.5).reverse(), [x + w, y + h]]
    return [[x, y], ...arc(x + w - r, y + r, Math.PI * 1.5), ...arc(x + w - r, y + h - r, 0), [x, y + h]]
  }
  if (b.neg) return [[x, y], [x + w, y], ...arc(x + w - r, y + h - r, 0), ...arc(x + r, y + h - r, Math.PI * 0.5)]
  return [[x, y + h], ...arc(x + r, y + r, Math.PI), ...arc(x + w - r, y + r, Math.PI * 1.5), [x + w, y + h]]
}

function drawBarFills(ink: Ink, bars: readonly XYBar[], spec: XYSpec, calm: boolean, horizontal: boolean): void {
  if (!bars.some((b) => b.w >= 0.8 && b.h >= 0.8)) return
  ink.part('fill', () => {
    let first: { dx: number; dy: number } | undefined
    for (const b of bars) {
      if (b.w < 0.8 || b.h < 0.8) continue
      flatFill(ink, barShape(b, horizontal), slotKey(spec.series[b.s].slot), calm ? 0.88 : 0.95)
      first ??= { dx: 0, dy: 0 }
    }
    return first
  })
}

function drawBar(ink: Ink, b: XYBar, L: XYLayout, spec: XYSpec, o: { rich: boolean; calm: boolean; maxPulls: number; pen: PenName }): void {
  const ser = spec.series[b.s]
  if (b.w < 0.8 || b.h < 0.8) return
  const short = Math.min(b.w, b.h)
  const rng = ink.next('bar')
  if (spec.patterns && ser.pattern !== 'solid' && b.w >= 8 && b.h >= 8) {
    patternFill(ink, ser.pattern, rectPts(b.x + 1.2, b.y + 1.2, b.w - 2.4, b.h - 2.2), { color: hatchOn(ser.slot), maxPulls: o.maxPulls, alpha: 0.72 })
  }
  if (b.w < 6 && !L.horizontal) return
  const j = () => rng.gauss(0, 0.12)
  const { x, y, w, h } = b
  let pts: Pt[]
  if (L.horizontal) pts = b.neg ? [[x + w, y + j()], [x + j(), y + j()], [x + j(), y + h + j()], [x + w, y + h + j()]] : [[x, y + j()], [x + w + j(), y + j()], [x + w + j(), y + h + j()], [x, y + h + j()]]
  else pts = b.neg ? [[x + j(), y], [x + j(), y + h + j()], [x + w + j(), y + h + j()], [x + w + j(), y]] : [[x + j(), y + h], [x + j(), y + j()], [x + w + j(), y + j()], [x + w + j(), y + h]]
  ink.stroke(pts, o.pen, { poly: true, round: Math.min(3, short * 0.35), simple: !o.rich, wobble: 0.15, dry: 0, end: 'soft', start: 'soft' })
}

function drawNotes(ink: Ink, L: XYLayout, spec: XYSpec): void {
  ink.group(
    { part: 'note' },
    () => {
      for (const g of L.notes) {
        const p = NOTE_PEN[g.pen]
        if (g.loop) loop(ink, g.loop.cx, g.loop.cy, g.loop.rx, g.loop.ry, { pen: p.std, opts: { width: 0.9 } })
        if (g.underline) underline(ink, g.underline.x1, g.underline.y, g.underline.x2 - g.underline.x1, { pen: p.fine, kind: 'double' })
        if (g.arrow) arrow(ink, g.arrow.x1, g.arrow.y1, g.arrow.x2, g.arrow.y2, { pen: p.fine, curve: 0.22, headLen: 7, opts: { width: 1.05 } })
      }
      for (const r of L.refs) {
        const len = Math.hypot(r.x2 - r.x1, r.y2 - r.y1)
        const p = NOTE_PEN[r.pen]
        for (let d = 0; d < len; d += 15) {
          const a = d / len
          const e = Math.min(len, d + 9) / len
          ink.stroke([[r.x1 + (r.x2 - r.x1) * a, r.y1 + (r.y2 - r.y1) * a], [r.x1 + (r.x2 - r.x1) * e, r.y1 + (r.y2 - r.y1) * e]], p.fine === 'redfelt.fine' ? 'red' : 'pencil', { ...RULER, simple: true, alpha: 0.85, width: 0.95 })
        }
      }
    },
    'top',
  )
  void spec
}

function drawTicks(ink: Ink, L: XYLayout, calm: boolean): void {
  const { x0, x1, y1 } = L.plot
  const along = (l: { x: number; y: number }, bottom: boolean) => {
    const rng = ink.next('tick')
    const j = rng.gauss(0, 0.25)
    if (bottom) ink.stroke([[l.x + j, y1 - 1.2], [l.x + rng.gauss(0, 0.2), y1 + (calm ? 3.5 : 4.6)]], calm ? 'ink.fine' : 'ink.fine', { simple: true, width: 0.9, alpha: 0.85, start: 'soft', end: 'flick', wobble: 0.3 })
    else ink.stroke([[x0 + 1.2, l.y + j], [x0 - (calm ? 3.5 : 4.6), l.y + rng.gauss(0, 0.2)]], 'pencil', { simple: true, width: 0.95, alpha: 0.85, start: 'soft', end: 'flick', wobble: 0.3 })
  }
  for (const l of L.labels) {
    if (l.x < x0 - 60 || l.x > x1 + 60) continue
    if (L.horizontal) {
      if (l.role === 'y') along(l, true)
      else if (l.role === 'cat') along(l, false)
    } else if (l.role === 'x') along(l, true)
    else if (l.role === 'y') along(l, false)
  }
}

function drawState(ink: Ink, L: XYLayout, spec: XYSpec, calm: boolean): void {
  const { x0, y0, x1, y1 } = L.plot
  drawAxisLines(ink, L.plot, { x: true, y: true, calm })
  if (spec.state === 'loading') {
    ink.group(
      { part: 'pulse' },
      () => {
        const hs = [0.26, 0.42, 0.32, 0.52, 0.38, 0.46]
        const bw = Math.min(46, (x1 - x0) / (hs.length * 1.7))
        const step = (x1 - x0) / hs.length
        hs.forEach((k, i) => {
          const hh = (y1 - y0) * k
          dashedBox(ink, x0 + step * (i + 0.5) - bw / 2, y1 - hh, bw, hh, { r: 2, pen: 'pencil', opts: { alpha: 0.7 } })
        })
      },
      'top',
    )
  } else {
    squiggle(ink, x0 + 12, y0 + (y1 - y0) * 0.68, Math.max(20, x1 - x0 - 24), { pen: 'pencil', h: 14, amp: 1.4, wl: 1.3, opts: { alpha: 0.55 } })
  }
}

export const xyRecipe = defineRecipe<XYSpec>({
  id: 'chart-xy',
  kind: 'chart',
  layers: ['rest', 'focus'],
  lazy: ['focus'],
  pad: 14,
  draw(ink, box, spec, ctx) {
    ctx.lazy('focus', (f) => focusRing(f, 0, 0, box.w, box.h, { r: 6 }))
    if (ctx.lazyOnly) return
    const calm = ctx.calm
    const L = layoutXY(spec, box, calm)
    const { plot } = L
    ink.layer('rest', () => {
      if (spec.state !== 'ready' || spec.series.length === 0 || spec.cats.length + L.dots.length === 0) {
        drawState(ink, L, spec, calm)
        return
      }
      for (const b of L.bands) swipeFill(ink, b, L.horizontal, calm)
      if (spec.grid) drawGrid(ink, L.gridPx, plot, !L.horizontal)
      drawAxisLines(ink, plot, { x: true, y: spec.showY, calm, zeroY: L.horizontal ? null : L.basePx })
      drawTicks(ink, L, calm)

      const rich = !calm && L.bars.length <= 18 && L.dots.length <= 60
      const patterned = L.bars.filter((b) => spec.series[b.s].pattern !== 'solid' && b.w >= 8).length
      const maxPulls = clamp(Math.floor(150 / Math.max(1, patterned)), 9, 60)
      const barPen: PenName = calm ? 'ink.fine' : L.barW >= 24 ? 'ink' : 'ink.fine'

      ink.group(
        { part: 'wipe' },
        () => {
          for (const a of L.areas) {
            const ser = spec.series[a.s]
            const key = slotKey(ser.slot)
            for (const poly of a.polys) {
              flatFill(ink, poly, key, 0.42)
            }
          }
          drawBarFills(ink, L.bars, spec, calm, L.horizontal)
          for (const b of L.bars) drawBar(ink, b, L, spec, { rich, calm, maxPulls, pen: barPen })
          const heavy = L.lines.reduce((n, l) => n + l.segs.reduce((m, s) => m + s.length, 0), 0) > 170
          for (const l of L.lines) {
            const ser = spec.series[l.s]
            const key = slotKey(ser.slot)
            for (const s of l.segs) {
              if (s.length < 2) {
                if (s.length === 1) ink.dot(s[0][0], s[0][1], 2, 'ink', { color: key })
                continue
              }
              drawPolyline(ink, s, spec.patterns && ser.kind === 'line' ? ser.dash : 'solid', calm ? 'ink.fine' : 'ink', { color: key, width: calm ? 1.05 : 1.2, simple: heavy })
            }
          }
          const lean = !rich || L.dots.length > 40
          for (const d of L.dots) {
            const ser = spec.series[d.s]
            const key = slotKey(ser.slot)
            const scatter = ser.kind === 'scatter'
            const sized = scatter && !!ser.sizes
            if (sized) {
              blobFill(ink, ellipsePoly(d.x, d.y, d.r, d.r, 14), key, { alpha: 0.5, mis: calm ? false : 1.1 })
              if (!lean) loop(ink, d.x, d.y, d.r, d.r, { pen: 'ink.fine', opts: { simple: true, width: 1 } })
              continue
            }
            const shape = spec.patterns || !scatter ? ser.marker : 'circle'
            if (scatter && shape === 'circle' && !lean) blobFill(ink, ellipsePoly(d.x, d.y, d.r * 0.8, d.r * 0.8, 12), key, { alpha: calm ? 0.3 : 0.4, mis: calm ? false : 0.8, rough: 0.3 })
            drawMarker(ink, shape, d.x, d.y, scatter ? Math.max(3.2, d.r * 0.78) : d.r, { color: key, rich: !lean && !calm, pen: 'ink.fine', width: scatter ? 1.4 : undefined })
          }
        },
        'top',
      )
      if (L.notes.length || L.refs.length) drawNotes(ink, L, spec)
    })
  },
})
