import type { Pt } from '@/lib/ink/types'
import { bucketOf, clampN, clearLabels, isNum, labelWidth, lttb, monotoneCurve, pickLabelIndices, stepCurve, strideIndices, textWidth, type Bucket, type LabelFont } from '@/lib/ink/charts/chart-scale'
import type { AxisTick, ChartLabel, ChartLayoutBase, CursorSpec, NotePen, XYSeries, XYSpec } from '@/lib/ink/charts/chart-types'

export interface XYBar {
  s: number
  i: number
  x: number
  y: number
  w: number
  h: number
  v: number
  neg: boolean
}
export interface XYLine {
  s: number
  segs: Pt[][]
  pts: Array<Pt | null>
}
export interface XYArea {
  s: number
  polys: Pt[][]
}
export interface XYDot {
  s: number
  i: number
  x: number
  y: number
  r: number
  last: boolean
}
export interface XYNoteGeom {
  n: number
  pen: NotePen
  shape: 'loop' | 'underline' | 'none'
  loop: { cx: number; cy: number; rx: number; ry: number } | null
  underline: { x1: number; x2: number; y: number } | null
  arrow: { x1: number; y1: number; x2: number; y2: number } | null
}
export interface XYBandGeom {
  x: number
  y: number
  w: number
  h: number
}
export interface XYRefGeom {
  x1: number
  y1: number
  x2: number
  y2: number
  pen: NotePen
}

export interface XYLayout extends ChartLayoutBase {
  plot: { x0: number; y0: number; x1: number; y1: number }
  horizontal: boolean
  band: number
  gridPx: number[]
  basePx: number
  bars: XYBar[]
  lines: XYLine[]
  areas: XYArea[]
  dots: XYDot[]
  notes: XYNoteGeom[]
  refs: XYRefGeom[]
  bands: XYBandGeom[]
  barW: number
  pointOf: Array<{ s: number; j: number }>
  simplified: number
}

export const XY_MARGINS = { top: 12, right: 12 }

export function isHorizontal(spec: XYSpec): boolean {
  return spec.horizontal && spec.series.length > 0 && spec.series.every((s) => s.kind === 'bar')
}

export function stackRanges(series: XYSeries[], stacked: boolean, n: number): Array<Array<[number, number] | null>> {
  const out: Array<Array<[number, number] | null>> = series.map(() => new Array(n).fill(null))
  if (!stacked) {
    series.forEach((s, k) => {
      for (let i = 0; i < n; i++) {
        const v = s.values[i]
        if (isNum(v)) out[k][i] = v >= 0 ? [0, v] : [v, 0]
      }
    })
    return out
  }
  for (let i = 0; i < n; i++) {
    let pos = 0
    let neg = 0
    series.forEach((s, k) => {
      const v = s.values[i]
      if (!isNum(v)) return
      if (v >= 0) {
        out[k][i] = [pos, pos + v]
        pos += v
      } else {
        out[k][i] = [neg + v, neg]
        neg += v
      }
    })
  }
  return out
}

interface Metrics {
  font: LabelFont
  tick: number
  value: number
  note: number
}

function metricsFor(bucket: Bucket, calm: boolean): Metrics {
  if (calm) return { font: 'hand', tick: 12.5, value: 12, note: 15 }
  return { font: 'script', tick: bucket === 'sm' ? 14 : bucket === 'md' ? 15 : 16, value: bucket === 'lg' ? 16 : 15, note: bucket === 'sm' ? 18 : 20 }
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1])

const isNiceStep = (t: readonly AxisTick[]): boolean => {
  if (t.length < 2) return true
  const st = Math.abs(t[1].v - t[0].v)
  if (!(st > 0)) return true
  const m = st / 10 ** Math.floor(Math.log10(st))
  return [1, 2, 5, 10].some((x) => Math.abs(m - x) < 1e-6)
}

export function pickTicks(dense: readonly AxisTick[], alt: readonly (readonly AxisTick[])[] | undefined, max: number, span: readonly [number, number]): AxisTick[] {
  if (dense.length <= max) return [...dense]
  const eps = Math.abs(span[1] - span[0]) * 1e-6
  const fits = (alt ?? []).filter((t) => t.length >= 2 && t.length <= max)
  const reaches = (t: readonly AxisTick[]) => Math.abs(t[0].v - span[0]) <= eps && Math.abs(t[t.length - 1].v - span[1]) <= eps
  const most = (sets: readonly (readonly AxisTick[])[]) => sets.reduce<readonly AxisTick[] | null>((b, t) => (!b || t.length > b.length ? t : b), null)
  const ends = most(fits.filter(reaches))
  if (ends) return [...ends]
  const stride = strideIndices(dense.length, max).map((i) => dense[i])
  if (isNiceStep(stride)) return stride
  const other = most(fits)
  return other ? [...other] : stride
}

function sampleSeries(pts: Array<Pt | null>, curve: XYSpec['curve']): Pt[][] {
  const runs: Pt[][] = []
  let cur: Pt[] = []
  for (const p of pts) {
    if (p) cur.push(p)
    else if (cur.length) {
      runs.push(cur)
      cur = []
    }
  }
  if (cur.length) runs.push(cur)
  return runs.map((r) => (r.length < 2 ? r : curve === 'smooth' ? monotoneCurve(r, 4) : curve === 'step' ? stepCurve(r) : r))
}

export function layoutXY(spec: XYSpec, box: { w: number; h: number }, calm = false): XYLayout {
  const { w, h } = box
  const bucket = bucketOf(w)
  const M = metricsFor(bucket, calm)
  const horizontal = isHorizontal(spec)
  const scatter = spec.series.some((s) => s.kind === 'scatter')
  const n = spec.cats.length
  const hasBars = spec.series.some((s) => s.kind === 'bar')
  const labels: ChartLabel[] = []
  const empty = spec.state !== 'ready' || (!scatter && n === 0) || spec.series.length === 0

  const maxYTicks = horizontal ? Math.max(2, Math.floor((w * 0.7) / 54)) : Math.max(2, Math.floor((h - 60) / 38))
  const yTicks = pickTicks(spec.yTicks, spec.yTicksAlt, bucket === 'sm' && !horizontal ? Math.min(3, maxYTicks) : maxYTicks + 1, [spec.yMin, spec.yMax])
  const catW = horizontal ? Math.max(0, ...spec.cats.map((c) => textWidth(c, M.tick, M.font))) : 0
  const yLabelW = horizontal ? Math.min(catW, w * 0.36) : Math.max(0, ...yTicks.map((t) => textWidth(t.label, M.tick, M.font)))
  const left = spec.showY ? Math.ceil(yLabelW) + 12 : 6
  const fitsValues = (): boolean => {
    if (!spec.valueLabels || spec.values === false) return false
    if (spec.values === true) return true
    if (spec.stacked || bucket === 'sm') return false
    const barSeriesCount = spec.series.filter((s) => s.kind === 'bar').length
    if (!barSeriesCount) return false
    const slotLen = (horizontal ? h : w) / Math.max(1, spec.cats.length) / (spec.stacked ? 1 : barSeriesCount)
    const widest = Math.max(1, ...spec.valueLabels.flat().map((t) => (t ? textWidth(t, M.value, M.font) : 0)))
    return horizontal ? slotLen >= M.value : slotLen >= 28 && widest <= slotLen * 0.75
  }
  const wantsValues = !empty && fitsValues()
  const top = XY_MARGINS.top + (wantsValues && !horizontal ? M.value + 2 : 0) + (spec.notes.length ? 6 : 0)
  const bottom = spec.showX ? Math.round(M.tick + 14) : 8
  const right = XY_MARGINS.right + (horizontal && wantsValues ? 26 : 0)
  const x0 = left
  const x1 = Math.max(x0 + 10, w - right)
  const y0 = top
  const y1 = Math.max(y0 + 10, h - bottom)
  const plotW = x1 - x0
  const plotH = y1 - y0

  const catLen = horizontal ? plotH : plotW
  const band = n > 0 ? catLen / n : catLen

  const vMin = scatter || !horizontal ? spec.yMin : spec.yMin
  const vSpan = spec.yMax - vMin || 1
  const vPos = (v: number): number => (horizontal ? clampN(x0 + ((v - vMin) / vSpan) * plotW, x0 - 6, x1 + 6) : clampN(y1 - ((v - vMin) / vSpan) * plotH, y0 - 6, y1 + 6))
  const basePx = vPos(clampN(0, vMin, spec.yMax))

  const centered = hasBars || horizontal
  const inset = clampN(band * 0.5, 8, 26)
  const catPos = (i: number): number => {
    if (horizontal) return y0 + band * (i + 0.5)
    if (centered || n < 2) return x0 + band * (i + 0.5)
    return x0 + inset + ((plotW - 2 * inset) * i) / (n - 1)
  }
  const xMin = spec.xMin ?? 0
  const xSpan = (spec.xMax ?? 1) - xMin || 1
  const xNum = (v: number): number => clampN(x0 + ((v - xMin) / xSpan) * plotW, x0 - 6, x1 + 6)

  const bars: XYBar[] = []
  const barSeries = spec.series.map((s, k) => ({ s, k })).filter((e) => e.s.kind === 'bar')
  const ranges = stackRanges(barSeries.map((e) => e.s), spec.stacked, n)
  const m = spec.stacked ? 1 : Math.max(1, barSeries.length)
  const ratio = bucket === 'sm' ? 0.72 : bucket === 'md' ? 0.66 : 0.6
  const room = band * ratio
  const gap = m > 1 ? Math.max(0, Math.min(bucket === 'sm' ? 2 : 3, (room - m * 2.5) / (m - 1))) : 0
  const barW = clampN((room - gap * (m - 1)) / m, 1, 58)
  const groupW = m * barW + gap * (m - 1)
  if (!empty) {
    barSeries.forEach((e, bi) => {
      for (let i = 0; i < n; i++) {
        const r = ranges[bi][i]
        if (!r) continue
        const c = catPos(i)
        const off = spec.stacked ? 0 : bi
        const a = c - groupW / 2 + off * (barW + gap)
        const lo = vPos(r[0])
        const hi = vPos(r[1])
        const v = e.s.values[i] as number
        if (horizontal) bars.push({ s: e.k, i, x: Math.min(lo, hi), y: a, w: Math.abs(hi - lo), h: barW, v, neg: v < 0 })
        else bars.push({ s: e.k, i, x: a, y: Math.min(lo, hi), w: barW, h: Math.abs(hi - lo), v, neg: v < 0 })
      }
    })
  }

  const lines: XYLine[] = []
  const areas: XYArea[] = []
  let simplified = 0
  const maxPts = Math.max(24, Math.round(plotW / 3))
  const lineSeries = spec.series.map((s, k) => ({ s, k })).filter((e) => e.s.kind === 'line' || e.s.kind === 'area')
  const areaSeries = lineSeries.filter((e) => e.s.kind === 'area')
  const areaRanges = stackRanges(areaSeries.map((e) => e.s), spec.stacked, n)
  if (!empty && !scatter) {
    lineSeries.forEach((e) => {
      const ai = areaSeries.findIndex((a) => a.k === e.k)
      const stackedArea = spec.stacked && ai >= 0
      const pts: Array<Pt | null> = []
      for (let i = 0; i < n; i++) {
        const v = e.s.values[i]
        if (!isNum(v)) {
          pts.push(null)
          continue
        }
        const top = stackedArea ? (areaRanges[ai][i]?.[1] ?? 0) : v
        const val = stackedArea && v < 0 ? (areaRanges[ai][i]?.[0] ?? 0) : top
        pts.push([catPos(i), vPos(val)])
      }
      let use = pts
      if (n > maxPts) {
        let last = 0
        const filled = pts.map((p, i) => {
          if (p) last = p[1]
          return [i, p ? p[1] : last] as Pt
        })
        const keep = new Set(lttb(filled, maxPts))
        pts.forEach((p, i) => {
          if (p !== null) return
          keep.add(i)
          if (i > 0) keep.add(i - 1)
          if (i < n - 1) keep.add(i + 1)
        })
        const order = [...keep].sort((x, y) => x - y)
        use = order.map((i) => pts[i])
        simplified = Math.max(simplified, n - order.length)
      }
      const segs = sampleSeries(use, spec.curve)
      lines.push({ s: e.k, segs, pts })
      if (e.s.kind === 'area') {
        const polys: Pt[][] = []
        segs.forEach((seg) => {
          if (seg.length < 2) return
          let lower: Pt[]
          if (stackedArea && ai > 0) {
            const below = lines.find((l) => l.s === areaSeries[ai - 1].k)
            lower = below ? sampleSeries(below.pts, spec.curve).flat().filter((p) => p[0] >= seg[0][0] - 0.01 && p[0] <= seg[seg.length - 1][0] + 0.01).reverse() : []
          } else lower = [[seg[seg.length - 1][0], basePx], [seg[0][0], basePx]]
          if (!lower.length) lower = [[seg[seg.length - 1][0], basePx], [seg[0][0], basePx]]
          polys.push([...seg, ...lower])
        })
        areas.push({ s: e.k, polys })
      }
    })
  }

  const dots: XYDot[] = []
  const pointOf: Array<{ s: number; j: number }> = []
  const tx: number[] = []
  const ty: number[] = []
  const lineCount = lines.length
  const showDots = !scatter && lineCount > 0 && (spec.dots === true || (spec.dots === 'auto' && n <= 24 && catLen / Math.max(1, n) >= 15 && lineCount <= 4))
  if (showDots) {
    for (const l of lines) {
      const ser = spec.series[l.s]
      if (ser.kind === 'area' && spec.dots === 'auto' && lineCount > 1) continue
      l.pts.forEach((p, i) => {
        if (p) dots.push({ s: l.s, i, x: p[0], y: p[1], r: 3.4, last: i === n - 1 })
      })
    }
  }

  if (scatter && !empty) {
    const maxPoints = 600
    spec.series.forEach((ser, k) => {
      if (ser.kind !== 'scatter' || !ser.xs) return
      const cnt = Math.min(ser.values.length, ser.xs.length)
      const stride = Math.max(1, Math.ceil(cnt / (maxPoints / Math.max(1, spec.series.length))))
      const smax = Math.max(1, ...(ser.sizes ?? []).filter(isNum))
      if (stride > 1) simplified = Math.max(simplified, cnt - Math.ceil(cnt / stride))
      for (let j = 0; j < cnt; j += stride) {
        const yv = ser.values[j]
        const xv = ser.xs[j]
        if (!isNum(yv) || !isNum(xv)) continue
        const sz = ser.sizes?.[j]
        const r = isNum(sz) ? 3 + 9 * Math.sqrt(Math.max(0, sz) / smax) : 4.2
        const px = xNum(xv)
        const py = vPos(yv)
        dots.push({ s: k, i: j, x: px, y: py, r, last: false })
        pointOf.push({ s: k, j })
        tx.push(px)
        ty.push(py)
      }
    })
  }

  const gridPx: number[] = []
  if (!empty) {
    if (horizontal) {
      const bottomTicks: Array<{ t: AxisTick; x: number; w: number }> = []
      for (const t of yTicks) {
        const x = vPos(t.v)
        gridPx.push(x)
        bottomTicks.push({ t, x, w: labelWidth(t.label, M.tick, M.font) })
      }
      if (spec.showX) for (const { t, x } of clearLabels(bottomTicks)) labels.push({ id: `y-${t.v}`, text: t.label, x, y: y1 + 8, anchor: 'middle', valign: 'top', role: 'y', size: M.tick, tone: 'muted' })
      if (spec.showY) {
        const stride = Math.max(1, Math.ceil((M.tick + 4) / Math.max(4, band)))
        for (let i = 0; i < n; i += stride) labels.push({ id: `c-${i}`, text: spec.cats[i], x: x0 - 8, y: catPos(i), anchor: 'end', valign: 'middle', role: 'cat', size: M.tick, tone: 'ink', maxW: left - 12 })
      }
    } else {
      for (const t of yTicks) {
        const y = vPos(t.v)
        gridPx.push(y)
        if (spec.showY) labels.push({ id: `y-${t.v}`, text: t.label, x: x0 - 8, y, anchor: 'end', valign: 'middle', role: 'y', size: M.tick, tone: 'muted' })
      }
      if (spec.showX && scatter && spec.xTicks) {
        const xt = pickTicks(spec.xTicks, spec.xTicksAlt, Math.max(2, Math.floor(plotW / 64)), [spec.xMin ?? 0, spec.xMax ?? 1]).map((t) => ({ t, x: xNum(t.v), w: labelWidth(t.label, M.tick, M.font) }))
        for (const { t, x } of clearLabels(xt)) labels.push({ id: `x-${t.v}`, text: t.label, x, y: y1 + 8, anchor: 'middle', valign: 'top', role: 'x', size: M.tick, tone: 'ink' })
      } else if (spec.showX && !scatter && n > 0) {
        const pitch = n > 1 ? (catPos(n - 1) - catPos(0)) / (n - 1) : band
        const { idx, stride } = pickLabelIndices(spec.cats.map((c) => labelWidth(c, M.tick, M.font)), pitch)
        for (const i of idx) {
          labels.push({ id: `x-${i}`, text: spec.cats[i], x: catPos(i), y: y1 + 8, anchor: 'middle', valign: 'top', role: 'x', size: M.tick, tone: 'ink', maxW: Math.max(pitch * stride, 12) })
        }
      }
    }
  }

  if (wantsValues && spec.valueLabels) {
    for (const b of bars) {
      const text = spec.valueLabels[b.s]?.[b.i]
      if (!text) continue
      if (horizontal) labels.push({ id: `v-${b.s}-${b.i}`, text, x: b.neg ? b.x - 5 : b.x + b.w + 5, y: b.y + b.h / 2, anchor: b.neg ? 'end' : 'start', valign: 'middle', role: 'value', size: M.value, tone: 'ink' })
      else labels.push({ id: `v-${b.s}-${b.i}`, text, x: b.x + b.w / 2, y: b.neg ? b.y + b.h + 4 : b.y - 4, anchor: 'middle', valign: b.neg ? 'top' : 'bottom', role: 'value', size: M.value, tone: 'ink' })
    }
  }

  const bands: XYBandGeom[] = []
  if (!empty && !scatter) {
    spec.bands.forEach((b, bi) => {
      const lo = catPos(b.i0) - (centered ? band / 2 : Math.min(band / 2, 14))
      const hi = catPos(b.i1) + (centered ? band / 2 : Math.min(band / 2, 14))
      const g: XYBandGeom = horizontal ? { x: x0, y: lo, w: plotW, h: hi - lo } : { x: lo, y: y0, w: hi - lo, h: plotH }
      bands.push(g)
      if (b.text) labels.push({ id: `band-${bi}`, text: b.text, x: horizontal ? x1 - 4 : g.x + 5, y: horizontal ? g.y + 4 : y0 + 3, anchor: horizontal ? 'end' : 'start', valign: 'top', role: 'note', size: M.tick, tone: 'ink' })
    })
  }

  const notes: XYNoteGeom[] = []
  spec.notes.forEach((note, ni) => {
    let target: Pt | null = null
    let rx = 11
    let ry = 10
    const bar = bars.find((b) => b.s === note.s && b.i === note.i)
    const dot = dots.find((d) => d.s === note.s && d.i === note.i)
    const linePt = lines.find((l) => l.s === note.s)?.pts[note.i]
    if (bar) {
      const labelled = wantsValues && !!spec.valueLabels?.[bar.s]?.[bar.i]
      target = horizontal ? [bar.neg ? bar.x : bar.x + bar.w + (labelled ? 12 : 0), bar.y + bar.h / 2] : [bar.x + bar.w / 2, (bar.neg ? bar.y + bar.h : bar.y) - (labelled ? M.value * 0.7 : 0)]
      rx = horizontal ? (labelled ? 18 : 10) : Math.max(labelled ? 15 : 11, bar.w / 2 + 7)
      ry = horizontal ? Math.max(10, bar.h / 2 + 6) : labelled ? 15 : 10
    } else if (dot) {
      target = [dot.x, dot.y]
      rx = ry = dot.r + 7
    } else if (linePt) target = linePt
    if (!target) return
    const tw = textWidth(note.text, M.note, M.font)
    const th = M.note * 1.1
    const tgt = target
    const crowd = (l0: number, t0: number, l1: number, t1: number): number => {
      let hits = 0
      for (const l of lines) for (const sg of l.segs) for (let k = 0; k < sg.length; k += 2) if (sg[k][0] >= l0 && sg[k][0] <= l1 && sg[k][1] >= t0 && sg[k][1] <= t1) hits++
      for (const b of bars) {
        const ox = Math.min(l1, b.x + b.w) - Math.max(l0, b.x)
        const oy = Math.min(t1, b.y + b.h) - Math.max(t0, b.y)
        if (ox > 0 && oy > 0) hits += 3 + (ox * oy) / 40
      }
      for (const d of dots) if (d.x >= l0 && d.x <= l1 && d.y >= t0 && d.y <= t1) hits += 2
      for (const a of areas) {
        const l = lines.find((q) => q.s === a.s)
        if (!l) continue
        const mx = (l0 + l1) / 2
        for (const sg of l.segs) {
          const i = sg.findIndex((p) => p[0] >= mx)
          if (i > 0 && sg[i][0] > sg[i - 1][0]) {
            const t = (mx - sg[i - 1][0]) / (sg[i][0] - sg[i - 1][0])
            const yc = sg[i - 1][1] + (sg[i][1] - sg[i - 1][1]) * t
            if (t1 > yc - 2) hits += 5
          }
        }
      }
      for (const q of labels) {
        if (q.role === 'note' || q.role === 'center') continue
        const qw = textWidth(q.text, q.size ?? M.tick, M.font)
        const qx0 = q.anchor === 'start' ? q.x : q.anchor === 'end' ? q.x - qw : q.x - qw / 2
        const qy0 = q.valign === 'top' ? q.y : q.valign === 'bottom' ? q.y - (q.size ?? M.tick) : q.y - (q.size ?? M.tick) / 2
        if (qx0 < l1 && qx0 + qw > l0 && qy0 < t1 && qy0 + (q.size ?? M.tick) > t0) hits += 6
      }
      return hits
    }
    const pinned = note.dx !== undefined || note.dy !== undefined
    const up = -38
    const down = 44 + th
    const near = tw / 2 + 40
    const cands: Array<[number, number]> = pinned ? [[note.dx ?? near, note.dy ?? up]] : [[near, up], [-near, up], [near, -28], [-near, -28], [near, down], [-near, down], [0, up - 14], [0, down + 12]]
    let best = { lx: 0, ly: 0, score: Infinity }
    cands.forEach(([cdx, cdy], ci) => {
      const rawX = tgt[0] + cdx
      const rawY = tgt[1] + cdy
      const cx = clampN(rawX, Math.min(x0 + tw / 2 + 2, w / 2), w - tw / 2 - 4)
      const cy = clampN(rawY, th + 2, h - 4)
      const score = Math.abs(cx - rawX) * 0.35 + Math.abs(cy - rawY) * 0.35 + crowd(cx - tw / 2 - 3, cy - th - 2, cx + tw / 2 + 3, cy + 4) * 2 + ci * 0.4
      if (score < best.score) best = { lx: cx, ly: cy, score }
    })
    const lx = best.lx
    const ly = best.ly
    const dx = lx - tgt[0]
    const dy = ly - tgt[1]
    const sx = lx + (dx > 0 ? -tw / 2 - 4 : tw / 2 + 4)
    const sy = ly - (dy < 0 ? -2 : th + 2)
    const ang = Math.atan2(sy - target[1], sx - target[0])
    const ex = target[0] + Math.cos(ang) * (rx + 3)
    const ey = target[1] + Math.sin(ang) * (ry + 3)
    const far = dist([sx, sy], [ex, ey]) > 14
    labels.push({ id: `note-${ni}`, text: note.text, x: lx, y: ly, anchor: 'middle', valign: 'bottom', role: 'note', size: M.note, tone: note.pen === 'red' ? 'red' : note.pen === 'green' ? 'green' : note.pen === 'blue' ? 'blue' : 'ink' })
    notes.push({
      n: ni,
      pen: note.pen,
      shape: note.shape,
      loop: note.shape === 'loop' ? { cx: target[0], cy: target[1], rx, ry } : null,
      underline: note.shape === 'underline' ? { x1: lx - tw / 2 - 2, x2: lx + tw / 2 + 2, y: ly + 3 } : null,
      arrow: far ? { x1: sx, y1: sy, x2: ex, y2: ey } : null,
    })
  })

  const refs: XYRefGeom[] = []
  if (!empty) {
    spec.refs.forEach((r, ri) => {
      if (r.axis === 'y') {
        const p = vPos(r.value)
        if (horizontal) {
          refs.push({ x1: p, y1: y0 - 2, x2: p, y2: y1, pen: r.pen })
          if (r.label) labels.push({ id: `ref-${ri}`, text: r.label, x: p + 4, y: y0 - 2, anchor: 'start', valign: 'bottom', role: 'ref', size: M.tick, tone: r.pen === 'red' ? 'red' : 'muted' })
        } else {
          refs.push({ x1: x0, y1: p, x2: x1, y2: p, pen: r.pen })
          if (r.label) labels.push({ id: `ref-${ri}`, text: r.label, x: x1 - 2, y: p - 3, anchor: 'end', valign: 'bottom', role: 'ref', size: M.tick, tone: r.pen === 'red' ? 'red' : 'muted' })
        }
      } else if (scatter) {
        const p = xNum(r.value)
        refs.push({ x1: p, y1: y0, x2: p, y2: y1, pen: r.pen })
        if (r.label) labels.push({ id: `ref-${ri}`, text: r.label, x: p + 4, y: y0 + 2, anchor: 'start', valign: 'top', role: 'ref', size: M.tick, tone: r.pen === 'red' ? 'red' : 'muted' })
      }
    })
  }

  if (spec.state !== 'ready' || (empty && spec.stateText)) {
    const at = spec.state === 'loading' ? 0.16 : 0.38
    labels.push({ id: 'state', text: spec.stateText ?? (spec.state === 'loading' ? 'Loading' : 'No data'), x: (x0 + x1) / 2, y: y0 + (y1 - y0) * at, anchor: 'middle', valign: 'middle', role: 'center', size: M.note, tone: 'muted' })
  }

  let targets: XYLayout['targets']
  if (scatter) {
    targets = { n: pointOf.length, mode: 'point', cx: tx, cy: ty, nav: 'linear' }
  } else {
    const pos: number[] = []
    const cx: number[] = []
    const cy: number[] = []
    for (let i = 0; i < n; i++) {
      const c = catPos(i)
      pos.push(c)
      let best = horizontal ? x0 : y1
      let seen = false
      for (const b of bars) if (b.i === i) {
        const edge = horizontal ? (b.neg ? b.x : b.x + b.w) : b.neg ? b.y + b.h : b.y
        best = seen ? (horizontal ? Math.max(best, edge) : Math.min(best, edge)) : edge
        seen = true
      }
      for (const l of lines) {
        const p = l.pts[i]
        if (p) {
          best = seen ? Math.min(best, p[1]) : p[1]
          seen = true
        }
      }
      if (horizontal) {
        cx.push(seen ? best : x0)
        cy.push(c)
      } else {
        cx.push(c)
        cy.push(seen ? best : y1)
      }
    }
    targets = { n, mode: horizontal ? 'y' : 'x', pos, cx, cy, nav: 'linear' }
  }

  const cursorAt = (i: number, series?: number | null): CursorSpec[] => {
    const out: CursorSpec[] = []
    if (i < 0 || i >= targets.n) return out
    if (scatter) {
      const d = dots.find((q) => q.s === pointOf[i].s && q.i === pointOf[i].j)
      if (d) out.push({ kind: 'ring', x: d.x - d.r - 6, y: d.y - d.r - 6, w: 2 * d.r + 12, h: 2 * d.r + 12, slot: spec.series[d.s].slot })
      return out
    }
    const c = targets.pos?.[i] ?? 0
    if (hasBars) {
      out.push(horizontal ? { kind: 'column', x: x0, y: c - band / 2, w: plotW, h: band } : { kind: 'column', x: c - band / 2, y: y0, w: band, h: plotH })
    } else if (!horizontal) {
      out.push({ kind: 'guide', x: c - 5, y: y0, w: 10, h: plotH })
    }
    if (!horizontal) {
      for (const l of lines) {
        if (series != null && series !== l.s) continue
        const p = l.pts[i]
        if (p) out.push({ kind: 'ring', x: p[0] - 9, y: p[1] - 9, w: 18, h: 18, slot: spec.series[l.s].slot })
      }
    }
    return out
  }

  return { w, h, bucket, labels, targets, cursorAt, plot: { x0, y0, x1, y1 }, horizontal, band, gridPx, basePx, bars, lines, areas, dots, notes, refs, bands, barW, pointOf, simplified }
}
