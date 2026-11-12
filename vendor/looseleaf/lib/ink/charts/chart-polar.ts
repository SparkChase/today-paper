import type { Pt } from '@/lib/ink/types'
import { bucketOf, clampN, isNum, shares, textWidth, type LabelFont } from '@/lib/ink/charts/chart-scale'
import type { ChartLabel, ChartLayoutBase, ChartTargets, CursorSpec, GaugeSpec, Pattern, PieSpec, RadarSpec, RadialSpec } from '@/lib/ink/charts/chart-types'

export const TAU = Math.PI * 2
export const deg = (d: number): number => (d * Math.PI) / 180

export const polar = (cx: number, cy: number, r: number, a: number): Pt => [cx + r * Math.sin(a), cy - r * Math.cos(a)]

export function angleOf(cx: number, cy: number, x: number, y: number): number {
  const a = Math.atan2(x - cx, cy - y)
  return a < 0 ? a + TAU : a
}

export function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, step = 4): Pt[] {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / step))
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) out.push(polar(cx, cy, r, a0 + ((a1 - a0) * i) / n))
  return out
}

export function sectorPoly(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number, step = 4): Pt[] {
  const outer = arcPts(cx, cy, r1, a0, a1, step)
  if (r0 <= 0.5) return [[cx, cy], ...outer]
  return [...outer, ...arcPts(cx, cy, r0, a1, a0, step)]
}

function boundsOf(pts: Pt[], pad: number): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of pts) {
    x0 = Math.min(x0, p[0])
    y0 = Math.min(y0, p[1])
    x1 = Math.max(x1, p[0])
    y1 = Math.max(y1, p[1])
  }
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad }
}

interface PolarMetrics {
  font: LabelFont
  tick: number
  value: number
  center: number
}
const metrics = (bucket: 'sm' | 'md' | 'lg', calm: boolean): PolarMetrics =>
  calm ? { font: 'hand', tick: 12.5, value: 12.5, center: bucket === 'sm' ? 22 : 28 } : { font: 'script', tick: bucket === 'sm' ? 14 : 15, value: 15, center: bucket === 'sm' ? 30 : 40 }

export interface PieSector {
  index: number
  a0: number
  a1: number
  fraction: number
}
export interface PieLayout extends ChartLayoutBase {
  cx: number
  cy: number
  R: number
  r0: number
  sectors: PieSector[]
  sliceOf: number[]
  total: number
}

export function layoutPie(spec: PieSpec, box: { w: number; h: number }, calm = false): PieLayout {
  const { w, h } = box
  const bucket = bucketOf(w)
  const M = metrics(bucket, calm)
  const labels: ChartLabel[] = []
  const total = spec.slices.reduce((n, s) => n + (isNum(s.value) && s.value > 0 ? s.value : 0), 0)
  const wantsLabels = spec.labels && spec.state === 'ready' && total > 0
  const pad = wantsLabels ? M.tick + 20 : 8
  const R = Math.max(12, Math.min(w, h) / 2 - pad)
  const cx = w / 2
  const cy = h / 2
  const r0 = R * clampN(spec.inner, 0, 0.9)
  const sectors: PieSector[] = []
  const sliceOf: number[] = []
  let a = deg(spec.start)
  spec.slices.forEach((s, i) => {
    const v = isNum(s.value) && s.value > 0 ? s.value : 0
    if (!v || !total) return
    const f = v / total
    sectors.push({ index: i, a0: a, a1: a + f * TAU, fraction: f })
    sliceOf.push(i)
    a += f * TAU
  })
  if (wantsLabels) {
    const pct = shares(spec.slices.map((s) => s.value))
    for (const sc of sectors) {
      if (sc.fraction < 0.045) continue
      const mid = (sc.a0 + sc.a1) / 2
      const p = polar(cx, cy, R + 12, mid)
      const text = spec.slices[sc.index].label ?? pct[sc.index]
      const s = Math.sin(mid)
      labels.push({ id: `l-${sc.index}`, text, x: p[0], y: p[1], anchor: s > 0.25 ? 'start' : s < -0.25 ? 'end' : 'middle', valign: Math.cos(mid) > 0.3 ? 'bottom' : Math.cos(mid) < -0.3 ? 'top' : 'middle', role: 'value', size: M.value, tone: 'ink' })
    }
  }
  const targets: ChartTargets = {
    n: sectors.length,
    mode: 'sector',
    cx: sectors.map((s) => polar(cx, cy, (R + r0) / 2, (s.a0 + s.a1) / 2)[0]),
    cy: sectors.map((s) => polar(cx, cy, (R + r0) / 2, (s.a0 + s.a1) / 2)[1]),
    nav: 'linear',
    sector: { cx, cy, r0: sectors.map(() => r0), r1: sectors.map(() => R + 4), a0: sectors.map((s) => s.a0), a1: sectors.map((s) => s.a1) },
  }
  const cursorAt = (i: number): CursorSpec[] => {
    const s = sectors[i]
    if (!s) return []
    const b = boundsOf(sectorPoly(cx, cy, r0, R + 3, s.a0, s.a1, 6), 8)
    return [{ kind: 'slice', ...b, cx: cx - b.x, cy: cy - b.y, r0, r1: R + 3, a0: s.a0, a1: s.a1 }]
  }
  if (spec.state !== 'ready' || !total) {
    labels.push({ id: 'state', text: spec.stateText ?? (spec.state === 'loading' ? 'Loading' : 'No data'), x: cx, y: cy, anchor: 'middle', valign: 'middle', role: 'center', size: M.center * 0.6, tone: 'muted' })
  }
  return { w, h, bucket, labels, targets, cursorAt, cx, cy, R, r0, sectors, sliceOf, total }
}

export interface RadarLayout extends ChartLayoutBase {
  cx: number
  cy: number
  R: number
  axesAngles: number[]
  rings: number[]
  polys: Array<Array<Pt | null>>
}

export function layoutRadar(spec: RadarSpec, box: { w: number; h: number }, calm = false): RadarLayout {
  const { w, h } = box
  const bucket = bucketOf(w)
  const M = metrics(bucket, calm)
  const n = spec.axes.length
  const labels: ChartLabel[] = []
  const widest = Math.max(0, ...spec.axes.map((t) => textWidth(t, M.tick, M.font)))
  const sidePad = Math.min(widest, w * 0.22) + 16
  const R = Math.max(14, Math.min((w - 2 * sidePad) / 2, (h - 2 * (M.tick + 12)) / 2))
  const cx = w / 2
  const cy = h / 2
  const axesAngles = spec.axes.map((_, k) => (k * TAU) / Math.max(1, n))
  const levelCount = Math.min(12, Math.max(1, Math.round(spec.levels) || 1))
  const rings = Array.from({ length: levelCount }, (_, l) => (R * (l + 1)) / levelCount)
  const polys = spec.series.map((s) =>
    spec.axes.map((_, k) => {
      const v = s.values[k]
      return isNum(v) ? polar(cx, cy, R * clampN(v / (spec.max || 1), 0, 1.02), axesAngles[k]) : null
    }),
  )
  if (spec.state === 'ready' && n >= 3) {
    axesAngles.forEach((a, k) => {
      const p = polar(cx, cy, R + 10, a)
      const s = Math.sin(a)
      const c = Math.cos(a)
      labels.push({ id: `a-${k}`, text: spec.axes[k], x: p[0], y: p[1], anchor: s > 0.3 ? 'start' : s < -0.3 ? 'end' : 'middle', valign: c > 0.5 ? 'bottom' : c < -0.5 ? 'top' : 'middle', role: 'cat', size: M.tick, tone: 'ink', maxW: sidePad })
    })
    const gapAngle = Math.PI / n
    spec.ringLabels.forEach((t, l) => {
      if (!t || bucket === 'sm') return
      const r = rings[levelCount - 1 - l] ?? 0
      const p = polar(cx, cy, r, gapAngle)
      labels.push({ id: `r-${l}`, text: t, x: p[0] + 2, y: p[1], anchor: 'start', valign: 'middle', role: 'y', size: Math.max(12, M.tick - 2), tone: 'muted' })
    })
  }
  const targets: ChartTargets = {
    n,
    mode: 'sector',
    cx: axesAngles.map((a) => polar(cx, cy, R, a)[0]),
    cy: axesAngles.map((a) => polar(cx, cy, R, a)[1]),
    nav: 'linear',
    sector: { cx, cy, r0: axesAngles.map(() => 0), r1: axesAngles.map(() => R + 30), a0: axesAngles.map((a) => a - Math.PI / Math.max(1, n)), a1: axesAngles.map((a) => a + Math.PI / Math.max(1, n)) },
  }
  const cursorAt = (i: number): CursorSpec[] => {
    if (i < 0 || i >= n) return []
    const tip = polar(cx, cy, R, axesAngles[i])
    const b = boundsOf([[cx, cy], tip], 10)
    return [{ kind: 'spoke', ...b, x1: cx - b.x, y1: cy - b.y, x2: tip[0] - b.x, y2: tip[1] - b.y }]
  }
  if (spec.state !== 'ready' || n < 3) labels.push({ id: 'state', text: spec.stateText ?? (spec.state === 'loading' ? 'Loading' : 'No data'), x: cx, y: cy, anchor: 'middle', valign: 'middle', role: 'center', size: M.center * 0.6, tone: 'muted' })
  return { w, h, bucket, labels, targets, cursorAt, cx, cy, R, axesAngles, rings, polys }
}

export interface RadialArc {
  index: number
  r: number
  t: number
  a0: number
  a1: number
  aEnd: number
}
export interface RadialLayout extends ChartLayoutBase {
  cx: number
  cy: number
  R: number
  hole: number
  arcs: RadialArc[]
}

export function layoutRadial(spec: RadialSpec, box: { w: number; h: number }, calm = false): RadialLayout {
  const { w, h } = box
  const bucket = bucketOf(w)
  const M = metrics(bucket, calm)
  const labels: ChartLabel[] = []
  const cx = w / 2
  const cy = h / 2
  const R = Math.max(20, Math.min(w, h) / 2 - 8)
  const m = Math.max(1, spec.rings.length)
  const hole = R * (m > 4 ? 0.22 : 0.3)
  const band = (R - hole) / m
  const t = clampN(band * 0.7, 6, 28)
  const a0 = deg(spec.start)
  const aEnd = deg(spec.end)
  const arcs: RadialArc[] = spec.rings.map((ring, k) => {
    const f = clampN(isNum(ring.value) ? ring.value / (ring.max || 1) : 0, 0, 1)
    return { index: k, r: R - band * (k + 0.5), t, a0, a1: a0 + (aEnd - a0) * f, aEnd }
  })
  if (spec.state === 'ready' && Math.abs(spec.end - spec.start) < 330 && bucket !== 'sm') {
    const left = spec.start === 0
    arcs.forEach((a, k) => labels.push({ id: `n-${k}`, text: spec.rings[k].name, x: cx + (left ? -6 : 6), y: cy - a.r, anchor: left ? 'end' : 'start', valign: 'middle', role: 'cat', size: Math.max(12, M.tick - 1), tone: 'ink', maxW: cx - 10 }))
  }
  const targets: ChartTargets = {
    n: spec.rings.length,
    mode: 'sector',
    cx: arcs.map((a) => polar(cx, cy, a.r, (a.a0 + a.a1) / 2)[0]),
    cy: arcs.map((a) => polar(cx, cy, a.r, (a.a0 + a.a1) / 2)[1]),
    nav: 'linear',
    sector: { cx, cy, r0: arcs.map((a) => a.r - band / 2), r1: arcs.map((a) => a.r + band / 2), a0: arcs.map((a) => a.a0), a1: arcs.map((a) => a.aEnd) },
  }
  const cursorAt = (i: number): CursorSpec[] => {
    const a = arcs[i]
    if (!a) return []
    const b = boundsOf(sectorPoly(cx, cy, a.r - a.t / 2 - 2, a.r + a.t / 2 + 2, a.a0, a.aEnd, 6), 6)
    return [{ kind: 'slice', ...b, cx: cx - b.x, cy: cy - b.y, r0: a.r - a.t / 2 - 2, r1: a.r + a.t / 2 + 2, a0: a.a0, a1: a.aEnd }]
  }
  if (spec.state !== 'ready' || !spec.rings.length) labels.push({ id: 'state', text: spec.stateText ?? (spec.state === 'loading' ? 'Loading' : 'No data'), x: cx, y: cy, anchor: 'middle', valign: 'middle', role: 'center', size: M.center * 0.6, tone: 'muted' })
  return { w, h, bucket, labels, targets, cursorAt, cx, cy, R, hole, arcs }
}

export interface GaugeZoneGeom {
  a0: number
  a1: number
  slot: number
  pattern: Pattern
}
export interface GaugeLayout extends ChartLayoutBase {
  cx: number
  cy: number
  R: number
  t: number
  a0: number
  a1: number
  av: number
  zones: GaugeZoneGeom[]
  tickAngles: number[]
}

export function layoutGauge(spec: GaugeSpec, box: { w: number; h: number }, calm = false): GaugeLayout {
  const { w, h } = box
  const bucket = bucketOf(w)
  const M = metrics(bucket, calm)
  const labels: ChartLabel[] = []
  const half = deg(spec.sweep) / 2
  const below = M.center + 6
  const down = Math.max(0, -Math.cos(half))
  const R = Math.max(20, Math.min(w / 2 - 14, (h - 16 - below * (spec.sweep <= 180 ? 1 : 0.6)) / (1 + down)))
  const used = R * (1 + down) + below * (spec.sweep <= 180 ? 1 : 0.6)
  const cx = w / 2
  const cy = Math.max(R + 6, (h - used) / 2 + R)
  const t = clampN(R * 0.2, 9, 30)
  const span = Math.max(1e-6, spec.max - spec.min)
  const f = clampN((spec.value - spec.min) / span, 0, 1)
  const a0 = -half
  const a1 = half
  const av = a0 + (a1 - a0) * f
  const zones: GaugeZoneGeom[] = []
  let prev = spec.min
  for (const z of spec.zones) {
    const to = clampN(z.to, spec.min, spec.max)
    if (to > prev) zones.push({ a0: a0 + ((prev - spec.min) / span) * (a1 - a0), a1: a0 + ((to - spec.min) / span) * (a1 - a0), slot: z.slot, pattern: z.pattern })
    prev = to
  }
  const tickCount = Math.min(60, Math.max(0, Math.round(spec.ticks) || 0))
  const tickAngles = Array.from({ length: tickCount + 1 }, (_, k) => a0 + ((a1 - a0) * k) / Math.max(1, tickCount))
  if (spec.state === 'ready') {
    const pa = polar(cx, cy, R - t / 2, a0)
    const pb = polar(cx, cy, R - t / 2, a1)
    labels.push({ id: 'min', text: spec.minLabel, x: pa[0], y: pa[1] + t / 2 + 6, anchor: 'middle', valign: 'top', role: 'x', size: M.tick, tone: 'muted' })
    labels.push({ id: 'max', text: spec.maxLabel, x: pb[0], y: pb[1] + t / 2 + 6, anchor: 'middle', valign: 'top', role: 'x', size: M.tick, tone: 'muted' })
  } else labels.push({ id: 'state', text: spec.stateText ?? (spec.state === 'loading' ? 'Loading' : 'No data'), x: cx, y: cy - R * 0.35, anchor: 'middle', valign: 'middle', role: 'center', size: M.center * 0.6, tone: 'muted' })
  const targets: ChartTargets = { n: 0, mode: 'point', cx: [], cy: [], nav: 'linear' }
  return { w, h, bucket, labels, targets, cursorAt: () => [], cx, cy, R, t, a0, a1, av, zones, tickAngles }
}
