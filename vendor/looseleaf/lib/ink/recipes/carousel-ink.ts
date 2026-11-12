import { wash } from '@/lib/ink/fills'
import { roundRectPoly, seg } from '@/lib/ink/geom'
import { defineRecipe } from '@/lib/ink/recipes'
import { focusRing } from '@/lib/ink/shapes'
import type { PenName, Pt } from '@/lib/ink/types'

export interface CarouselTickParams {
  slash: boolean
  pitch: number
}

export const CAROUSEL_TICK_PAD = 108

export const CAROUSEL_TICK_PAD_PLAIN = 16

export const carouselTickRecipe = defineRecipe<CarouselTickParams>({
  id: 'carousel-tick',
  kind: 'tick',
  layers: ['rest', 'hover', 'checked', 'focus'],
  lazy: ['focus'],
  pad: CAROUSEL_TICK_PAD,
  draw(ink, { w, h }, { slash, pitch }, ctx) {
    ctx.lazy('focus', (f) => focusRing(f, 0, 0, w, h, { r: 4 }))
    if (ctx.lazyOnly) return
    const rtl = ctx.dir === 'rtl'
    const calm = ctx.calm
    const len = Math.min(h - 6, 22)
    const cx = w / 2
    const y0 = (h - len) / 2
    const stroke = (pen: PenName, grow: number, name: string, width: number) => {
      const rng = ink.next(name)
      const dir = rtl ? -1 : 1
      let pts: Pt[]
      if (slash) {
        const reach = 4 * pitch + rng.gauss(2, 1)
        pts = seg(cx - dir * reach, y0 + len * 0.86 + grow, cx + dir * (3 + rng.gauss(0, 0.5)), y0 + len * 0.14 - grow, rng.gauss(0, 0.6), 9)
      } else {
        const lean = dir * rng.range(0.6, 1.6)
        pts = seg(cx + lean + rng.gauss(0, 0.4), y0 - grow + rng.gauss(0, 0.4), cx - lean + rng.gauss(0, 0.5), y0 + len + grow + rng.gauss(0, 0.5), rng.gauss(0, 0.5), 5)
      }
      ink.stroke(pts, pen, { start: 'pool', end: 'flick', wobble: 0.5, width })
    }
    const body = (): Pt[] => roundRectPoly(1, 3, w - 2, h - 6, 3)
    ink.layer('rest', () => stroke(calm ? 'pencil.fine' : 'pencil', 0, 'tk', calm ? 0.9 : 1.3))
    ink.layer('hover', () => {
      if (!slash) wash(ink, body(), 'hi', { alpha: 0.6 })
      else wash(ink, roundRectPoly(cx - 9, y0 - 2, 18, len + 4, 3), 'hi', { alpha: 0.6 })
    })
    ink.layer('checked', () => stroke(calm ? 'blue.fine' : 'blue', 2, 'ck', calm ? 1.2 : 2.1))
  },
})

