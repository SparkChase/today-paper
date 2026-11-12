import type { Pt } from '@/lib/ink/types'
import { bucketOf, clampN, isNum, monotoneCurve, textWidth, type LabelFont } from '@/lib/ink/charts/chart-scale'
import type { ChartLabel, ChartLayoutBase, ChartTargets, CursorSpec, HeatSpec, SparkSpec, TallySpec } from '@/lib/ink/charts/chart-types'

export interface SparkLayout extends ChartLayoutBase {
  pts: Array<Pt | null>
  segs: Pt[][]
  bars: Array<{ x: number; y: number; w: number; h: number }>
  baseY: number
  last: Pt | null
  minPt: Pt | null
  maxPt: Pt | null
}

export function layoutSpark(spec: SparkSpec, box: { w: number; h: number }): SparkLayout {
  const { w, h } = box
  const n = spec.values.length
  const padX = spec.variant === 'bar' ? 1.5 : 4
  const padY = 5
  const x0 = padX
  const x1 = w - padX - (spec.ends && spec.variant !== 'bar' ? 3 : 0)
  const y0 = padY
  const y1 = h - padY
  const span = spec.max - spec.min || 1
  const yOf = (v: number) => clampN(y1 - ((v - spec.min) / span) * (y1 - y0), y0 - 4, y1 + 4)
  const slot = n > 0 ? (x1 - x0) / n : 0
  const xOf = (i: number) => (spec.variant === 'bar' ? x0 + slot * (i + 0.5) : n < 2 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1))
  const pts: Array<Pt | null> = spec.values.map((v, i) => (isNum(v) ? [xOf(i), yOf(v)] : null))
  const runs: Pt[][] = []
  let cur: Pt[] = []
  for (const p of pts) {
    if (p) cur.push(p)
    else if (cur.length) (runs.push(cur), (cur = []))
  }
  if (cur.length) runs.push(cur)
  const segs = runs.map((r) => (r.length > 2 ? monotoneCurve(r, 3) : r))
  const bw = clampN(slot * 0.62, 1.6, 14)
  const bars = spec.variant === 'bar' ? pts.flatMap((p) => (p ? [{ x: p[0] - bw / 2, y: p[1], w: bw, h: Math.max(1.2, y1 - p[1]) }] : [])) : []
  const real = pts.filter((p): p is Pt => !!p)
  const last = real.length ? real[real.length - 1] : null
  let minPt: Pt | null = null
  let maxPt: Pt | null = null
  real.forEach((p) => {
    if (!minPt || p[1] > minPt[1]) minPt = p
    if (!maxPt || p[1] < maxPt[1]) maxPt = p
  })
  const targets: ChartTargets = { n, mode: 'x', pos: pts.map((p, i) => (p ? p[0] : xOf(i))), cx: pts.map((p, i) => (p ? p[0] : xOf(i))), cy: pts.map((p) => (p ? p[1] : y1)), nav: 'linear' }
  const cursorAt = (i: number): CursorSpec[] => {
    const p = pts[i]
    return p ? [{ kind: 'ring', x: p[0] - 7, y: p[1] - 7, w: 14, h: 14, slot: spec.slot }] : []
  }
  return { w, h, bucket: bucketOf(w), labels: [], targets, cursorAt, pts, segs, bars, baseY: y1, last, minPt, maxPt }
}

export interface TallyRowGeom {
  index: number
  y: number
  gh: number
  x: number
  marks: number
  right: number
}
export interface TallyLayout extends ChartLayoutBase {
  rows: TallyRowGeom[]
  unit: number
  markArea: { x0: number; x1: number }
}

export const MAX_MARKS = 250
const TALLY_UNITS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 100000]

export function layoutTally(spec: TallySpec, box: { w: number; h: number }, calm = false): TallyLayout {
  const { w, h } = box
  const bucket = bucketOf(w)
  const font: LabelFont = calm ? 'hand' : 'script'
  const tick = calm ? 13 : bucket === 'sm' ? 15 : 17
  const labels: ChartLabel[] = []
  const m = spec.rows.length
  const nameW = Math.min(w * 0.34, Math.max(0, ...spec.rows.map((r) => textWidth(r.name, tick, font))) + 4)
  const totalW = Math.max(0, ...spec.totals.map((t) => textWidth(t, tick, font))) + 6
  const x0 = nameW + 14
  const x1 = w - totalW - 10
  const rh = m ? clampN((h - 8) / m, 24, 52) : 40
  const gh = clampN(rh * 0.62, 14, 28)
  const maxCount = Math.max(1, ...spec.rows.map((r) => (Number.isFinite(r.count) ? r.count : 0)))
  const groupW = (g: number) => 1.05 * g + 6
  const fits = (unit: number) => Math.ceil(maxCount / unit / 5) * groupW(gh) - 6 <= x1 - x0
  const need = Math.ceil(maxCount / MAX_MARKS)
  const floor = TALLY_UNITS.find((u) => u >= need) ?? need
  const unit = Math.max(floor, spec.unit > 0 ? spec.unit : (TALLY_UNITS.find(fits) ?? TALLY_UNITS[TALLY_UNITS.length - 1]))
  const usedH = m * rh
  const top = Math.max(4, Math.min(12, (h - usedH) / 2))
  const rows: TallyRowGeom[] = spec.rows.map((r, i) => {
    const marks = Math.ceil((Number.isFinite(r.count) ? r.count : 0) / unit)
    const groups = Math.ceil(marks / 5)
    const y = top + i * rh + (rh - gh) / 2
    const right = x0 + Math.max(0, groups * groupW(gh) - 6 - (marks % 5 && marks % 5 !== 0 ? (5 - (marks % 5)) * 0.26 * gh : 0))
    labels.push({ id: `n-${i}`, text: r.name, x: 4, y: y + gh / 2, anchor: 'start', valign: 'middle', role: 'cat', size: tick, tone: 'ink', maxW: nameW })
    labels.push({ id: `t-${i}`, text: spec.totals[i] ?? String(r.count), x: w - 4, y: y + gh / 2, anchor: 'end', valign: 'middle', role: 'value', size: tick, tone: 'muted' })
    return { index: i, y, gh, x: x0, marks, right }
  })
  if (unit > 1 && spec.state === 'ready') {
    labels.push({ id: 'unit', text: `each mark = ${unit}`, x: w - 4, y: h - 2, anchor: 'end', valign: 'bottom', role: 'sub', size: Math.max(12, tick - 3), tone: 'muted' })
  }
  if (spec.state !== 'ready' || !m) labels.push({ id: 'state', text: spec.stateText ?? (spec.state === 'loading' ? 'Loading' : 'No data'), x: w / 2, y: h / 2, anchor: 'middle', valign: 'middle', role: 'center', size: 20, tone: 'muted' })
  const targets: ChartTargets = { n: m, mode: 'y', pos: rows.map((r) => r.y + r.gh / 2), cx: rows.map((r) => (r.right + x0) / 2), cy: rows.map((r) => r.y + r.gh / 2), nav: 'linear' }
  const cursorAt = (i: number): CursorSpec[] => {
    const r = rows[i]
    return r ? [{ kind: 'column', x: 0, y: r.y - (rh - r.gh) / 2, w, h: rh }] : []
  }
  return { w, h, bucket, labels, targets, cursorAt, rows, unit, markArea: { x0, x1 } }
}

export interface HeatCell {
  col: number
  row: number
  x: number
  y: number
  level: number
}
export interface HeatLayout extends ChartLayoutBase {
  cs: number
  cell: number
  gx: number
  gy: number
  cells: HeatCell[]
  legend: { x: number; y: number; cell: number } | null
}

export function layoutHeat(spec: HeatSpec, box: { w: number; h: number }, calm = false): HeatLayout {
  const { w, h } = box
  const bucket = bucketOf(w)
  const font: LabelFont = calm ? 'hand' : 'script'
  const tick = calm ? 12 : bucket === 'sm' ? 13 : 14.5
  const labels: ChartLabel[] = []
  const left = spec.rowLabels.length ? Math.max(...spec.rowLabels.map((r) => textWidth(r.text, tick, font))) + 10 : 4
  const top = spec.colLabels.length ? tick + 8 : 4
  const bottom = spec.legend ? tick + 16 : 4
  const availW = w - left - 4
  const availH = h - top - bottom
  const cs = Math.max(4, Math.min(availW / Math.max(1, spec.cols), availH / Math.max(1, spec.rows), 34))
  const gap = clampN(cs * 0.16, 1.4, 4.5)
  const cell = cs - gap
  const gx = left
  const gy = top + Math.max(0, (availH - cs * spec.rows) / 2)
  const cells: HeatCell[] = []
  const index: number[] = []
  spec.levels.forEach((lv, k) => {
    const col = k % spec.cols
    const row = Math.floor(k / spec.cols)
    if (lv >= 0) cells.push({ col, row, x: gx + col * cs, y: gy + row * cs, level: lv })
    index.push(lv >= 0 ? k : -1)
  })
  if (spec.state === 'ready') {
    if (spec.variant === 'grid') {
      for (const c of spec.colLabels) labels.push({ id: `c-${c.i}`, text: c.text, x: gx + c.i * cs + cs / 2, y: gy - 6, anchor: 'middle', valign: 'bottom', role: 'x', size: tick, tone: 'ink', maxW: Math.max(cs, 24) })
    } else {
      let free = Number.NEGATIVE_INFINITY
      for (const c of spec.colLabels) {
        const x = gx + c.i * cs
        if (x < free) continue
        labels.push({ id: `c-${c.i}`, text: c.text, x, y: gy - 6, anchor: 'start', valign: 'bottom', role: 'x', size: tick, tone: 'ink' })
        free = x + textWidth(c.text, tick, font) + 6
      }
    }
    let lastY = Number.NEGATIVE_INFINITY
    for (const r of spec.rowLabels) {
      const y = gy + r.i * cs + cs / 2
      if (y - lastY < tick * 0.95) continue
      labels.push({ id: `r-${r.i}`, text: r.text, x: gx - 6, y, anchor: 'end', valign: 'middle', role: 'y', size: tick, tone: 'muted' })
      lastY = y
    }
  }
  let legend: HeatLayout['legend'] = null
  if (spec.legend && spec.state === 'ready') {
    const lc = clampN(cs * 0.9, 10, 16)
    const lw = spec.levelCount * (lc + 3)
    const ly = gy + cs * spec.rows + 8 + lc / 2
    const lx = Math.min(gx + cs * spec.cols, w - 4) - lw - textWidth(spec.legend.more, tick, font) - 8
    legend = { x: lx, y: ly - lc / 2, cell: lc }
    labels.push({ id: 'less', text: spec.legend.less, x: lx - 6, y: ly, anchor: 'end', valign: 'middle', role: 'sub', size: tick, tone: 'muted' })
    labels.push({ id: 'more', text: spec.legend.more, x: lx + lw + 6, y: ly, anchor: 'start', valign: 'middle', role: 'sub', size: tick, tone: 'muted' })
  }
  if (spec.state !== 'ready') labels.push({ id: 'state', text: spec.stateText ?? (spec.state === 'loading' ? 'Loading' : 'No data'), x: w / 2, y: h / 2, anchor: 'middle', valign: 'middle', role: 'center', size: 20, tone: 'muted' })
  const total = spec.cols * spec.rows
  const targets: ChartTargets = {
    n: total,
    mode: 'cell',
    cx: Array.from({ length: total }, (_, k) => gx + (k % spec.cols) * cs + cs / 2),
    cy: Array.from({ length: total }, (_, k) => gy + Math.floor(k / spec.cols) * cs),
    nav: 'grid',
    cols: spec.cols,
    cells: { x0: gx, y0: gy, cw: cs, ch: cs, cols: spec.cols, rows: spec.rows, index },
  }
  const cursorAt = (i: number): CursorSpec[] => {
    if (i < 0 || i >= total || index[i] < 0) return []
    return [{ kind: 'cell', x: gx + (i % spec.cols) * cs - 2, y: gy + Math.floor(i / spec.cols) * cs - 2, w: cell + 4 + gap, h: cell + 4 + gap }]
  }
  return { w, h, bucket, labels, targets, cursorAt, cs, cell, gx, gy, cells, legend }
}
