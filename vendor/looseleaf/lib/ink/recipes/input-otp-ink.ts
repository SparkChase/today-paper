import { wash } from '@/lib/ink/fills'
import { roundRectPoly, seg } from '@/lib/ink/geom'
import { Ink } from '@/lib/ink/builder'
import { defineRecipe } from '@/lib/ink/recipes'
import { clamp } from '@/lib/ink/rng'
import { box, dashedBox, focusRing } from '@/lib/ink/shapes'

export interface OtpSlotParams {
  invalid?: boolean
  disabled?: boolean
  active?: boolean
  filled?: boolean
}

export const otpSlotRecipe = defineRecipe<OtpSlotParams>({
  id: 'input-otp-slot',
  kind: 'field',
  layers: ['rest', 'invalid', 'disabled', 'focus'],
  pad: 12,
  draw(ink, { w, h }, { invalid, disabled, active, filled }, ctx) {
    const r = clamp(Math.min(w, h) * 0.1, 2, 4.5)
    const body = roundRectPoly(1.5, 1.5, w - 3, h - 3, r)
    if (active && !disabled) ink.layer('focus', () => focusRing(ink, 0, 0, w, h, { r, gap: 2.6 }))
    if (disabled) {
      ink.layer('disabled', () => {
        wash(ink, body, 'paper-shade', { alpha: 0.9, material: 'wash' })
        dashedBox(ink, 0, 0, w, h, { r, pen: 'pencil', opts: { color: 'pencil-mark' } })
      })
      return
    }
    if (invalid) {
      ink.layer('invalid', () => {
        ink.poly('under', body, 'slip', 0.7)
        box(ink, 0, 0, w, h, { pen: ctx.calm ? 'red.fine' : 'red', corner: r, opts: { width: ctx.calm ? 1.1 : 1.25 } })
      })
      return
    }
    ink.layer('rest', () => {
      ink.poly('under', body, 'slip', 0.7)
      if (ctx.calm) box(ink, 0, 0, w, h, { pen: 'pencil.fine', corner: r })
      else box(ink, 0, 0, w, h, { pen: filled ? 'ink.fine' : 'pencil', corner: r, opts: { width: filled ? 1.05 : 1.15 } })
    })
  },
})

function caretTile(seed: string): string {
  const ink = new Ink(seed, { tier: 'lo', grain: false })
  ink.layer('rest', () => {
    const rng = ink.next('caret')
    const x = 4.5 + rng.range(-0.25, 0.25)
    ink.stroke(seg(x, 4, x + rng.range(-0.5, 0.5), 24, rng.range(-0.4, 0.4), 5), 'ink.brush', { color: 'current', width: 0.36, start: 'pool', end: 'pool', wobble: 0.5, simple: true })
    ink.stroke(seg(x - 3.3, 3.6 + rng.range(-0.2, 0.2), x + 3.3, 3.8 + rng.range(-0.2, 0.2), rng.range(-0.15, 0.15), 3), 'ink.brush', { color: 'current', width: 0.3, start: 'pool', end: 'pool', wobble: 0.3, simple: true })
    ink.stroke(seg(x - 3.3, 24.4 + rng.range(-0.2, 0.2), x + 3.3, 24.2 + rng.range(-0.2, 0.2), rng.range(-0.15, 0.15), 3), 'ink.brush', { color: 'current', width: 0.3, start: 'pool', end: 'pool', wobble: 0.3, simple: true })
  })
  const svg = ink.toSvg({ w: 9, h: 28, pad: 0 }).svg
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 28" width="9" height="28">${svg}</svg>`)}")`
}

let cache: string | undefined

export function otpCss(): string {
  if (cache) return cache
  const tile = caretTile('otp|caret')
  cache =
    `[data-slot=input-otp-slot]{--ll-otp-caret:${tile}}` +
    `[data-slot=input-otp-slot] [data-part=caret]{display:block;width:9px;height:1.6rem;background:var(--ll-caret);-webkit-mask-image:var(--ll-otp-caret);mask-image:var(--ll-otp-caret);-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;animation:ll-otp-blink 1.1s steps(1) infinite}` +
    `@keyframes ll-otp-blink{0%,55%{opacity:1}56%,100%{opacity:0}}` +
    `@media (prefers-reduced-motion:reduce){[data-slot=input-otp-slot] [data-part=caret]{animation:none}}` +
    `[data-motion=reduced] [data-slot=input-otp-slot] [data-part=caret]{animation:none}` +
    `@media (forced-colors:active){[data-slot=input-otp-slot] [data-part=caret]{background:CanvasText;-webkit-mask-image:none;mask-image:none;width:1px}[data-slot=input-otp-slot][data-active=true]{outline:3px solid Highlight}}`
  return cache
}
