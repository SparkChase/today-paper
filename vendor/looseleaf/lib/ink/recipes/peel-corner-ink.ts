import { defineRecipe } from '@/lib/ink/recipes'
import { focusRing, line } from '@/lib/ink/shapes'
import type { PaintKey } from '@/lib/ink/paint'

export const PEEL_UNIT = 120

export interface PeelFlapParams {
  back?: PaintKey
  mirror?: boolean
}

export const peelFlapRecipe = defineRecipe<PeelFlapParams>({
  id: 'peel-corner-flap',
  kind: 'peel-corner-flap',
  layers: ['rest'],
  pad: 8,
  draw(ink, { w, h }, { back = 'paper', mirror = false }, ctx) {
    const U = Math.min(w, h)
    const X = (x: number) => (mirror ? U - x : x)
    const poly = (...p: Array<[number, number]>) => 'M' + p.map(([x, y]) => `${X(x)} ${y}`).join('L') + 'Z'
    ink.layer('rest', () => {
      const band = (a: number, b: number, op: number) => ink.flat('wash', poly([U, a], [a, U], [b, U], [U, b]), 'ink', op)
      band(0, 8, 0.26)
      band(8, 20, 0.14)
      if (!ctx.calm) band(20, 38, 0.07)
      const r = ink.next('flap')
      const cx = r.gauss(2, 1.3)
      const cy = r.gauss(2, 1.3)
      const bowTop = r.gauss(3.6, 1.2)
      const bowSide = r.gauss(3.6, 1.2)
      const flap = `M${X(0)} ${U}L${X(U)} 0Q${X((U + cx) / 2)} ${cy / 2 + bowTop} ${X(cx)} ${cy}Q${X(cx / 2 + bowSide)} ${(U + cy) / 2} ${X(0)} ${U}Z`
      ink.flat('wash', flap, back, 1)
      ink.flat('wash', poly([0, U], [U, 0], [U - 16, 0], [0, U - 16]), 'photo', 0.55)
      ink.flat('wash', poly([cx, cy], [U * 0.34, 0], [0, U * 0.34]), 'ink', 0.06)
      line(ink, X(0), U, X(cx), cy, { pen: 'ink.fine', opts: { alpha: 0.85 } })
      line(ink, X(cx), cy, X(U), 0, { pen: 'ink.fine', opts: { alpha: 0.85 } })
      line(ink, X(0), U, X(U), 0, { pen: 'pencil.fine', opts: { alpha: 0.7 } })
    })
  },
})

export const peelTriggerRecipe = defineRecipe<Record<string, never>>({
  id: 'peel-corner-trigger',
  kind: 'peel-corner-trigger',
  layers: ['focus'],
  lazy: ['focus'],
  pad: 12,
  draw(_ink, { w, h }, _params, ctx) {
    ctx.lazy('focus', (f) => focusRing(f, 0, 0, w, h, { r: 6 }))
  },
})
