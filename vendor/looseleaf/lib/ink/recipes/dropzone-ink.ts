import { wash } from '@/lib/ink/fills'
import { roundRectPoly } from '@/lib/ink/geom'
import { Ink } from '@/lib/ink/builder'
import { n } from '@/lib/ink/paint'
import { defineRecipe } from '@/lib/ink/recipes'
import { clamp } from '@/lib/ink/rng'
import { focusRing, line, squiggle } from '@/lib/ink/shapes'
import type { Pt } from '@/lib/ink/types'

export interface DropzoneParams {
  over?: boolean
  invalid?: boolean
  disabled?: boolean
}

const path = (pts: Pt[]): string => `M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z`

function sewn(ink: Ink, w: number, h: number, o: { colour: string; width: number; dash: readonly [number, number]; alpha: number }): void {
  const inset = Math.min(w, h) > 60 ? 6 : 3
  const r = Math.max(2, clamp(Math.min(w, h) * 0.09, 6, 14) - inset * 0.5)
  const iw = w - 2 * inset, ih = h - 2 * inset
  const perimeter = 2 * (iw + ih) - 8 * r + 2 * Math.PI * r
  const unit = o.dash[0] + o.dash[1]
  const k = perimeter / (Math.max(4, Math.round(perimeter / unit)) * unit)
  ink.raw(
    `<path d="${path(roundRectPoly(inset, inset, iw, ih, r, 6))}" fill="none" stroke="${o.colour}" stroke-width="${o.width}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${n(o.dash[0] * k)} ${n(o.dash[1] * k)}" stroke-opacity="${o.alpha}"/>`,
    'pencil'
  )
}

export const dropzoneRecipe = defineRecipe<DropzoneParams>({
  id: 'dropzone',
  kind: 'field',
  layers: ['rest', 'hover', 'focus', 'open', 'invalid', 'disabled'],
  lazy: ['focus', 'hover'],
  pad: 12,
  draw(ink, { w, h }, { over, invalid, disabled }, ctx) {
    const r = clamp(Math.min(w, h) * 0.09, 6, 14)
    const body = roundRectPoly(2, 2, w - 4, h - 4, r, 6)
    if (disabled) {
      if (ctx.lazyOnly) return
      ink.layer('disabled', () => {
        wash(ink, body, 'paper-shade', { alpha: 0.9, material: 'wash' })
        sewn(ink, w, h, { colour: 'var(--ll-pencil-mark)', width: 1.6, dash: [7, 6], alpha: 0.75 })
      })
      return
    }
    ctx.lazy('focus', (f) => focusRing(f, 0, 0, w, h, { r, ...(w > 280 ? { opts: { simple: true } } : {}) }))
    ctx.lazy('hover', (hv) => {
      wash(hv, body, 'hi', { alpha: 0.3, material: 'wash' })
      sewn(hv, w, h, { colour: 'var(--ll-ink-soft)', width: 1.2, dash: [9, 5], alpha: 0.55 })
    })
    if (ctx.lazyOnly) return
    if (over) {
      ink.layer('open', () => {
        wash(ink, body, 'paper-shade', { alpha: 0.92, material: 'wash' })
        wash(ink, body, 'hi', { alpha: 0.62, material: 'wash' })
        sewn(ink, w, h, { colour: 'var(--ll-ink-you)', width: 2.4, dash: [11, 6], alpha: 0.95 })
      })
      return
    }
    if (invalid) {
      ink.layer('invalid', () => {
        wash(ink, body, 'paper', { alpha: 0.92, material: 'wash' })
        wash(ink, body, 'red', { alpha: 0.12, material: 'wash' })
        sewn(ink, w, h, { colour: 'var(--ll-red)', width: 2, dash: [9, 6], alpha: 0.9 })
      })
      return
    }
    ink.layer('rest', () => {
      wash(ink, body, 'paper-shade', { alpha: 0.92, material: 'wash' })
      sewn(ink, w, h, { colour: 'var(--ll-pencil)', width: ctx.calm ? 1.2 : 1.9, dash: ctx.calm ? [5, 5] : [9, 6], alpha: 0.92 })
    })
  },
})

export interface DropzoneItemParams {
  status: 'idle' | 'done' | 'error'
}

export const dropzoneItemRecipe = defineRecipe<DropzoneItemParams>({
  id: 'dropzone-item',
  kind: 'rule',
  layers: ['rest', 'invalid'],
  pad: 12,
  draw(ink, { w, h }, { status }, ctx) {
    if (status === 'error') {
      ink.layer('invalid', () => {
        line(ink, 0, h - 0.75, w, h - 0.75, { pen: ctx.calm ? 'red.fine' : 'red', opts: { alpha: 0.85, simple: true } })
        if (!ctx.calm && w > 60) squiggle(ink, 4, h + 3.5, Math.min(w - 8, 120), { pen: 'redfelt.fine', h: 6, amp: 0.7 })
      })
      return
    }
    ink.layer('rest', () => line(ink, 0, h - 0.8, w, h - 0.8, { pen: 'pencil.fine', opts: { alpha: ctx.calm ? 0.7 : 0.55, simple: true } }))
  },
})
