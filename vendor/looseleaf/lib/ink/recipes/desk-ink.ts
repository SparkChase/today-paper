import { Ink } from '@/lib/ink/builder'
import type { InkResult } from '@/lib/ink/builder'
import { clamp } from '@/lib/ink/rng'
import { num, pathTag, polyD, tok } from '@/lib/ink/recipes/paper-set-ink'
import type { Tier } from '@/lib/ink/types'

export type DeskObject = 'coffee' | 'pencil' | 'clips' | 'ruler' | 'pins'
export const DESK_OBJECTS: readonly DeskObject[] = ['coffee', 'pencil', 'clips', 'ruler', 'pins']

export interface PencilOpts {
  length?: number
  color?: 'lemon' | 'tomato' | 'sky' | 'grass' | 'grape' | 'teal'
  tier?: Tier
  calm?: boolean
}

export function pencil(seed: string | number, o: PencilOpts = {}): InkResult {
  const ink = new Ink(seed, { tier: o.tier, calm: o.calm })
  const L = o.length ?? 190
  const T = clamp(L * 0.078, 10, 20)
  const r = ink.next('pencil')
  const col = tok(o.color ?? 'lemon')
  const eraserEnd = T * 0.95
  const ferruleEnd = T * 2.05
  const coneStart = L - T * 2.05
  const tipStart = L - T * 0.5
  const j = () => r.gauss(0, 0.18)
  let s = ''
  const barrel = (y0: number, y1: number) => `M${num(ferruleEnd)} ${num(y0)}H${num(coneStart)}V${num(y1)}H${num(ferruleEnd)}z`
  s += pathTag(barrel(0, T), { fill: col })
  s += pathTag(barrel(0, T * 0.34), { fill: tok('photo'), op: 0.42 })
  s += pathTag(barrel(T * 0.68, T), { fill: tok('ink'), op: 0.2 })
  s += pathTag(`M${num(ferruleEnd)} ${num(T * 0.34)}H${num(coneStart)}M${num(ferruleEnd)} ${num(T * 0.68)}H${num(coneStart)}`, { stroke: tok('ink'), sw: 0.5, op: 0.2 })
  let dash = ''
  for (let x = ferruleEnd + 16; x < coneStart - 40; x += 5.2) dash += `M${num(x)} ${num(T / 2 + j())}h${num(r.range(1.8, 3.2))}`
  s += pathTag(dash, { stroke: tok('ink'), sw: 1.1, op: 0.42 })
  const cone = `M${num(coneStart)} 0L${num(tipStart)} ${num(T * 0.34)}L${num(tipStart)} ${num(T * 0.66)}L${num(coneStart)} ${num(T)}z`
  s += pathTag(cone, { fill: tok('kraft') })
  s += pathTag(`M${num(coneStart)} 0L${num(tipStart)} ${num(T * 0.34)}L${num(tipStart)} ${num(T * 0.5)}L${num(coneStart)} ${num(T * 0.3)}z`, { fill: tok('photo'), op: 0.45 })
  s += pathTag(`M${num(coneStart)} ${num(T)}L${num(tipStart)} ${num(T * 0.66)}L${num(tipStart)} ${num(T * 0.5)}L${num(coneStart)} ${num(T * 0.7)}z`, { fill: tok('ink'), op: 0.16 })
  s += pathTag(`M${num(coneStart + T * 0.05)} ${num(T * 0.02)}q${num(T * 0.18)} ${num(T * 0.48)} ${num(-T * 0.02)} ${num(T * 0.96)}`, { stroke: tok('ink'), sw: 0.6, op: 0.28 })
  s += pathTag(`M${num(tipStart - 1)} ${num(T * 0.34)}L${num(L)} ${num(T * 0.5 + j())}L${num(tipStart - 1)} ${num(T * 0.66)}z`, { fill: tok('ink') })
  s += pathTag(`M${num(eraserEnd)} 0H${num(ferruleEnd)}V${num(T)}H${num(eraserEnd)}z`, { fill: tok('pencil-mark') })
  s += pathTag(`M${num(eraserEnd)} 0H${num(ferruleEnd)}V${num(T * 0.34)}H${num(eraserEnd)}z`, { fill: tok('photo'), op: 0.7 })
  s += pathTag(`M${num(eraserEnd)} ${num(T * 0.68)}H${num(ferruleEnd)}V${num(T)}H${num(eraserEnd)}z`, { fill: tok('ink'), op: 0.28 })
  s += pathTag(`M${num(eraserEnd + T * 0.3)} 0v${num(T)}M${num(eraserEnd + T * 0.62)} 0v${num(T)}M${num(ferruleEnd - T * 0.3)} 0v${num(T)}`, { stroke: tok('ink'), sw: 0.55, op: 0.35 })
  const er = `M${num(T * 0.34)} 0H${num(eraserEnd)}V${num(T)}H${num(T * 0.34)}Q0 ${num(T)} 0 ${num(T / 2)}Q0 0 ${num(T * 0.34)} 0z`
  s += pathTag(er, { fill: tok('bubblegum') })
  s += pathTag(`M${num(T * 0.34)} 0H${num(eraserEnd)}V${num(T * 0.32)}H${num(T * 0.05)}Q${num(T * 0.12)} 0 ${num(T * 0.34)} 0z`, { fill: tok('photo'), op: 0.4 })
  s += pathTag(`M${num(T * 0.05)} ${num(T * 0.7)}H${num(eraserEnd)}V${num(T)}H${num(T * 0.34)}Q0 ${num(T)} 0 ${num(T * 0.78)}z`, { fill: tok('ink'), op: 0.16 })
  const outline = polyD([[T * 0.1, 0], [coneStart, 0], [tipStart, T * 0.34], [L, T * 0.5], [tipStart, T * 0.66], [coneStart, T], [T * 0.1, T]], true)
  s += pathTag(outline, { stroke: tok('ink'), sw: 0.7, op: 0.3 })
  s += pathTag(`M${num(ferruleEnd)} 0.5H${num(coneStart)}`, { stroke: tok('photo'), sw: 0.9, op: 0.8 })
  const angle = r.range(-3, 3)
  ink.raw(`<g transform="rotate(${num(angle)} ${num(L / 2)} ${num(T / 2)})">${s}</g>`, 'top')
  ink.grow([0, -2, L, T + 2])
  return ink.toSvg({ w: L, h: T, pad: 4 })
}
