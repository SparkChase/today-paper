import { Ink, type InkResult } from '@/lib/ink/builder'
import { blobFill, wash } from '@/lib/ink/fills'
import { roundRectPoly } from '@/lib/ink/geom'
import { defineRecipe } from '@/lib/ink/recipes'
import { chain, dashedBox, focusRing, line, RULER, underline } from '@/lib/ink/shapes'
import type { PenName, Pt, Tier } from '@/lib/ink/types'

export interface NavTabParams {
  role: 'trigger' | 'link'
  disabled?: boolean
}

const R = 5.5

function vertices(w: number, h: number, rtl: boolean, grow = 0): Pt[] {
  const vs: Pt[] = [[0.6, h + grow], [0.6, 0.6], [w - 0.6, 0.6], [w - 0.6, h + grow]]
  return rtl ? vs.map(([x, y]) => [w - x, y] as Pt) : vs
}

function outline(ink: Ink, w: number, h: number, rtl: boolean, pen: PenName, o: { grow?: number; alpha?: number; width?: number } = {}) {
  const pts = chain(vertices(w, h, rtl, o.grow ?? 0), [0, 0, 0], R, ink.next('tab'))
  ink.stroke(pts, pen, { ...RULER, alpha: o.alpha, width: o.width })
}

export const navTabRecipe = defineRecipe<NavTabParams>({
  id: 'navigation-menu-tab',
  kind: 'tab',
  layers: ['rest', 'hover', 'open', 'checked', 'focus', 'disabled'],
  lazy: ['focus'],
  pad: 12,
  draw(ink, { w, h }, { role, disabled }, ctx) {
    const rtl = ctx.dir === 'rtl'
    const calm = ctx.calm
    if (!disabled) ctx.lazy('focus', (f) => focusRing(f, 0, 0, w, h, { r: R }))
    if (ctx.lazyOnly) return
    if (disabled) {
      ink.layer('disabled', () => dashedBox(ink, 0.5, 0.5, w - 1, h - 1, { r: R, pen: 'pencil.fine', opts: { alpha: 0.5 } }))
      return
    }
    const body = roundRectPoly(1.5, 1.5, w - 3, h + 2, R)
    const on = role === 'trigger' ? 'open' : 'checked'
    ink.layer('rest', () => {
      ink.group({ hideOn: on }, () => outline(ink, w, h, rtl, 'pencil.fine', { alpha: calm ? 0.62 : 0.58, width: calm ? 0.9 : 1.02 }), 'pencil')
    })
    ink.layer('hover', () => {
      wash(ink, body, 'hi', { alpha: 0.4 })
      if (!calm) outline(ink, w, h, rtl, 'ink.fine', { alpha: 0.55, width: 0.9 })
    })
    ink.layer(on, () => {
      if (role === 'link') ink.part('fill', () => (calm ? wash(ink, body, 'hi', { alpha: 0.7 }) : blobFill(ink, body, 'hi', { alpha: 0.9 })))
      else wash(ink, body, 'hi', { alpha: calm ? 0.35 : 0.5 })
      outline(ink, w, h, rtl, calm ? 'ink.fine' : 'ink', { grow: 1.5 })
    })
  },
})

export const navBaselineRecipe = defineRecipe<Record<string, never>>({
  id: 'navigation-menu-baseline',
  kind: 'rule',
  layers: ['rest'],
  pad: 8,
  draw(ink, { w, h }, _p, ctx) {
    ink.layer('rest', () => line(ink, 0, h, w, h, { pen: ctx.calm ? 'pencil.fine' : 'pencil', opts: w > 360 ? { simple: true } : undefined }))
  },
})

export interface UnderlineMarkOptions {
  w?: number
  h?: number
  tier?: Tier
  calm?: boolean
}

export function underlineMark(seed: string | number, o: UnderlineMarkOptions = {}): InkResult {
  const w = o.w ?? 96
  const h = o.h ?? 8
  const ink = new Ink(seed, { tier: o.tier, calm: o.calm })
  underline(ink, 3, h / 2 + 1, w - 6, { kind: 'single', pen: o.calm ? 'blue.fine' : 'blue', opts: { width: o.calm ? 1.1 : 1.35 } })
  ink.grow([0, 0, w, h])
  return ink.toSvg({ w, h, pad: 3 })
}
