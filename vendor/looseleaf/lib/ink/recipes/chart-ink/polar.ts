import type { Ink } from '@/lib/ink/builder'
import { blobFill, wash, type Offset } from '@/lib/ink/fills'
import { clamp } from '@/lib/ink/rng'
import { focusRing, loop, RULER } from '@/lib/ink/shapes'
import { defineRecipe } from '@/lib/ink/recipes'
import { arcPts, layoutGauge, layoutPie, layoutRadar, layoutRadial, polar, sectorPoly, TAU } from '@/lib/ink/charts/chart-polar'
import { slotKey, type GaugeSpec, type PieSpec, type RadarSpec, type RadialSpec } from '@/lib/ink/charts/chart-types'
import { hatchOn } from '@/lib/ink/recipes/chart-ink/xy'
import { drawMarker, patternFill } from '@/lib/ink/recipes/chart-ink/parts'
import type { Pt } from '@/lib/ink/types'

function ghostRing(ink: Ink, cx: number, cy: number, R: number, r0: number): void {
  ink.group(
    { part: 'pulse' },
    () => {
      ink.stroke(arcPts(cx, cy, R, 0.1, TAU + 0.16, 5), 'pencil', { simple: true, alpha: 0.7, width: 0.9, wobble: 0.8, poly: true })
      if (r0 > 4) ink.stroke(arcPts(cx, cy, r0, 0.4, TAU + 0.2, 5), 'pencil', { simple: true, alpha: 0.6, width: 0.9, wobble: 0.8, poly: true })
    },
    'top',
  )
}

export const pieRecipe = defineRecipe<PieSpec>({
  id: 'chart-pie',
  kind: 'chart',
  layers: ['rest', 'focus'],
  lazy: ['focus'],
  pad: 14,
  draw(ink, box, spec, ctx) {
    ctx.lazy('focus', (f) => focusRing(f, 0, 0, box.w, box.h, { r: 6 }))
    if (ctx.lazyOnly) return
    const L = layoutPie(spec, box, ctx.calm)
    const { cx, cy, R, r0 } = L
    const calm = ctx.calm
    ink.layer('rest', () => {
      if (spec.state !== 'ready' || !L.sectors.length) {
        ghostRing(ink, cx, cy, R, r0)
        return
      }
      const many = L.sectors.length > 6
      const perSlice = clamp(Math.floor(160 / L.sectors.length), 10, 60)
      ink.group(
        { part: 'wipe' },
        () => {
          const gapA = Math.min(0.03, 1.4 / R)
          ink.part('fill', () => {
            let first: Offset | undefined
            for (const s of L.sectors) {
              const poly = sectorPoly(cx, cy, r0, R - 0.5, s.a0 + gapA, s.a1 - gapA, 5)
              const off = blobFill(ink, poly, slotKey(spec.slices[s.index].slot), { alpha: calm ? 0.8 : 0.88, mis: calm ? false : clamp(R * 0.02, 1, 2.6), rough: calm ? 0.3 : 0.6 })
              first ??= off
            }
            return first
          })
          for (const s of L.sectors) {
            const sl = spec.slices[s.index]
            if (spec.patterns && sl.pattern !== 'solid') patternFill(ink, sl.pattern, sectorPoly(cx, cy, r0 + 1.5, R - 2, s.a0 + gapA * 2, s.a1 - gapA * 2, 6), { color: hatchOn(sl.slot), maxPulls: perSlice, alpha: 0.7 })
          }
          const ring = { simple: many || calm, wobble: calm ? 0.2 : 0.7, poly: true as const }
          const one = L.sectors.length === 1
          const a = L.sectors[0]?.a0 ?? 0
          ink.stroke(arcPts(cx, cy, R, a, a + TAU + 0.07, 4), calm ? 'ink.fine' : 'ink', { ...ring, width: calm ? 0.9 : 0.95, end: 'flick' })
          if (r0 > 4) ink.stroke(arcPts(cx, cy, r0, a + 0.3, a + 0.3 + TAU + 0.06, 4), calm ? 'ink.fine' : 'ink.fine', { ...ring, width: 1.05, end: 'flick' })
          if (!one) {
            for (const s of L.sectors) {
              const p0 = polar(cx, cy, Math.max(0, r0 - 1.5), s.a0)
              const p1 = polar(cx, cy, R + 1.6, s.a0)
              ink.stroke([p0, p1], 'ink.fine', { ...RULER, simple: true, width: 1.1 })
            }
          }
        },
        'top',
      )
    })
  },
})

export const radarRecipe = defineRecipe<RadarSpec>({
  id: 'chart-radar',
  kind: 'chart',
  layers: ['rest', 'focus'],
  lazy: ['focus'],
  pad: 14,
  draw(ink, box, spec, ctx) {
    ctx.lazy('focus', (f) => focusRing(f, 0, 0, box.w, box.h, { r: 6 }))
    if (ctx.lazyOnly) return
    const L = layoutRadar(spec, box, ctx.calm)
    const { cx, cy, R } = L
    const calm = ctx.calm
    const n = spec.axes.length
    ink.layer('rest', () => {
      if (spec.state !== 'ready' || n < 3) {
        ghostRing(ink, cx, cy, R, 0)
        return
      }
      L.rings.forEach((r, k) => {
        const ring = L.axesAngles.map((a) => polar(cx, cy, r, a))
        const alpha = k === L.rings.length - 1 ? 0.75 : 0.45
        ring.forEach((p, i) => {
          const q = ring[(i + 1) % ring.length]
          ink.stroke([p, q], 'pencil', { ...RULER, simple: true, alpha, width: calm ? 0.75 : 0.8 })
        })
      })
      L.axesAngles.forEach((a) => {
        const p = polar(cx, cy, R, a)
        ink.stroke([[cx, cy], p], 'pencil', { ...RULER, simple: true, alpha: 0.5, width: 0.75 })
      })
      ink.group(
        { part: 'wipe' },
        () => {
          spec.series.forEach((s, k) => {
            const key = slotKey(s.slot)
            const pts = L.polys[k].map((p, i) => p ?? polar(cx, cy, 0, L.axesAngles[i]))
            if (spec.fill) {
              wash(ink, pts, key, { alpha: calm ? 0.16 : 0.3, shift: calm ? 0 : 1.4, inset: 0.4, wobble: calm ? 0.2 : 0.5 })
              if (spec.patterns && s.pattern !== 'solid') patternFill(ink, s.pattern, pts, { color: key, maxPulls: 46, alpha: 0.55, gapK: 1.2 })
            }
            ink.stroke([...pts, pts[0], pts[1]], 'ink', { color: key, poly: true, round: 1.4, width: calm ? 1 : 1.15, wobble: 0.5, simple: calm || spec.series.length > 3, end: 'flick' })
            if (spec.dots) {
              pts.forEach((p, i) => {
                if (L.polys[k][i]) drawMarker(ink, spec.patterns ? s.marker : 'circle', p[0], p[1], 3.4, { color: key, rich: !calm && n * spec.series.length <= 40, pen: 'ink.fine' })
              })
            }
          })
        },
        'top',
      )
    })
  },
})

export const radialRecipe = defineRecipe<RadialSpec>({
  id: 'chart-radial',
  kind: 'chart',
  layers: ['rest', 'focus'],
  lazy: ['focus'],
  pad: 14,
  draw(ink, box, spec, ctx) {
    ctx.lazy('focus', (f) => focusRing(f, 0, 0, box.w, box.h, { r: 6 }))
    if (ctx.lazyOnly) return
    const L = layoutRadial(spec, box, ctx.calm)
    const { cx, cy } = L
    const calm = ctx.calm
    ink.layer('rest', () => {
      if (spec.state !== 'ready' || !L.arcs.length) {
        ghostRing(ink, cx, cy, L.R, L.hole)
        return
      }
      for (const a of L.arcs) {
        const track = sectorPoly(cx, cy, a.r - a.t / 2, a.r + a.t / 2, a.a0, a.aEnd, 5)
        wash(ink, track, 'paper-shade', { alpha: 0.9, shift: 0, inset: 0.3, wobble: 0.3 })
        const rim = [...arcPts(cx, cy, a.r + a.t / 2, a.a0, a.aEnd, 5), ...arcPts(cx, cy, a.r - a.t / 2, a.aEnd, a.a0, 5)]
        ink.stroke([...rim, rim[0], rim[1]], 'pencil', { poly: true, round: 1.5, simple: true, alpha: 0.6, width: 0.75, wobble: 0.5 })
      }
      ink.group(
        { part: 'wipe' },
        () => {
          ink.part('fill', () => {
            let first: Offset | undefined
            for (const a of L.arcs) {
              if (a.a1 - a.a0 < 0.02) continue
              const poly = sectorPoly(cx, cy, a.r - a.t / 2 + 0.5, a.r + a.t / 2 - 0.5, a.a0, a.a1, 4)
              const off = blobFill(ink, poly, slotKey(spec.rings[a.index].slot), { alpha: calm ? 0.8 : 0.9, mis: calm ? false : 1.6, rough: 0.4 })
              first ??= off
            }
            return first
          })
          L.arcs.forEach((a) => {
            const ring = spec.rings[a.index]
            if (a.a1 - a.a0 < 0.02) return
            if (spec.patterns && ring.pattern !== 'solid') patternFill(ink, ring.pattern, sectorPoly(cx, cy, a.r - a.t / 2 + 1.5, a.r + a.t / 2 - 1.5, a.a0 + 0.02, a.a1 - 0.02, 5), { color: hatchOn(ring.slot), maxPulls: 34, alpha: 0.7 })
            const outline: Pt[] = [...arcPts(cx, cy, a.r + a.t / 2, a.a0, a.a1, 4), ...arcPts(cx, cy, a.r - a.t / 2, a.a1, a.a0, 4)]
            ink.stroke([...outline, outline[0], outline[1]], calm ? 'ink.fine' : 'ink.fine', { poly: true, simple: calm || L.arcs.length > 4, width: 1.05, wobble: 0.5, end: 'flick', round: 1.5 })
          })
        },
        'top',
      )
    })
  },
})

export const gaugeRecipe = defineRecipe<GaugeSpec>({
  id: 'chart-gauge',
  kind: 'chart',
  layers: ['rest', 'focus'],
  lazy: ['focus'],
  pad: 14,
  draw(ink, box, spec, ctx) {
    ctx.lazy('focus', (f) => focusRing(f, 0, 0, box.w, box.h, { r: 6 }))
    if (ctx.lazyOnly) return
    const L = layoutGauge(spec, box, ctx.calm)
    const { cx, cy, R, t } = L
    const calm = ctx.calm
    ink.layer('rest', () => {
      if (spec.state !== 'ready') {
        ink.group({ part: 'pulse' }, () => ink.stroke(arcPts(cx, cy, R - t / 2, L.a0, L.a1, 5), 'pencil', { simple: true, alpha: 0.7, width: 0.9, wobble: 0.8, poly: true }), 'top')
        return
      }
      const zoned = L.zones.length > 0
      const track = sectorPoly(cx, cy, R - t, R, L.a0, L.a1, 4)
      if (!zoned) wash(ink, track, 'paper-shade', { alpha: 0.95, shift: calm ? 0 : 0.8, inset: 0.3, wobble: 0.3 })
      ink.group(
        { part: 'wipe' },
        () => {
          if (zoned) {
            ink.part('fill', () => {
              let first: Offset | undefined
              for (const z of L.zones) {
                const off = blobFill(ink, sectorPoly(cx, cy, R - t + 0.6, R - 0.6, z.a0, z.a1, 4), slotKey(z.slot), { alpha: calm ? 0.8 : 0.88, mis: calm ? false : 1.5, rough: 0.4 })
                first ??= off
              }
              return first
            })
            for (const z of L.zones) {
              if (spec.patterns && z.pattern !== 'solid') patternFill(ink, z.pattern, sectorPoly(cx, cy, R - t + 2, R - 2, z.a0 + 0.02, z.a1 - 0.02, 5), { color: hatchOn(z.slot), maxPulls: 30, alpha: 0.7 })
            }
          } else if (L.av - L.a0 > 0.02) {
            const key = slotKey(0)
            ink.part('fill', () => blobFill(ink, sectorPoly(cx, cy, R - t + 0.6, R - 0.6, L.a0, L.av, 4), key, { alpha: 0.9, mis: calm ? false : 1.5, rough: 0.4 }))
          }
          const pen = calm ? 'ink.fine' : 'ink'
          const open = { poly: true as const, wobble: calm ? 0.2 : 0.7, width: calm ? 0.9 : 1, end: 'flick' as const, simple: calm }
          ink.stroke(arcPts(cx, cy, R, L.a0 - 0.02, L.a1 + 0.03, 4), pen, open)
          ink.stroke(arcPts(cx, cy, R - t, L.a0 - 0.01, L.a1 + 0.02, 4), 'ink.fine', { ...open, width: 1.05 })
          for (const a of [L.a0, L.a1, ...L.zones.map((z) => z.a1)]) {
            const p0 = polar(cx, cy, R - t - 2, a)
            const p1 = polar(cx, cy, R + 2, a)
            ink.stroke([p0, p1], 'ink.fine', { ...RULER, simple: true, width: 1.05 })
          }
          if (!calm) {
            for (const a of L.tickAngles) {
              const p0 = polar(cx, cy, R + 4, a)
              const p1 = polar(cx, cy, R + 9, a)
              ink.stroke([p0, p1], 'pencil', { ...RULER, simple: true, alpha: 0.6, width: 0.8 })
            }
          }
          if (zoned || spec.zones.length === 0) {
            const tip = polar(cx, cy, R - t * 0.2, L.av)
            const base = polar(cx, cy, 6, L.av + Math.PI)
            ink.stroke([base, tip], 'redfelt', { ...RULER, width: calm ? 1 : 1.3, simple: calm })
            loop(ink, cx, cy, 5.4, 5.2, { pen: 'ink.fine', opts: { simple: true, width: 1 } })
            ink.dot(cx, cy, 2.4, 'ink')
          }
        },
        'top',
      )
    })
  },
})
