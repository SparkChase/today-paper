import { defineRecipe } from '@/lib/ink/recipes'
import { arrow, focusRing } from '@/lib/ink/shapes'

export interface FlipTriggerParams {
  hint?: boolean
}

export const flipTriggerRecipe = defineRecipe<FlipTriggerParams>({
  id: 'flip-card-trigger',
  kind: 'flip-card-trigger',
  layers: ['rest', 'hover', 'focus'],
  lazy: ['focus'],
  pad: 12,
  draw(ink, { w, h }, { hint = true }, ctx) {
    ctx.lazy('focus', (f) => focusRing(f, -1, -1, w + 2, h + 2, { r: 4 }))
    if (ctx.lazyOnly || !hint) return
    const x = w - 20, y = h - 20
    ink.layer('rest', () => {
      arrow(ink, x - 16, y + 10, x + 4, y - 12, { pen: 'pencil', head: 'v', curve: 0.35, headLen: 8, opts: { alpha: 0.9, width: 1.2 } })
    })
    ink.layer('hover', () => {
      arrow(ink, x - 16, y + 10, x + 4, y - 12, { pen: 'ink', head: 'v', curve: 0.35, headLen: 8 })
      arrow(ink, x - 30, y + 14, x - 15, y + 2, { pen: 'ink.fine', head: 'none', curve: 0.3, opts: { alpha: 0.7 } })
    })
  },
})
