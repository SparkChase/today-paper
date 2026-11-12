import { blobFill, wash } from '@/lib/ink/fills'
import { TAU, seg } from '@/lib/ink/geom'
import { clamp } from '@/lib/ink/rng'
import { burstLines, focusRing, loopLines, starLines } from '@/lib/ink/shapes'
import { defineRecipe } from '@/lib/ink/recipes'
import type { Ink } from '@/lib/ink/builder'
import type { PaintKey } from '@/lib/ink/paint'
import type { Line, PenName, Pt } from '@/lib/ink/types'

export const ratingIconList = ['star', 'heart', 'sun'] as const
export type RatingIcon = (typeof ratingIconList)[number]

export interface RatingParams {
  icon?: RatingIcon
  disabled?: boolean
  invalid?: boolean
}

const FILL: Record<RatingIcon, PaintKey> = { star: 'hi', heart: 'tomato', sun: 'hi' }

function starPoly(cx: number, cy: number, R: number): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 10
    const r = i % 2 ? R * 0.46 : R
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return pts
}

function heartPts(cx: number, cy: number, R: number, t0 = 0, t1 = TAU, n = 44): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n
    const x = 16 * Math.sin(t) ** 3
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
    pts.push([cx + (x / 17) * R * 1.02, cy + (y / 17) * R * 0.98 + R * 0.06])
  }
  return pts
}

function discPoly(cx: number, cy: number, r: number, n = 24): Pt[] {
  return Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * TAU) * r, cy + Math.sin((i / n) * TAU) * r] as Pt)
}

function clipX(poly: Pt[], at: number, keepLow: boolean): Pt[] {
  const inside = (p: Pt): boolean => (keepLow ? p[0] <= at : p[0] >= at)
  const out: Pt[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const ia = inside(a)
    const ib = inside(b)
    if (ia) out.push(a)
    if (ia !== ib) {
      const t = (at - a[0]) / (b[0] - a[0])
      out.push([at, a[1] + t * (b[1] - a[1])])
    }
  }
  return out
}

function outlineLines(ink: Ink, icon: RatingIcon, cx: number, cy: number, R: number, filled = false): Line[] {
  const rng = ink.next('outline')
  if (icon === 'star' && filled) {
    const pts = starPoly(cx, cy + R * 0.05, R * 1.02)
    pts.push(pts[0], [pts[1][0] + rng.gauss(0, 0.1), pts[1][1]])
    return [{ pts, o: { poly: true, start: 'pool', end: 'flick', wobble: 0.5 } }]
  }
  if (icon === 'star') return starLines(rng, cx, cy + R * 0.05, R * 1.02)
  if (icon === 'heart') {
    const pts = heartPts(cx, cy, R, 0.06, TAU + 0.16).map((p, i, all) => [p[0] + rng.gauss(0, 0.12) * (i / all.length), p[1]] as Pt)
    return [{ pts, o: { start: 'pool', end: 'flick', wobble: 0.6 } }]
  }
  const r = R * 0.5
  return [...loopLines(rng.fork('disc'), cx, cy, r, r, { turns: 1.1 }), ...burstLines(rng.fork('rays'), cx, cy, R * 1.02, { rays: 9 })]
}

export const ratingRecipe = defineRecipe<RatingParams>({
  id: 'rating',
  kind: 'rating',
  layers: ['rest', 'checked', 'indeterminate', 'focus'],
  lazy: ['focus'],
  pad: 12,
  draw(ink, { w, h }, { icon = 'star', disabled, invalid }, ctx) {
    const s = Math.min(w, h)
    const cx = w / 2
    const cy = h / 2
    const R = s / 2 - 1.6
    const calm = ctx.calm
    const rtl = ctx.dir === 'rtl'
    if (!disabled) ctx.lazy('focus', (f) => focusRing(f, 0, 0, w, h, { shape: 'ellipse', gap: 3 }))
    if (ctx.lazyOnly) return

    const fine = s < 22
    const restPen: PenName = disabled ? 'pencil.fine' : invalid ? 'red' : 'pencil'
    const feltPen: PenName = disabled ? 'pencil' : calm ? 'pencil.fine' : fine ? 'ink.fine' : 'ink'
    const blob = (poly: Pt[]): void => {
      ink.part('fill', () => {
        if (disabled) return wash(ink, poly, 'pencil-mark', { alpha: 0.4, material: 'wash' })
        return blobFill(ink, poly, FILL[icon], { alpha: icon === 'heart' ? 0.84 : 0.9, mis: clamp(s * 0.05, 0.6, 1.6) })
      })
    }
    const body = (): Pt[] => (icon === 'star' ? starPoly(cx, cy + R * 0.05, R) : icon === 'heart' ? heartPts(cx, cy, R) : discPoly(cx, cy, R * 0.52))

    ink.layer('rest', () => {
      const empty = (): void => ink.lines(outlineLines(ink, icon, cx, cy, R), restPen, { width: disabled ? 0.9 : 1, alpha: disabled ? 0.6 : 0.95, simple: s < 40 })
      if (invalid && !disabled) ink.group({ hideOn: 'checked indeterminate' }, empty)
      else empty()
    })
    ink.layer('checked', () => {
      blob(body())
      ink.lines(outlineLines(ink, icon, cx, cy, R, true), feltPen, { simple: s < 30 })
    })
    ink.layer('indeterminate', () => {
      const half = clipX(body(), cx, !rtl)
      blob(half)
      ink.lines(outlineLines(ink, icon, cx, cy, R, true), feltPen, { alpha: 0.9, simple: s < 30 })
      if (!calm) ink.stroke(seg(cx + 0.2, cy - R * 0.55, cx - 0.2, cy + R * 0.7, 0.3, 3), 'pencil.fine', { alpha: 0.5, start: 'soft', end: 'soft', wobble: 0.3, simple: true })
    })
  },
})
