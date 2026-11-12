import { formatCompact, formatNumber, isNum } from '@/lib/ink/charts/chart-scale'
import { xScaleFor, yScaleFor, type DomainEnd } from '@/lib/ink/charts/chart-data'
import { lttb } from '@/lib/ink/charts/chart-scale'
import {
  DASHES,
  MARKERS,
  PATTERNS,
  type Dash,
  type MarkerShape,
  type NotePen,
  type Pattern,
  type XYKind,
  type XYBand,
  type XYNote,
  type XYRef,
  type XYSeries,
  type XYSpec,
} from '@/lib/ink/charts/chart-types'

export type Row = Record<string, unknown>

export function toNum(v: unknown): number | null {
  if (isNum(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export interface SeriesInput {
  key: string
  name?: string
  kind?: XYKind
  slot?: number
  pattern?: Pattern | 'auto'
  marker?: MarkerShape | 'auto'
  dash?: Dash | 'auto'
}

export interface NoteInput {
  at: 'max' | 'min' | 'first' | 'last' | number | string
  series?: string | number
  text: string
  pen?: NotePen
  shape?: 'loop' | 'underline' | 'none'
  dx?: number
  dy?: number
}

export interface BandInput {
  from: string | number
  to: string | number
  text?: string
}

export interface RefInput {
  y?: number
  x?: number
  label?: string
  pen?: NotePen
}

export interface XYBuildInput {
  rows: readonly Row[]
  xKey: string
  series: readonly SeriesInput[]
  kind: XYKind
  stacked?: boolean
  horizontal?: boolean
  curve?: 'smooth' | 'linear' | 'step'
  domain?: readonly [DomainEnd, DomainEnd]
  xDomain?: readonly [DomainEnd, DomainEnd]
  zero?: boolean
  tickCount?: number
  yFormat?: (v: number) => string
  xFormat?: (v: unknown, index: number) => string
  valueFormat?: (v: number) => string
  dots?: 'auto' | boolean
  values?: 'auto' | boolean
  grid?: boolean
  showX?: boolean
  showY?: boolean
  notes?: readonly NoteInput[]
  refs?: readonly RefInput[]
  bands?: readonly BandInput[]
  patterns?: boolean | 'auto'
  hidden?: ReadonlySet<string> | readonly string[]
  state?: 'ready' | 'empty' | 'loading'
  stateText?: string
  sizeKey?: string
}

const hiddenSet = (h: XYBuildInput['hidden']): ReadonlySet<string> => (h instanceof Set ? h : new Set(h ?? []))

export const MAX_BARS = 240
export const MAX_BARS_TOTAL = 480
export const MAX_POINTS = 1500

export function capRows(rows: readonly Row[], keys: readonly string[], kind: XYKind, xKey: string): { rows: readonly Row[]; total?: number } {
  const n = rows.length
  if (kind === 'scatter') return { rows }
  const limit = Math.min(MAX_BARS, Math.max(48, Math.floor(MAX_BARS_TOTAL / Math.max(1, keys.length))))
  if (kind === 'bar' && n > limit) {
    const size = Math.ceil(n / limit)
    const out: Row[] = []
    for (let i = 0; i < n; i += size) {
      const chunk = rows.slice(i, i + size)
      const row: Row = { [xKey]: chunk[0][xKey] }
      for (const k of keys) {
        const vs = chunk.map((r) => toNum(r[k])).filter(isNum)
        row[k] = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null
      }
      out.push(row)
    }
    return { rows: out, total: n }
  }
  if (kind !== 'bar' && n > MAX_POINTS) {
    const first = keys[0]
    const pts = rows.map((r, i) => [i, toNum(first ? r[first] : 0) ?? 0] as [number, number])
    return { rows: lttb(pts, MAX_POINTS).map((i) => rows[i]), total: n }
  }
  return { rows }
}

export function autoLook(kind: XYKind, slot: number, drawn: number, patterns: boolean | 'auto'): { pattern: Pattern; marker: MarkerShape; dash: Dash } {
  const pat = PATTERNS[((slot % PATTERNS.length) + PATTERNS.length) % PATTERNS.length]
  const shifted = PATTERNS[(((slot + 1) % PATTERNS.length) + PATTERNS.length) % PATTERNS.length]
  const many = drawn > 1 || patterns === true
  if (patterns === false) return { pattern: 'solid', marker: 'circle', dash: 'solid' }
  return {
    pattern: kind === 'area' ? shifted : kind === 'bar' ? (many ? pat : 'solid') : 'solid',
    marker: many ? MARKERS[((slot % MARKERS.length) + MARKERS.length) % MARKERS.length] : 'circle',
    dash: many ? DASHES[((slot % DASHES.length) + DASHES.length) % DASHES.length] : 'solid',
  }
}

export function seriesLook(kind: XYKind, slot: number, count: number, patterns: boolean | 'auto', own: { pattern?: Pattern | 'auto'; marker?: MarkerShape | 'auto'; dash?: Dash | 'auto' } = {}): { pattern: Pattern; marker: MarkerShape; dash: Dash } {
  const auto = autoLook(kind, slot, count, patterns)
  if (patterns === false) return auto
  return {
    pattern: own.pattern && own.pattern !== 'auto' ? own.pattern : auto.pattern,
    marker: own.marker && own.marker !== 'auto' ? own.marker : auto.marker,
    dash: own.dash && own.dash !== 'auto' ? own.dash : auto.dash,
  }
}

export function buildXY(i: XYBuildInput): XYSpec {
  return buildXYRows(i).spec
}

export function buildXYRows(i: XYBuildInput): { spec: XYSpec; rows: readonly Row[] } {
  const hidden = hiddenSet(i.hidden)
  const scatter = i.kind === 'scatter'
  const capped = capRows(i.rows, i.series.map((s) => s.key), i.kind, i.xKey)
  i = { ...i, rows: capped.rows }
  const drawn = i.series.map((s, idx) => ({ s, idx })).filter((e) => !hidden.has(e.s.key))
  const patterns = i.patterns ?? 'auto'
  const n = scatter ? 0 : i.rows.length
  const series: XYSeries[] = drawn.map(({ s, idx }) => {
    const kind = s.kind ?? i.kind
    const slot = s.slot ?? idx
    const look = seriesLook(kind, slot, i.series.length, patterns, s)
    const values = i.rows.map((r) => toNum(r[s.key]))
    const out: XYSeries = {
      key: s.key,
      name: s.name ?? s.key,
      slot,
      kind,
      pattern: look.pattern,
      marker: look.marker,
      dash: look.dash,
      values,
    }
    if (scatter) {
      out.xs = i.rows.map((r) => toNum(r[i.xKey]) ?? Number.NaN)
      if (i.sizeKey) out.sizes = i.rows.map((r) => toNum(r[i.sizeKey as string]) ?? Number.NaN)
    }
    return out
  })

  const valueFormat = i.valueFormat ?? formatNumber
  const yFormat = i.yFormat ?? formatCompact
  const refs: XYRef[] = (i.refs ?? []).flatMap((r): XYRef[] => (isNum(r.y) ? [{ value: r.y, axis: 'y', label: r.label, pen: r.pen ?? 'red' }] : isNum(r.x) ? [{ value: r.x, axis: 'x', label: r.label, pen: r.pen ?? 'red' }] : []))
  const hasFill = series.some((s) => s.kind === 'bar' || s.kind === 'area')
  const y = yScaleFor(series, {
    n,
    stacked: !!i.stacked,
    zero: i.zero ?? hasFill,
    domain: i.domain,
    ticks: i.tickCount ?? 5,
    format: yFormat,
    include: refs.filter((r) => r.axis === 'y').map((r) => r.value),
  })
  const cats = scatter ? [] : i.rows.map((r, idx) => (i.xFormat ? i.xFormat(r[i.xKey], idx) : String(r[i.xKey] ?? '')))
  let x: { xMin?: number; xMax?: number; xTicks?: XYSpec['xTicks']; xTicksAlt?: XYSpec['xTicksAlt'] } = {}
  if (scatter) {
    const xs = series.flatMap((s) => s.xs ?? []).filter(isNum)
    x = xScaleFor(xs, { domain: i.xDomain, ticks: 6, format: i.xFormat ? (v) => i.xFormat!(v, 0) : formatCompact, include: refs.filter((r) => r.axis === 'x').map((r) => r.value) })
  }

  const notes: XYNote[] = []
  for (const nt of i.notes ?? []) {
    const si = nt.series === undefined ? 0 : typeof nt.series === 'number' ? nt.series : series.findIndex((s) => s.key === nt.series)
    const ser = series[si]
    if (!ser) continue
    let idx = -1
    if (typeof nt.at === 'number') idx = nt.at
    else if (nt.at === 'first') idx = ser.values.findIndex(isNum)
    else if (nt.at === 'last') idx = ser.values.length - 1 - [...ser.values].reverse().findIndex(isNum)
    else if (nt.at === 'max' || nt.at === 'min') {
      let best = -1
      ser.values.forEach((v, k) => {
        if (isNum(v) && (best < 0 || (nt.at === 'max' ? v > (ser.values[best] as number) : v < (ser.values[best] as number)))) best = k
      })
      idx = best
    } else idx = cats.indexOf(nt.at)
    if (idx < 0 || idx >= ser.values.length || !isNum(ser.values[idx])) continue
    notes.push({ s: si, i: idx, text: nt.text, pen: nt.pen ?? 'red', shape: nt.shape ?? 'loop', dx: nt.dx, dy: nt.dy })
  }

  const bands: XYBand[] = []
  for (const b of i.bands ?? []) {
    const at = (v: string | number) => (typeof v === 'number' ? v : cats.indexOf(v))
    const a = at(b.from)
    const z = at(b.to)
    if (a < 0 || z < 0 || a >= cats.length || z >= cats.length || scatter) continue
    bands.push({ i0: Math.min(a, z), i1: Math.max(a, z), text: b.text })
  }

  const valueLabels = i.values === false ? undefined : series.map((s) => s.values.map((v) => (s.kind === 'bar' && isNum(v) ? valueFormat(v) : null)))
  const state = i.state ?? (series.length === 0 || (!scatter && n === 0) || series.every((s) => s.values.every((v) => !isNum(v))) ? 'empty' : 'ready')

  const spec: XYSpec = {
    type: 'xy',
    cats,
    series,
    stacked: !!i.stacked,
    horizontal: !!i.horizontal,
    curve: i.curve ?? 'smooth',
    yMin: y.yMin,
    yMax: y.yMax,
    yTicks: y.yTicks,
    ...(y.yTicksAlt.length ? { yTicksAlt: y.yTicksAlt } : {}),
    ...x,
    dots: i.dots ?? 'auto',
    values: i.values ?? 'auto',
    valueLabels,
    grid: i.grid ?? true,
    showX: i.showX ?? true,
    showY: i.showY ?? true,
    zero: i.zero ?? hasFill,
    notes,
    refs,
    bands,
    patterns: patterns !== false,
    state,
    stateText: i.stateText,
    ...(capped.total ? { total: capped.total } : {}),
  }
  return { spec, rows: i.rows }
}
