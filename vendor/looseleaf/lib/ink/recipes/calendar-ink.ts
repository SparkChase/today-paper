import { blobFill } from '@/lib/ink/fills'
import { Ink } from '@/lib/ink/builder'
import { TAU, ellipsePoly } from '@/lib/ink/geom'
import { defineRecipe } from '@/lib/ink/recipes'
import { drawFieldFrame } from '@/lib/ink/recipes/field-frame-ink'
import { hatchTile } from '@/lib/ink/recipes/pencil-tiles-ink'
import { focusRing, line, loopLines, underlineLines } from '@/lib/ink/shapes'
import type { Pt } from '@/lib/ink/types'

export const CALENDAR_HEAD = 28
export const CELL = 40
export const RING_HANDS = 4
export const UNDERLINE_HANDS = 3
export const BAND_FRAMES: number = 2

const CURRENT = { color: 'current' as const }

function tile(seed: string, w: number, h: number, draw: (ink: Ink) => void): string {
  const ink = new Ink(seed, { tier: 'lo', grain: false })
  ink.layer('rest', () => draw(ink))
  const svg = ink.toSvg({ w, h, pad: 0 }).svg
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${svg}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(doc)}")`
}

export function ringTile(seed: string): string {
  return tile(seed, CELL, CELL, (ink) => {
    const rng = ink.next('ring')
    const lines = loopLines(rng, CELL / 2 + rng.range(-0.6, 0.6), CELL / 2 + rng.range(-0.6, 0.6), 16.3 + rng.range(-0.6, 0.4), 16 + rng.range(-0.5, 0.5), { loose: 1.5, breathe: 0.05 })
    ink.lines(lines, 'ink.brush', { ...CURRENT, width: 0.86, simple: true })
  })
}

export function washTile(seed: string): string {
  return tile(seed, CELL, CELL, (ink) => {
    blobFill(ink, ellipsePoly(CELL / 2 + 0.8, CELL / 2 + 1, 15.2, 15.6, 26), 'current', { alpha: 1, mis: false, rough: 0.9 })
  })
}

export function underlineTile(seed: string, double: boolean): string {
  return tile(seed, CELL, 10, (ink) => {
    const lines = underlineLines(ink.next('ul'), 3, 5.6, CELL - 7, { kind: double ? 'double' : 'single' })
    ink.lines(lines, 'ink.brush', { ...CURRENT, width: 0.8, simple: true })
  })
}

export const FOCUS_TILE = CELL + 16
export function focusTile(seed: string): string {
  return tile(seed, FOCUS_TILE, FOCUS_TILE, (ink) => {
    focusRing(ink, 12, 12, CELL - 8, CELL - 8, { shape: 'ellipse', gap: 3, pen: 'ink.brush', opts: { ...CURRENT, width: 0.7, simple: true } })
  })
}

const BAND_H = 28

function edges(seed: string): { top: (x: number) => number; bot: (x: number) => number } {
  const rng = new Ink(seed, { grain: false }).next('band')
  const a1 = rng.range(0.55, 0.95), a2 = rng.range(0.2, 0.45), b1 = rng.range(0.55, 0.95), b2 = rng.range(0.2, 0.45)
  const p1 = rng.range(0, TAU), p2 = rng.range(0, TAU), p3 = rng.range(0, TAU), p4 = rng.range(0, TAU)
  const per = (x: number, k: number, p: number): number => Math.sin((TAU * k * x) / CELL + p)
  return {
    top: (x) => 1.3 + a1 * per(x, 1, p1) + a2 * per(x, 2, p2),
    bot: (x) => BAND_H - 1.3 + b1 * per(x, 1, p3) + b2 * per(x, 2, p4),
  }
}

const CAP = 6.4

export function bandTile(seed: string, left: boolean, right: boolean): string {
  const { top, bot } = edges(seed)
  return tile(seed + `|${left ? 'l' : ''}${right ? 'r' : ''}`, CELL, BAND_H, (ink) => {
    const rng = ink.next('caps')
    const slantL = rng.range(-1.6, 1.6), slantR = rng.range(-1.6, 1.6)
    const xa = left ? 1.8 + CAP : -8
    const xb = right ? CELL - 1.8 - CAP : CELL + 8
    const bulge = (t: number, slant: number): number => {
      const u = (t - 0.5) * 2
      return CAP * Math.sqrt(1 - Math.abs(u) ** 2.6) + slant * u
    }
    const pts: Pt[] = []
    for (let x = xa; x <= xb + 0.01; x += 2) pts.push([x, top(x)])
    if (right) for (let i = 1; i <= 9; i++) pts.push([xb + bulge(i / 10, slantR), top(xb) + (bot(xb) - top(xb)) * (i / 10)])
    for (let x = xb; x >= xa - 0.01; x -= 2) pts.push([x, bot(x)])
    if (left) for (let i = 9; i >= 1; i--) pts.push([xa - bulge(i / 10, slantL), top(xa) + (bot(xa) - top(xa)) * (i / 10)])
    ink.poly('marker', pts, 'current', 1)
  })
}

let cache: string | undefined

const both = (prop: string, value: string): string => `-webkit-${prop}:${value};${prop}:${value};`

export function calendarCss(): string {
  if (cache) return cache
  const rings = Array.from({ length: RING_HANDS }, (_, i) => ringTile(`cal|ring|${i}`))
  const washes = Array.from({ length: RING_HANDS }, (_, i) => washTile(`cal|wash|${i}`))
  const unders = Array.from({ length: UNDERLINE_HANDS }, (_, i) => underlineTile(`cal|under|${i}`, i === 1))
  const hatch = hatchTile('cal|hatch')
  const focus = focusTile('cal|focus')
  const bands = Array.from({ length: BAND_FRAMES }, (_, f) => {
    const seed = `cal|band|${f}`
    return { mid: bandTile(seed, false, false), start: bandTile(seed, true, false), end: bandTile(seed, false, true), pill: bandTile(seed, true, true) }
  })

  const vars =
    rings.map((r, i) => `--ll-cal-ring${i}:${r};--ll-cal-wash${i}:${washes[i]};`).join('') +
    unders.map((u, i) => `--ll-cal-under${i}:${u};`).join('') +
    `--ll-cal-hatch:${hatch};--ll-cal-focus:${focus};` +
    bands.map((b, f) => `--ll-cal-mid${f}:${b.mid};--ll-cal-start${f}:${b.start};--ll-cal-end${f}:${b.end};--ll-cal-pill${f}:${b.pill};`).join('')

  const S = '[data-slot=calendar]'
const v = (name: string, i: number): string => `var(--ll-cal-${name}${i})`
  const maskBox = (image: string, size = '100% 100%') => both('mask-image', image) + both('mask-size', size) + both('mask-repeat', 'no-repeat') + both('mask-position', 'center')
  let css = `${S}{${vars}}`

  css += `${S} td[data-day]{position:relative}${S} td[data-day]>button{position:relative;z-index:1}`

  css += `${S} td[data-range]::before{content:"";position:absolute;inset:6px 0;z-index:0;pointer-events:none;background:var(--ll-hi-select);${maskBox(v('mid', 0))}}`
  for (let f = 0; f < BAND_FRAMES; f++) {
    const row = BAND_FRAMES === 1 ? '' : f === 0 ? 'tr:nth-child(2n+1) ' : 'tr:nth-child(2n) '
    const pick = (sel: string, kind: 'mid' | 'start' | 'end' | 'pill') => `${S} ${row}${sel}::before{${maskBox(v(kind, f))}}`
    css += pick('td[data-range=mid]', 'mid')
    css += pick('td[data-range=start]', 'start') + pick('td[data-range=end]', 'end') + pick('td[data-range=single]', 'pill')
    css += pick('td[data-range=mid]:first-of-type', 'start') + pick('td[data-range=mid]:last-of-type', 'end')
    css += pick('td[data-range=start]:last-of-type', 'pill') + pick('td[data-range=end]:first-of-type', 'pill')
  }
  css += `[dir=rtl] ${S} td[data-range]::before,${S}[dir=rtl] td[data-range]::before{scale:-1 1}`

  const hand = (i: number, prop: 'ring' | 'wash') => `${S} button[data-selected-single=true][data-v="${i}"]${prop === 'ring' ? '::after' : '::before'}{${maskBox(v(prop, i))}}`
  css += `${S} button[data-selected-single=true]::before,${S} button[data-selected-single=true]::after{content:"";position:absolute;pointer-events:none;z-index:-1}`
  css += `${S} button[data-selected-single=true]::before{inset:0;background:color-mix(in srgb,var(--ll-marker) 26%,transparent)}`
  css += `${S} button[data-selected-single=true]::after{inset:-3px;background:var(--ll-marker);opacity:.92}`
  for (let i = 0; i < RING_HANDS; i++) css += hand(i, 'ring') + hand(i, 'wash')

  css += `${S} [data-part=today]{position:absolute;left:18%;right:18%;bottom:11%;height:22%;pointer-events:none;background:var(--ll-ink-you);${maskBox(v('under', 0))}}`
  for (let i = 1; i < UNDERLINE_HANDS; i++) css += `${S} button[data-v="${i}"] [data-part=today]{${maskBox(v('under', i))}}`

  css += `${S} td[data-disabled]:not([data-hidden])>button::before{content:"";position:absolute;inset:3px;z-index:-1;pointer-events:none;background:var(--ll-pencil-mark);opacity:.55;${maskBox('var(--ll-cal-hatch)')}}`

  css += `${S} td[data-day]:has(>button:focus-visible)::after{content:"";position:absolute;inset:-8px;z-index:2;pointer-events:none;background:var(--ll-focus);${maskBox('var(--ll-cal-focus)')}}`
  css += `${S} td[data-day]>button:focus-visible{outline:none}`

  css += `@media (hover:hover){${S} td:not([data-range]):not([data-disabled])>button:not([data-selected-single=true]):hover{background:var(--ll-hi-select);border-radius:6px}}`

  css +=
    `@media (forced-colors:active){` +
    `${S} td[data-range]::before,${S} button[data-selected-single=true]::before,${S} button[data-selected-single=true]::after,${S} td[data-disabled]>button::before,${S} td[data-day]:has(>button:focus-visible)::after,${S} [data-part=today]{display:none}` +
    `${S} button[data-selected-single=true]{border:2px solid Highlight}` +
    `${S} td[data-range]>button{border-block:2px solid Highlight}${S} td[data-range=start]>button,${S} td[data-range=single]>button{border-inline-start:2px solid Highlight}${S} td[data-range=end]>button,${S} td[data-range=single]>button{border-inline-end:2px solid Highlight}` +
    `${S} td[data-today]>button{text-decoration:underline}${S} td[data-disabled]>button{color:GrayText;text-decoration:line-through}${S} button:focus-visible{outline:3px solid Highlight}}`
  cache = css
  return css
}

export interface CalendarGridParams {
  rows: number
  weekNumbers?: boolean
}

export const calendarGridRecipe = defineRecipe<CalendarGridParams>({
  id: 'calendar-grid',
  kind: 'calendar',
  layers: ['rest'],
  pad: 12,
  draw(ink, { w, h }, { rows, weekNumbers }, ctx) {
    const head = Math.min(CALENDAR_HEAD, h * 0.4)
    const row = (h - head) / Math.max(1, rows)
    const cell = weekNumbers ? row : w / 7
    const wn = weekNumbers ? Math.max(0, w - 7 * cell) : 0
    const rtl = ctx.dir === 'rtl'
    const X = (x: number): number => (rtl ? w - x : x)
    const calm = ctx.calm
    ink.layer('rest', () => {
      line(ink, -2, head, w + 3, head, { pen: calm ? 'pencil.fine' : 'ink.fine', opts: { alpha: 0.85, simple: true } })
      for (let r = 1; r <= rows; r++) {
        const y = head + r * row
        line(ink, -2, y, w + 3, y, { pen: calm ? 'pencil.fine' : 'pencil', opts: { alpha: calm ? 0.7 : 0.75, simple: true } })
      }
      for (let c = 0; c <= 7; c++) {
        const x = X(wn + c * cell)
        const margin = weekNumbers && c === 0
        const edge = c === 0 || c === 7
        line(ink, x, margin ? -1 : head, x, h + (margin ? 3 : 2), {
          pen: margin ? 'red.fine' : calm ? 'pencil.fine' : 'pencil.fine',
          opts: { alpha: margin ? 0.85 : edge ? 0.6 : 0.42, simple: true },
        })
      }
    })
  },
})

export interface CalendarDropdownParams {
  disabled?: boolean
}

export const calendarDropdownRecipe = defineRecipe<CalendarDropdownParams>({
  id: 'calendar-dropdown',
  kind: 'field',
  layers: ['rest', 'hover', 'focus', 'disabled', 'invalid'],
  lazy: ['focus', 'hover'],
  pad: 12,
  draw(ink, box, params, ctx) {
    drawFieldFrame(ink, box, params, ctx)
  },
})
