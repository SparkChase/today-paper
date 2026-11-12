import type { PaintKey } from '@/lib/ink/paint'
import type { Bucket } from '@/lib/ink/charts/chart-scale'

export const SLOT_KEYS = ['marker', 'ink-you', 'green', 'hi-deep', 'grape', 'red', 'pencil', 'orange-text'] as const satisfies readonly PaintKey[]
export type SlotKey = (typeof SLOT_KEYS)[number]
export const SLOT_COUNT = SLOT_KEYS.length

export const slotKey = (slot: number): SlotKey => SLOT_KEYS[((Math.trunc(slot) % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT]

export const PATTERNS = ['solid', 'hatch', 'dots', 'cross', 'lines', 'scribble'] as const
export type Pattern = (typeof PATTERNS)[number]

export const MARKERS = ['circle', 'square', 'triangle', 'diamond', 'cross', 'plus'] as const
export type MarkerShape = (typeof MARKERS)[number] | 'none'

export const DASHES = ['solid', 'dashed', 'dotted', 'dashdot'] as const
export type Dash = (typeof DASHES)[number]

export const defaultPattern = (slot: number): Pattern => PATTERNS[((Math.trunc(slot) % PATTERNS.length) + PATTERNS.length) % PATTERNS.length]
export const defaultMarker = (slot: number): MarkerShape => MARKERS[((Math.trunc(slot) % MARKERS.length) + MARKERS.length) % MARKERS.length]
export const defaultDash = (slot: number): Dash => DASHES[((Math.trunc(slot) % DASHES.length) + DASHES.length) % DASHES.length]

export type NotePen = 'red' | 'blue' | 'ink' | 'green'

export interface ChartLabel {
  id: string
  text: string
  x: number
  y: number
  anchor: 'start' | 'middle' | 'end'
  valign: 'top' | 'middle' | 'bottom'
  role: 'x' | 'y' | 'cat' | 'value' | 'note' | 'center' | 'sub' | 'ref' | 'axis' | 'legend'
  tone?: 'ink' | 'muted' | 'red' | 'blue' | 'green'
  size?: number
  maxW?: number
  hidden?: boolean
}

export interface ChartTargets {
  n: number
  mode: 'x' | 'y' | 'point' | 'sector' | 'cell'
  pos?: number[]
  cx: number[]
  cy: number[]
  nav: 'linear' | 'grid'
  cols?: number
  sector?: { cx: number; cy: number; r0: number[]; r1: number[]; a0: number[]; a1: number[] }
  cells?: { x0: number; y0: number; cw: number; ch: number; cols: number; rows: number; index: number[] }
}

export type CursorSpec =
  | { kind: 'column'; x: number; y: number; w: number; h: number }
  | { kind: 'guide'; x: number; y: number; w: number; h: number }
  | { kind: 'ring'; x: number; y: number; w: number; h: number; slot: number }
  | { kind: 'slice'; x: number; y: number; w: number; h: number; cx: number; cy: number; r0: number; r1: number; a0: number; a1: number }
  | { kind: 'cell'; x: number; y: number; w: number; h: number }
  | { kind: 'spoke'; x: number; y: number; w: number; h: number; x1: number; y1: number; x2: number; y2: number }

export interface ChartLayoutBase {
  w: number
  h: number
  bucket: Bucket
  labels: ChartLabel[]
  targets: ChartTargets
  cursorAt(i: number, series?: number | null): CursorSpec[]
}

export type XYKind = 'bar' | 'line' | 'area' | 'scatter'

export interface XYSeries {
  key: string
  name: string
  slot: number
  kind: XYKind
  pattern: Pattern
  marker: MarkerShape
  dash: Dash
  values: Array<number | null>
  xs?: number[]
  sizes?: number[]
}

export interface XYNote {
  s: number
  i: number
  text: string
  pen: NotePen
  shape: 'loop' | 'underline' | 'none'
  dx?: number
  dy?: number
}

export interface XYBand {
  i0: number
  i1: number
  text?: string
}

export interface XYRef {
  value: number
  axis: 'y' | 'x'
  label?: string
  pen: NotePen
}

export interface AxisTick {
  v: number
  label: string
}

export interface XYSpec {
  type: 'xy'
  cats: string[]
  series: XYSeries[]
  stacked: boolean
  horizontal: boolean
  curve: 'smooth' | 'linear' | 'step'
  yMin: number
  yMax: number
  yTicks: AxisTick[]
  yTicksAlt?: AxisTick[][]
  xMin?: number
  xMax?: number
  xTicks?: AxisTick[]
  xTicksAlt?: AxisTick[][]
  dots: 'auto' | boolean
  values: 'auto' | boolean
  valueLabels?: Array<Array<string | null>>
  grid: boolean
  showX: boolean
  showY: boolean
  zero: boolean
  notes: XYNote[]
  refs: XYRef[]
  bands: XYBand[]
  patterns: boolean
  state: 'ready' | 'empty' | 'loading'
  stateText?: string
  total?: number
}

export interface Slice {
  key: string
  name: string
  slot: number
  pattern: Pattern
  value: number
  label?: string
}

export interface PieSpec {
  type: 'pie'
  slices: Slice[]
  inner: number
  start: number
  labels: boolean
  patterns: boolean
  state: 'ready' | 'empty' | 'loading'
  stateText?: string
}

export interface RadarSeries {
  key: string
  name: string
  slot: number
  pattern: Pattern
  marker: MarkerShape
  values: Array<number | null>
}

export interface RadarSpec {
  type: 'radar'
  axes: string[]
  series: RadarSeries[]
  max: number
  levels: number
  ringLabels: string[]
  fill: boolean
  patterns: boolean
  dots: boolean
  state: 'ready' | 'empty' | 'loading'
  stateText?: string
}

export interface RadialRing {
  key: string
  name: string
  slot: number
  pattern: Pattern
  value: number
  max: number
  label?: string
}

export interface RadialSpec {
  type: 'radial'
  rings: RadialRing[]
  start: number
  end: number
  patterns: boolean
  state: 'ready' | 'empty' | 'loading'
  stateText?: string
}

export interface GaugeZone {
  to: number
  slot: number
  pattern: Pattern
}

export interface GaugeSpec {
  type: 'gauge'
  value: number
  min: number
  max: number
  zones: GaugeZone[]
  sweep: number
  ticks: number
  minLabel: string
  maxLabel: string
  patterns: boolean
  state: 'ready' | 'empty' | 'loading'
  stateText?: string
}

export interface SparkSpec {
  type: 'spark'
  variant: 'line' | 'area' | 'bar'
  values: Array<number | null>
  min: number
  max: number
  slot: number
  ends: boolean
  extremes: boolean
  state: 'ready' | 'empty' | 'loading'
}

export interface TallyRow {
  key: string
  name: string
  slot: number
  count: number
}

export interface TallySpec {
  type: 'tally'
  rows: TallyRow[]
  unit: number
  totals: string[]
  state: 'ready' | 'empty' | 'loading'
  stateText?: string
}

export interface HeatSpec {
  type: 'heat'
  cols: number
  rows: number
  levels: number[]
  levelCount: number
  colLabels: Array<{ i: number; text: string }>
  rowLabels: Array<{ i: number; text: string }>
  slot: number
  variant: 'calendar' | 'grid'
  legend: { less: string; more: string } | null
  patterns: boolean
  state: 'ready' | 'empty' | 'loading'
  stateText?: string
}

export type MiniParams =
  | { kind: 'swatch'; slot: number; pattern: Pattern; marker?: MarkerShape; line?: boolean; dash?: Dash }
  | { kind: 'column' | 'guide' | 'cell'; slot?: number }
  | { kind: 'ring'; slot: number }
  | { kind: 'slice'; cx: number; cy: number; r0: number; r1: number; a0: number; a1: number }
  | { kind: 'spoke'; x1: number; y1: number; x2: number; y2: number }
