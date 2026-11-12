import { coarserTicks, formatCompact, formatNumber, isNum, niceScale, round, ticksIn } from '@/lib/ink/charts/chart-scale'
import { stackRanges } from '@/lib/ink/charts/chart-xy'
import type { AxisTick, XYSeries, XYSpec } from '@/lib/ink/charts/chart-types'

export type DomainEnd = number | 'auto' | undefined

export interface ScaleOpts {
  n: number
  stacked: boolean
  zero: boolean
  domain?: readonly [DomainEnd, DomainEnd]
  ticks?: number
  format?: (v: number) => string
  include?: readonly number[]
}

export function yScaleFor(series: readonly XYSeries[], o: ScaleOpts): { yMin: number; yMax: number; yTicks: AxisTick[]; yTicksAlt: AxisTick[][] } {
  const fmt = o.format ?? formatCompact
  let lo = Infinity
  let hi = -Infinity
  const take = (v: number) => {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  const stackable = (k: 'bar' | 'area') => series.filter((s) => s.kind === k)
  for (const k of ['bar', 'area'] as const) {
    const group = stackable(k)
    if (!group.length) continue
    for (const row of stackRanges(group as XYSeries[], o.stacked, o.n)) for (const r of row) if (r) (take(r[0]), take(r[1]))
    take(0)
  }
  for (const s of series) if (s.kind === 'line' || s.kind === 'scatter') for (const v of s.values) if (isNum(v)) take(v)
  for (const v of o.include ?? []) if (isNum(v)) take(v)
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0
    hi = 1
  }
  if (o.zero) {
    lo = Math.min(lo, 0)
    hi = Math.max(hi, 0)
  } else if (hi > lo) {
    const pad = (hi - lo) * 0.06
    lo -= pad
    hi += pad
  }
  const [dLo, dHi] = o.domain ?? [undefined, undefined]
  const pinLo = typeof dLo === 'number' ? dLo : undefined
  const pinHi = typeof dHi === 'number' ? dHi : undefined
  const sc = niceScale(pinLo ?? lo, pinHi ?? hi, o.ticks ?? 5)
  const yMin = pinLo ?? sc.min
  const yMax = pinHi ?? sc.max
  const values = pinLo !== undefined || pinHi !== undefined ? ticksIn(yMin, yMax, o.ticks ?? 5) : sc.ticks
  const label = (v: number): AxisTick => ({ v, label: fmt(v) })
  return { yMin, yMax, yTicks: values.map(label), yTicksAlt: coarserTicks(yMin, yMax, values).map((t) => t.map(label)) }
}

export function xScaleFor(values: readonly number[], o: { domain?: readonly [DomainEnd, DomainEnd]; ticks?: number; format?: (v: number) => string; include?: readonly number[] } = {}): { xMin: number; xMax: number; xTicks: AxisTick[]; xTicksAlt: AxisTick[][] } {
  const fmt = o.format ?? formatCompact
  const all = [...values.filter(isNum), ...(o.include ?? [])]
  const lo = all.length ? Math.min(...all) : 0
  const hi = all.length ? Math.max(...all) : 1
  const [dLo, dHi] = o.domain ?? [undefined, undefined]
  const pinLo = typeof dLo === 'number' ? dLo : undefined
  const pinHi = typeof dHi === 'number' ? dHi : undefined
  const sc = niceScale(pinLo ?? lo, pinHi ?? hi, o.ticks ?? 6)
  const xMin = pinLo ?? sc.min
  const xMax = pinHi ?? sc.max
  const vals = pinLo !== undefined || pinHi !== undefined ? ticksIn(xMin, xMax, o.ticks ?? 6) : sc.ticks
  const label = (v: number): AxisTick => ({ v, label: fmt(v) })
  return { xMin, xMax, xTicks: vals.map(label), xTicksAlt: coarserTicks(xMin, xMax, vals).map((t) => t.map(label)) }
}

export interface SummaryOpts {
  kind: string
  title?: string
  format?: (v: number) => string
}

const list = (items: string[]): string => (items.length <= 2 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

export function summarizeXY(spec: XYSpec, o: SummaryOpts): string {
  const fmt = o.format ?? formatNumber
  const named = o.title ? `${o.title}. ` : ''
  if (spec.state === 'loading') return `${named}${o.kind}. Loading.`
  const scatter = spec.series.some((s) => s.kind === 'scatter')
  const count = scatter ? spec.series.reduce((n, s) => n + s.values.filter(isNum).length, 0) : spec.cats.length
  if (!spec.series.length || !count || spec.state === 'empty') return `${named}${o.kind}. No data.`
  const unit = scatter ? `${count} point${count === 1 ? '' : 's'}` : `${count} categor${count === 1 ? 'y' : 'ies'}${count > 1 ? ` from ${spec.cats[0]} to ${spec.cats[spec.cats.length - 1]}` : ` (${spec.cats[0]})`}`
  const parts = spec.series.map((s) => {
    const nums = s.values.map((v, i) => [v, i] as const).filter((e): e is readonly [number, number] => isNum(e[0]))
    if (!nums.length) return `${s.name}: no values`
    const lo = nums.reduce((a, b) => (b[0] < a[0] ? b : a))
    const hi = nums.reduce((a, b) => (b[0] > a[0] ? b : a))
    const at = (e: readonly [number, number]) => (scatter ? '' : ` in ${spec.cats[e[1]]}`)
    return nums.length === 1 ? `${s.name}: ${fmt(nums[0][0])}` : `${s.name}: from ${fmt(lo[0])}${at(lo)} to ${fmt(hi[0])}${at(hi)}`
  })
  const many = spec.series.length
  const extra = (spec.stacked ? ' Stacked.' : spec.horizontal ? ' Horizontal bars.' : '') + (spec.total ? ` Thinned from ${formatNumber(spec.total)} rows to keep the drawing readable.` : '')
  const marked = spec.bands.length ? ` Marked: ${spec.bands.map((b) => `${b.text ? `${b.text}, ` : ''}${spec.cats[b.i0]}${b.i1 !== b.i0 ? ` to ${spec.cats[b.i1]}` : ''}`).join('; ')}.` : ''
  return `${named}${o.kind} with ${many} series (${list(spec.series.map((s) => s.name))}) and ${unit}.${extra} ${parts.join('. ')}.${marked}`.replace(/\.\./g, '.')
}

export interface TableModel {
  head: string[]
  rows: string[][]
  clipped?: { shown: number; total: number }
}

export const TABLE_ROW_CAP = 240

export function tableXY(spec: XYSpec, o: { format?: (v: number) => string; xHead?: string; xFormat?: (v: number) => string } = {}): TableModel {
  const fmt = o.format ?? formatNumber
  const scatter = spec.series.some((s) => s.kind === 'scatter')
  if (scatter) {
    const rows: string[][] = []
    spec.series.forEach((s) => {
      s.values.forEach((v, j) => {
        const x = s.xs?.[j]
        if (isNum(v) && isNum(x)) rows.push([s.name, (o.xFormat ?? fmt)(x), fmt(v)])
      })
    })
    const total = rows.length
    return { head: ['Series', o.xHead ?? 'x', 'y'], rows: rows.slice(0, TABLE_ROW_CAP), clipped: total > TABLE_ROW_CAP ? { shown: TABLE_ROW_CAP, total } : undefined }
  }
  const total = spec.cats.length
  const rows = spec.cats.slice(0, TABLE_ROW_CAP).map((c, i) => [c, ...spec.series.map((s) => (isNum(s.values[i]) ? fmt(s.values[i] as number) : ''))])
  return { head: [o.xHead ?? '', ...spec.series.map((s) => s.name)], rows, clipped: total > TABLE_ROW_CAP ? { shown: TABLE_ROW_CAP, total } : undefined }
}

export function announceRow(label: string, entries: ReadonlyArray<{ name: string; value: string }>): string {
  return `${label}: ${entries.map((e) => `${e.name} ${e.value}`).join(', ')}`
}

export { round }
