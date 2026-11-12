import { seg } from '@/lib/ink/geom'
import { defineRecipe } from '@/lib/ink/recipes'
import { focusRing, loop } from '@/lib/ink/shapes'
import type { Pt } from '@/lib/ink/types'

export interface TearSeamParams {
  scissors?: boolean
  inset?: number
}

export const tearSeamRecipe = defineRecipe<TearSeamParams>({
  id: 'tear-off-seam',
  kind: 'tear-off-seam',
  layers: ['rest'],
  pad: 8,
  draw(ink, { w, h }, { scissors: withScissors = true, inset = 5 }, ctx) {
    const scissors = withScissors && !ctx.calm
    const vertical = h >= w
    const len = vertical ? h : w
    const P = (along: number, across: number): Pt => (vertical ? [w / 2 + across, along] : [along, h / 2 + across])
    ink.layer('rest', () => {
      const dashes: Array<{ pts: Pt[]; o: { start: 'soft'; end: 'soft' } }> = []
      const from = scissors ? 34 : 6
      for (let a = from; a < len - 6; a += 9.5) dashes.push({ pts: [P(a, inset), P(Math.min(a + 5.2, len - 6), inset + 0.15)], o: { start: 'soft', end: 'soft' } })
      ink.lines(dashes, 'pencil.fine', { alpha: 0.85, simple: true })
      if (scissors) {
        const s = 1
        ink.lines(
          [
            { pts: [P(9 * s, -3.4), P(27 * s, 1.6)], o: { start: 'soft', end: 'soft' } },
            { pts: [P(9 * s, 3.4), P(27 * s, -1.6)], o: { start: 'soft', end: 'soft' } },
          ],
          'ink.fine',
          { width: 1.05 },
        )
        for (const side of [-1, 1]) {
          const c = P(4.6, side * 4.6)
          loop(ink, c[0], c[1], 3.1, 3.1, { pen: 'ink.fine', turns: 1.08 })
        }
      }
    })
  },
})

export interface TearHintParams {
  toward: 'right' | 'left' | 'down'
}

export const tearHintRecipe = defineRecipe<TearHintParams>({
  id: 'tear-off-hint',
  kind: 'tear-off-hint',
  layers: ['rest'],
  pad: 6,
  draw(ink, { w, h }, { toward }) {
    const cx = w / 2, cy = h / 2
    const dir: Pt = toward === 'right' ? [1, 0] : toward === 'left' ? [-1, 0] : [0, 1]
    const nrm: Pt = [-dir[1], dir[0]]
    const at = (a: number, b: number): Pt => [cx + dir[0] * a + nrm[0] * b, cy + dir[1] * a + nrm[1] * b]
    ink.layer('rest', () => {
      const from = at(-12, 5), to = at(11, -2), tip = at(13, -2)
      ink.lines([{ pts: seg(from[0], from[1], to[0], to[1], toward === 'down' ? 3 : -3, 8), o: { start: 'soft', end: 'soft' } }], 'pencil', { width: 1.1, alpha: 0.9 })
      ink.lines(
        [
          { pts: seg(at(6, 5)[0], at(6, 5)[1], tip[0], tip[1], 0, 3), o: { start: 'soft', end: 'soft' } },
          { pts: seg(at(7, -9)[0], at(7, -9)[1], tip[0], tip[1], 0, 3), o: { start: 'soft', end: 'soft' } },
        ],
        'pencil',
        { width: 1.1, alpha: 0.9 },
      )
    })
  },
})

export const tearStubRecipe = defineRecipe<Record<string, never>>({
  id: 'tear-off-stub',
  kind: 'tear-off-stub',
  layers: ['focus'],
  lazy: ['focus'],
  pad: 12,
  draw(_ink, { w, h }, _params, ctx) {
    ctx.lazy('focus', (f) => focusRing(f, -1, -1, w + 2, h + 2, { r: 4 }))
  },
})
