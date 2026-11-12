import { isNum } from '@/lib/ink/charts/chart-scale'

const DAY = 86_400_000
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export function dayMs(d: unknown): number {
  if (d instanceof Date) return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  if (typeof d === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3])
  }
  return Number.NaN
}

export function isoDay(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export function formatDay(ms: number, year = false): string {
  const d = new Date(ms)
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}${year ? `, ${d.getUTCFullYear()}` : ''}`
}

export function levelOf(v: number | null, max: number, levels: number, thresholds?: readonly number[]): number {
  if (!isNum(v) || v <= 0) return 0
  if (thresholds?.length) {
    let lv = 0
    for (const t of thresholds) if (v >= t) lv++
    return Math.min(levels - 1, Math.max(1, lv))
  }
  return Math.min(levels - 1, Math.max(1, Math.ceil((v / (max || 1)) * (levels - 1))))
}

export interface HeatCells {
  cols: number
  rows: number
  levels: number[]
  values: Array<number | null>
  days: number[]
  colLabels: Array<{ i: number; text: string }>
  rowLabels: Array<{ i: number; text: string }>
  max: number
}

export interface CalendarInput {
  date: unknown
  value: unknown
}

export interface CalendarOpts {
  weeks?: number
  end?: unknown
  weekStart?: 0 | 1
  levels: number
  thresholds?: readonly number[]
  weekdayLabels?: boolean
  monthLabels?: boolean
}

export function buildCalendar(rows: readonly CalendarInput[], o: CalendarOpts): HeatCells {
  const byDay = new Map<number, number>()
  let last = Number.NEGATIVE_INFINITY
  let first = Number.POSITIVE_INFINITY
  for (const r of rows) {
    const ms = dayMs(r.date)
    const v = typeof r.value === 'number' ? r.value : Number(r.value)
    if (!Number.isFinite(ms) || !Number.isFinite(v)) continue
    byDay.set(ms, (byDay.get(ms) ?? 0) + v)
    last = Math.max(last, ms)
    first = Math.min(first, ms)
  }
  const ws = o.weekStart ?? 0
  const endMs = Number.isFinite(dayMs(o.end)) ? dayMs(o.end) : Number.isFinite(last) ? last : dayMs('2026-01-01')
  const startFromData = Number.isFinite(first) ? first : endMs
  const weekOf = (ms: number) => Math.floor((ms - dayMs('1970-01-04') - ws * DAY) / (7 * DAY))
  const spanWeeks = weekOf(endMs) - weekOf(startFromData) + 1
  const weeks = Math.max(1, Math.min(o.weeks ?? Math.min(53, spanWeeks), 60))
  const lastWeek = weekOf(endMs)
  const week0 = lastWeek - weeks + 1
  const gridStart = dayMs('1970-01-04') + ws * DAY + week0 * 7 * DAY
  let max = 0
  for (const [ms, v] of byDay) if (ms >= gridStart && ms <= endMs) max = Math.max(max, v)
  const levels: number[] = []
  const values: Array<number | null> = []
  const days: number[] = []
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < weeks; c++) {
      const ms = gridStart + (c * 7 + r) * DAY
      if (ms > endMs) {
        levels.push(-1)
        values.push(null)
        days.push(Number.NaN)
        continue
      }
      const v = byDay.get(ms) ?? 0
      levels.push(levelOf(v, max, o.levels, o.thresholds))
      values.push(v)
      days.push(ms)
    }
  }
  const colLabels: Array<{ i: number; text: string }> = []
  if (o.monthLabels !== false) {
    let prev = -1
    let prevCol = -99
    for (let c = 0; c < weeks; c++) {
      const ms = gridStart + c * 7 * DAY
      const month = new Date(ms).getUTCMonth()
      const startsHere = c === 0 || new Date(ms - 7 * DAY).getUTCMonth() !== month
      if (startsHere && month !== prev && c > 0 && c < 3 && colLabels.length === 1 && colLabels[0].i === 0) {
        colLabels.length = 0
        prevCol = -99
      }
      if (startsHere && month !== prev && c - prevCol >= 3) {
        colLabels.push({ i: c, text: MONTHS[month] })
        prev = month
        prevCol = c
      }
    }
  }
  const rowLabels: Array<{ i: number; text: string }> = []
  if (o.weekdayLabels !== false) for (const wd of [1, 3, 5]) rowLabels.push({ i: (wd - ws + 7) % 7, text: WEEKDAYS[wd] })
  return { cols: weeks, rows: 7, levels, values, days, colLabels, rowLabels, max }
}

export interface GridInput {
  row: unknown
  col: unknown
  value: unknown
}

export function buildGrid(data: readonly GridInput[], o: { rows?: readonly string[]; cols?: readonly string[]; levels: number; thresholds?: readonly number[] }): HeatCells {
  const rowNames = (o.rows ? [...o.rows] : [...new Set(data.map((d) => String(d.row)))]).slice(0, 200)
  const colNames = (o.cols ? [...o.cols] : [...new Set(data.map((d) => String(d.col)))]).slice(0, 200)
  const cell = new Map<string, number>()
  let max = 0
  for (const d of data) {
    const v = typeof d.value === 'number' ? d.value : Number(d.value)
    if (!Number.isFinite(v)) continue
    const key = `${String(d.row)}\u0000${String(d.col)}`
    cell.set(key, (cell.get(key) ?? 0) + v)
  }
  for (const v of cell.values()) max = Math.max(max, v)
  const levels: number[] = []
  const values: Array<number | null> = []
  rowNames.forEach((r) =>
    colNames.forEach((c) => {
      const v = cell.get(`${r}\u0000${c}`)
      levels.push(v === undefined ? 0 : levelOf(v, max, o.levels, o.thresholds))
      values.push(v ?? 0)
    }),
  )
  return {
    cols: colNames.length,
    rows: rowNames.length,
    levels,
    values,
    days: levels.map(() => Number.NaN),
    colLabels: colNames.map((text, i) => ({ i, text })),
    rowLabels: rowNames.map((text, i) => ({ i, text })),
    max,
  }
}
