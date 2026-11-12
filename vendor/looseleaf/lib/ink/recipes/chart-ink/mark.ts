import { blobFill, flatFill } from '@/lib/ink/fills'
import { roundRectPoly, seg } from '@/lib/ink/geom'
import { box, loop } from '@/lib/ink/shapes'
import { defineRecipe } from '@/lib/ink/recipes'
import { arcPts, sectorPoly } from '@/lib/ink/charts/chart-polar'
import { slotKey, type MiniParams } from '@/lib/ink/charts/chart-types'
import { hatchOn } from '@/lib/ink/recipes/chart-ink/xy'
import { drawMarker, drawPolyline, patternFill, rectPts, swipeFill } from '@/lib/ink/recipes/chart-ink/parts'
import type { Pt } from '@/lib/ink/types'

export const markRecipe = defineRecipe<MiniParams>({
  id: 'chart-mark',
  kind: 'chart',
  layers: ['rest'],
  pad: 10,
  draw(ink, { w, h }, p, ctx) {
    const calm = ctx.calm
    ink.layer('rest', () => {
      switch (p.kind) {
        case 'swatch': {
          const key = slotKey(p.slot)
          if (p.line) {
            const y = h / 2
            drawPolyline(ink, [[1, y + 0.5], [w * 0.5, y - 0.4], [w - 1, y]], p.dash ?? 'solid', 'ink', { color: key, width: 1.15, simple: true })
            if (p.marker && p.marker !== 'none') drawMarker(ink, p.marker, w / 2, y, Math.min(w, h) * 0.3, { color: key, rich: false, pen: 'ink.fine' })
            return
          }
          const s = Math.min(w, h)
          const x0 = (w - s) / 2
          const y0 = (h - s) / 2
          const sq = roundRectPoly(x0 + 0.8, y0 + 0.8, s - 1.6, s - 1.6, Math.min(3, s / 4))
          ink.part('fill', () => flatFill(ink, sq, key, 0.95))
          if (p.pattern !== 'solid') patternFill(ink, p.pattern, rectPts(x0 + 2, y0 + 2, s - 4, s - 4), { color: hatchOn(p.slot), maxPulls: 9, alpha: 0.75, gapK: 0.62 })
          ink.flat('text', 'M' + sq.map((q) => `${q[0].toFixed(2)} ${q[1].toFixed(2)}`).join('L') + 'Z', 'ink', 1, { stroke: 'ink', sw: 1.1 })
          return
        }
        case 'column':
          swipeFill(ink, { x: 1.5, y: 1.5, w: w - 3, h: h - 3 }, w > h, calm)
          return
        case 'guide': {
          const x = w / 2
          const gap = 11
          for (let y = 2; y < h - 4; y += gap) ink.stroke(seg(x + Math.sin(y) * 0.4, y, x + Math.sin(y + 1) * 0.4, Math.min(h - 2, y + gap * 0.62), 0, 2), 'pencil', { simple: true, alpha: 0.75, width: 0.95, start: 'soft', end: 'soft' })
          return
        }
        case 'ring':
          loop(ink, w / 2, h / 2, w / 2 - 2, h / 2 - 2.3, { pen: 'ink', opts: { color: slotKey(p.slot), width: 0.95, simple: true }, turns: 1.1 })
          return
        case 'slice': {
          const poly = sectorPoly(p.cx, p.cy, p.r0, p.r1, p.a0, p.a1, 5)
          blobFill(ink, poly, 'hi', { alpha: 0.26, mis: false, rough: 0.6 })
          const edge: Pt[] = [...arcPts(p.cx, p.cy, p.r1, p.a0, p.a1, 4), ...arcPts(p.cx, p.cy, Math.max(0.5, p.r0), p.a1, p.a0, 4)]
          ink.stroke([...edge, edge[0], edge[1]], 'ink', { poly: true, round: 1.5, width: 1.1, simple: true, wobble: 0.5, end: 'flick' })
          return
        }
        case 'cell':
          blobFill(ink, rectPts(2, 2, w - 4, h - 4), 'hi', { alpha: 0.22, mis: false, rough: 0.5 })
          box(ink, 1, 1, w - 2, h - 2, { pen: 'ink', corner: 2, opts: { simple: true, width: 1 } })
          return
        case 'spoke':
          ink.stroke(seg(p.x1, p.y1, p.x2, p.y2, 0.6, 8), 'hi', { width: 0.7, alpha: 0.9, start: 'soft', end: 'soft' })
          return
      }
    })
  },
})
