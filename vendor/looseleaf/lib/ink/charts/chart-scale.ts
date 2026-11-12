import type { Pt } from '@/lib/ink/types'

export type Bucket = 'sm' | 'md' | 'lg'

export function bucketOf(w: number): Bucket {
  return w < 280 ? 'sm' : w < 560 ? 'md' : 'lg'
}

export const clampN = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v)

export const round = (v: number, d = 2): number => {
  const k = 10 ** d
  const r = Math.round(v * k) / k
  return r === 0 ? 0 : r
}

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function niceNum(range: number, roundIt: boolean): number {
  const exp = Math.floor(Math.log10(range))
  const f = range / 10 ** exp
  let nf: number
  if (roundIt) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return nf * 10 ** exp
}

export interface NiceScale {
  min: number
  max: number
  step: number
  ticks: number[]
}

export function niceScale(min: number, max: number, count = 5): NiceScale {
  let lo = Math.min(min, max)
  let hi = Math.max(min, max)
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0
    hi = 1
  }
  if (lo === hi) {
    const pad = Math.abs(lo) > 0 ? Math.abs(lo) * 0.5 : 1
    lo -= lo === 0 ? 0 : pad * 0.5
    hi += pad
    if (lo > 0 && min >= 0) lo = 0
  }
  const step = niceNum(niceNum(hi - lo, false) / Math.max(1, count - 1), true)
  const nmin = Math.floor(lo / step + 1e-9) * step
  const nmax = Math.ceil(hi / step - 1e-9) * step
  const ticks: number[] = []
  for (let v = nmin, i = 0; v <= nmax + step * 0.5 && i < 60; v += step, i++) ticks.push(round(v, 10))
  return { min: round(nmin, 10), max: round(nmax, 10), step, ticks }
}

export function ticksIn(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min]
  const step = niceNum((max - min) / Math.max(1, count - 1), true)
  const out: number[] = []
  for (let v = Math.ceil(min / step - 1e-9) * step, i = 0; v <= max + step * 1e-6 && i < 60; v += step, i++) out.push(round(v, 10))
  return out
}

export function coarserTicks(min: number, max: number, dense: readonly number[]): number[][] {
  const seen = new Set<string>([dense.join(',')])
  const out: number[][] = []
  for (const count of [4, 3, 2]) {
    const t = ticksIn(min, max, count)
    const key = t.join(',')
    if (t.length < 2 || seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

export function shares(values: readonly number[], decimals = 0): string[] {
  const k = 10 ** decimals
  const pos = values.map((v) => (isNum(v) && v > 0 ? v : 0))
  const total = pos.reduce((n, v) => n + v, 0)
  if (!total) return values.map(() => '0%')
  const raw = pos.map((v) => (v / total) * 100 * k)
  const floor = raw.map(Math.floor)
  let left = Math.round(100 * k) - floor.reduce((n, v) => n + v, 0)
  const order = raw.map((r, i) => [r - floor[i], i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1])
  for (const [, i] of order) {
    if (left <= 0) break
    if (pos[i] > 0) {
      floor[i]++
      left--
    }
  }
  return floor.map((f) => `${round(f / k, decimals)}%`)
}

export function radarRim(top: number, levels = 4): number {
  const lv = Math.max(1, Math.round(levels) || 1)
  if (!isNum(top) || top <= 0) return lv
  const per = top / lv
  const exp = Math.floor(Math.log10(per))
  const f = per / 10 ** exp
  const nice = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 10].find((s) => s >= f - 1e-9) ?? 10
  return round(nice * 10 ** exp * lv, 6)
}

const SUFFIX: Array<[number, string]> = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'k'],
]

export function formatNumber(v: number, maxDecimals = 2): string {
  if (!Number.isFinite(v)) return ''
  const neg = v < 0
  const s = round(Math.abs(v), maxDecimals).toString()
  const [int, dec] = s.split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (neg ? '-' : '') + grouped + (dec ? '.' + dec : '')
}

export function formatCompact(v: number): string {
  if (!Number.isFinite(v)) return ''
  const a = Math.abs(v)
  for (const [k, s] of SUFFIX) {
    if (a >= k) {
      const x = round(a / k, a / k >= 100 ? 0 : 1)
      return (v < 0 ? '-' : '') + x + s
    }
  }
  return (v < 0 ? '-' : '') + round(a, a < 1 ? 2 : a < 10 ? 1 : 0)
}

export function formatPercent(fraction: number, decimals = 0): string {
  return `${round(fraction * 100, decimals)}%`
}

export type LabelFont = 'script' | 'hand' | 'mono'
const EM: Record<LabelFont, number> = { script: 0.4, hand: 0.47, mono: 0.6 }

export function textWidth(s: string, size: number, font: LabelFont = 'script'): number {
  const base = EM[font]
  let em = 0
  for (const ch of s) {
    if (ch === ' ') em += base * 0.55
    else if ('il.,:;!\'|'.includes(ch)) em += base * 0.6
    else if ('mwMW%@'.includes(ch)) em += base * 1.45
    else if (ch >= 'A' && ch <= 'Z') em += base * 1.12
    else em += base
  }
  return em * size
}

export const LABEL_SLACK = 1.15
export const LABEL_GAP = 8

export function labelWidth(s: string, size: number, font: LabelFont = 'script'): number {
  return textWidth(s, size, font) * LABEL_SLACK
}

export function pickLabelIndices(widths: readonly number[], pitch: number, gap = LABEL_GAP): { idx: number[]; stride: number } {
  const n = widths.length
  if (n === 0) return { idx: [], stride: 1 }
  const last = n - 1
  const clear = (a: number, b: number): boolean => (b - a) * pitch - (widths[a] + widths[b]) / 2 >= gap
  const run = (s: number): number[] => {
    const out: number[] = []
    for (let i = 0; i < n; i += s) out.push(i)
    return out
  }
  const valid = (p: readonly number[]): boolean => p.every((v, k) => k === 0 || clear(p[k - 1], v))
  let s = 1
  while (s < n && !valid(run(s))) s++
  const upTo = (k: number) => Math.min(last, Math.ceil(s * k))
  const tries: Array<[number, boolean]> = [[1.5, false], [1.34, true], [2, true]]
  for (const [k, tail] of tries) {
    for (let t = s; t <= upTo(k); t++) {
      const p = run(t)
      if (!valid(p)) continue
      const rem = last % t
      if (rem === 0) return { idx: p, stride: t }
      if (tail && 2 * rem > t && clear(p[p.length - 1], last)) return { idx: [...p, last], stride: t }
    }
  }
  const p = run(s)
  if (p[p.length - 1] !== last && clear(p[p.length - 1], last)) p.push(last)
  return { idx: p, stride: s }
}

export function clearLabels<T extends { x: number; w: number }>(items: readonly T[], gap = LABEL_GAP): T[] {
  const out: T[] = []
  const clear = (a: T, b: T): boolean => b.x - a.x - (a.w + b.w) / 2 >= gap
  items.forEach((it, k) => {
    if (!out.length || clear(out[out.length - 1], it)) return void out.push(it)
    if (k !== items.length - 1) return
    while (out.length > 1 && !clear(out[out.length - 1], it)) out.pop()
    if (clear(out[out.length - 1], it)) out.push(it)
  })
  return out
}

export function monotoneCurve(pts: Pt[], step = 4): Pt[] {
  const n = pts.length
  if (n < 3) return pts.map((p) => [p[0], p[1]] as Pt)
  const dx: number[] = []
  const m: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0] || 1e-6)
    m.push((pts[i + 1][1] - pts[i][1]) / dx[i])
  }
  const t: number[] = new Array(n)
  t[0] = m[0]
  t[n - 1] = m[n - 2]
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0
      t[i + 1] = 0
      continue
    }
    const a = t[i] / m[i]
    const b = t[i + 1] / m[i]
    const s = a * a + b * b
    if (s > 9) {
      const k = 3 / Math.sqrt(s)
      t[i] = k * a * m[i]
      t[i + 1] = k * b * m[i]
    }
  }
  const out: Pt[] = [[pts[0][0], pts[0][1]]]
  for (let i = 0; i < n - 1; i++) {
    const cnt = Math.max(2, Math.ceil(dx[i] / step))
    for (let k = 1; k <= cnt; k++) {
      const u = k / cnt
      const u2 = u * u
      const u3 = u2 * u
      const h00 = 2 * u3 - 3 * u2 + 1
      const h10 = u3 - 2 * u2 + u
      const h01 = -2 * u3 + 3 * u2
      const h11 = u3 - u2
      out.push([pts[i][0] + dx[i] * u, h00 * pts[i][1] + h10 * dx[i] * t[i] + h01 * pts[i + 1][1] + h11 * dx[i] * t[i + 1]])
    }
  }
  return out
}

export function stepCurve(pts: Pt[]): Pt[] {
  const out: Pt[] = []
  pts.forEach((p, i) => {
    if (i > 0) out.push([p[0], pts[i - 1][1]])
    out.push([p[0], p[1]])
  })
  return out
}

export function lttb(pts: Pt[], threshold: number): number[] {
  const n = pts.length
  if (threshold >= n || threshold < 3) return pts.map((_, i) => i)
  const keep: number[] = [0]
  const every = (n - 2) / (threshold - 2)
  let a = 0
  for (let i = 0; i < threshold - 2; i++) {
    const s0 = Math.floor((i + 1) * every) + 1
    const s1 = Math.min(Math.floor((i + 2) * every) + 1, n)
    let ax = 0
    let ay = 0
    for (let j = s0; j < s1; j++) {
      ax += pts[j][0]
      ay += pts[j][1]
    }
    const c = Math.max(1, s1 - s0)
    ax /= c
    ay /= c
    const r0 = Math.floor(i * every) + 1
    const r1 = Math.min(Math.floor((i + 1) * every) + 1, n)
    let best = -1
    let pick = r0
    for (let j = r0; j < r1; j++) {
      const area = Math.abs((pts[a][0] - ax) * (pts[j][1] - pts[a][1]) - (pts[a][0] - pts[j][0]) * (ay - pts[a][1]))
      if (area > best) {
        best = area
        pick = j
      }
    }
    keep.push(pick)
    a = pick
  }
  keep.push(n - 1)
  return keep
}

export function thinIndices(n: number, max: number): number[] {
  if (n <= max || max < 2) return Array.from({ length: n }, (_, i) => i)
  const out: number[] = []
  for (let k = 0; k < max; k++) out.push(Math.round((k * (n - 1)) / (max - 1)))
  return [...new Set(out)]
}

export function strideIndices(n: number, max: number): number[] {
  const k = Math.max(1, Math.ceil(n / Math.max(1, max)))
  const out: number[] = []
  for (let i = 0; i < n; i += k) out.push(i)
  return out
}
