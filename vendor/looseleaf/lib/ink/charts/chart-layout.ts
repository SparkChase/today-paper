import { layoutGauge, layoutPie, layoutRadar, layoutRadial, TAU } from '@/lib/ink/charts/chart-polar'
import { layoutHeat, layoutSpark, layoutTally } from '@/lib/ink/charts/chart-mini'
import { layoutXY } from '@/lib/ink/charts/chart-xy'
import type { ChartLayoutBase, ChartTargets, GaugeSpec, HeatSpec, PieSpec, RadarSpec, RadialSpec, SparkSpec, TallySpec, XYSpec } from '@/lib/ink/charts/chart-types'

export type ChartSpec = XYSpec | PieSpec | RadarSpec | RadialSpec | GaugeSpec | SparkSpec | TallySpec | HeatSpec

export function layoutChart(spec: ChartSpec, box: { w: number; h: number }, calm = false): ChartLayoutBase {
  switch (spec.type) {
    case 'xy':
      return layoutXY(spec, box, calm)
    case 'pie':
      return layoutPie(spec, box, calm)
    case 'radar':
      return layoutRadar(spec, box, calm)
    case 'radial':
      return layoutRadial(spec, box, calm)
    case 'gauge':
      return layoutGauge(spec, box, calm)
    case 'spark':
      return layoutSpark(spec, box)
    case 'tally':
      return layoutTally(spec, box, calm)
    case 'heat':
      return layoutHeat(spec, box, calm)
  }
}

const norm = (a: number): number => ((a % TAU) + TAU) % TAU

export function hitIndex(t: ChartTargets, x: number, y: number): number | null {
  if (t.n <= 0) return null
  switch (t.mode) {
    case 'x':
    case 'y': {
      const pos = t.pos ?? []
      const v = t.mode === 'x' ? x : y
      let best = -1
      let bd = Infinity
      for (let i = 0; i < pos.length; i++) {
        const d = Math.abs(pos[i] - v)
        if (d < bd) {
          bd = d
          best = i
        }
      }
      return best < 0 ? null : best
    }
    case 'point': {
      let best = -1
      let bd = 40 * 40
      for (let i = 0; i < t.n; i++) {
        const d = (t.cx[i] - x) ** 2 + (t.cy[i] - y) ** 2
        if (d < bd) {
          bd = d
          best = i
        }
      }
      return best < 0 ? null : best
    }
    case 'sector': {
      const s = t.sector
      if (!s) return null
      const r = Math.hypot(x - s.cx, y - s.cy)
      const ang = Math.atan2(x - s.cx, s.cy - y)
      for (let i = 0; i < t.n; i++) {
        if (r < s.r0[i] || r > s.r1[i]) continue
        const span = s.a1[i] - s.a0[i]
        if (norm(ang - s.a0[i]) <= span + 1e-9) return i
      }
      return null
    }
    case 'cell': {
      const c = t.cells
      if (!c) return null
      const col = Math.floor((x - c.x0) / c.cw)
      const row = Math.floor((y - c.y0) / c.ch)
      if (col < 0 || row < 0 || col >= c.cols || row >= c.rows) return null
      const k = row * c.cols + col
      return c.index[k] >= 0 ? k : null
    }
  }
}

const clampI = (v: number, n: number): number => Math.max(0, Math.min(n - 1, v))

export function stepIndex(t: ChartTargets, from: number | null, key: string): number | null {
  const n = t.n
  if (n <= 0) return null
  const cur = from == null || from < 0 || from >= n ? null : from
  if (key === 'Home') return t.mode === 'cell' ? firstCell(t) : 0
  if (key === 'End') return t.mode === 'cell' ? lastCell(t) : n - 1
  if (t.mode === 'cell' && t.cells) {
    const c = t.cells
    const d = key === 'ArrowRight' ? [1, 0] : key === 'ArrowLeft' ? [-1, 0] : key === 'ArrowDown' ? [0, 1] : key === 'ArrowUp' ? [0, -1] : key === 'PageDown' ? [7, 0] : key === 'PageUp' ? [-7, 0] : null
    if (!d) return null
    if (cur == null) return firstCell(t)
    let col = cur % c.cols
    let row = Math.floor(cur / c.cols)
    for (let guard = 0; guard < c.cols + c.rows; guard++) {
      col += d[0]
      row += d[1]
      if (col < 0 || row < 0 || col >= c.cols || row >= c.rows) return cur
      const k = row * c.cols + col
      if (c.index[k] >= 0) return k
    }
    return cur
  }
  const forward = t.mode === 'y' ? key === 'ArrowDown' : t.mode === 'sector' ? key === 'ArrowRight' || key === 'ArrowDown' : key === 'ArrowRight'
  const backward = t.mode === 'y' ? key === 'ArrowUp' : t.mode === 'sector' ? key === 'ArrowLeft' || key === 'ArrowUp' : key === 'ArrowLeft'
  if (!forward && !backward) return null
  if (cur == null) return forward ? 0 : n - 1
  if (t.mode === 'sector') return (cur + (forward ? 1 : -1) + n) % n
  return clampI(cur + (forward ? 1 : -1), n)
}

function firstCell(t: ChartTargets): number {
  const i = t.cells?.index.findIndex((k) => k >= 0) ?? 0
  return i < 0 ? 0 : i
}
function lastCell(t: ChartTargets): number {
  const idx = t.cells?.index ?? []
  for (let i = idx.length - 1; i >= 0; i--) if (idx[i] >= 0) return i
  return 0
}
