import { defineRecipe } from '@/lib/ink/recipes'
import { markRevealId, revealMark } from '@/lib/ink/recipes/mark-reveal-ink'
import { markPen, STRUCTURAL_DRY, type MarkPen, type MarkWeight } from '@/lib/ink/recipes/text-marks-ink'
import type { Rng } from '@/lib/ink/rng'
import { bracketLines } from '@/lib/ink/shapes'
import type { Line, Pt } from '@/lib/ink/types'

export type BracketKind = 'square' | 'curly' | 'round'

export interface BracketParams {
  kind: BracketKind
  side: 'start' | 'end'
  tone: MarkPen
  weight: MarkWeight
  inset: number
  animate?: boolean
}

function roundLines(rng: Rng, x: number, y: number, h: number, d: 1 | -1): Line[] {
  const tip = Math.min(11, Math.max(3.5, h * 0.13))
  const skew = rng.range(0.78, 1.28)
  const lean = rng.gauss(0, 0.014) * h
  const pts: Pt[] = []
  for (let i = 0; i <= 14; i++) {
    const t = i / 14
    pts.push([x + d * tip * (1 - Math.sin(Math.PI * t ** skew)) + lean * (t - 0.5) + rng.gauss(0, 0.12), y + h * t])
  }
  return [{ pts, o: { start: 'soft', end: 'flick', wobble: 0.6 } }]
}

export const bracketRecipe = defineRecipe<BracketParams>({
  id: 'bracket',
  kind: 'bracket',
  layers: ['rest'],
  pad: 12,
  draw(ink, { w, h }, p, ctx) {
    const { pen, width } = markPen(p.tone, p.weight, 18)
    const left = (p.side === 'start') === (ctx.dir !== 'rtl')
    const x = left ? p.inset : w - p.inset
    const trim = Math.min(6, h * 0.04)
    const H = Math.max(8, h - 2 * trim)
    const d = left ? 1 : -1
    const rng = ink.next('bracket')
    const lines = p.kind === 'round' ? roundLines(rng, x, trim, H, d) : bracketLines(rng, x, trim, H, { kind: p.kind, dir: d })
    ink.layer('rest', () => {
      if (p.animate) revealMark(ink, { id: markRevealId(ctx.seed, 'b'), lines, pen, box: { w, h }, pad: 14, width, opts: { dry: STRUCTURAL_DRY }, revealWidth: 5 })
      else ink.lines(lines, pen, { width, dry: STRUCTURAL_DRY })
    })
  },
})
