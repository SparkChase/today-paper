import { defineRecipe } from '@/lib/ink/recipes'
import { markRevealId, revealMark } from '@/lib/ink/recipes/mark-reveal-ink'
import { markPen, type MarkPen, type MarkWeight } from '@/lib/ink/recipes/text-marks-ink'
import type { Line, Pt } from '@/lib/ink/types'

export type SignatureFlourish = 'swoosh' | 'underline' | 'none'

export interface SignatureParams {
  flourish: SignatureFlourish
  tone: MarkPen
  weight: MarkWeight
  fs: number
  animate?: boolean
}

export const signatureRecipe = defineRecipe<SignatureParams>({
  id: 'signature',
  kind: 'signature',
  layers: ['rest'],
  pad: 20,
  draw(ink, { w, h }, p, ctx) {
    if (p.flourish === 'none') return
    const { pen, width } = markPen(p.tone, p.weight, p.fs * 0.5)
    const rng = ink.next('sig')
    const base = Math.max(p.fs * 0.5, h - 12) * 0.88
    const r = Math.max(4, p.fs * 0.16)
    const lines: Line[] = []
    if (p.flourish === 'underline') {
      const y = base + r * 0.6
      const pts: Pt[] = []
      for (let i = 0; i <= 12; i++) {
        const t = i / 12
        pts.push([-w * 0.02 + t * w * 1.08, y + Math.sin(t * Math.PI * 1.1) * -r * 0.5 - t * r * 0.7 + rng.gauss(0, 0.2)])
      }
      lines.push({ pts, o: { start: 'pool', end: 'flick', wobble: 0.6 } })
    } else {
      const x0 = w * 0.03, y0 = base
      const pts: Pt[] = []
      const loop = 14
      for (let i = 0; i <= loop; i++) {
        const a = (i / loop) * Math.PI * 2 + Math.PI * 0.5
        pts.push([x0 + Math.cos(a) * r * 1.25 - r * 0.2, y0 - r * 0.5 - Math.sin(a) * r * 0.85 + (i / loop) * r * 0.9])
      }
      const n = 22
      const sx = pts[pts.length - 1][0], sy = pts[pts.length - 1][1]
      for (let i = 1; i <= n; i++) {
        const t = i / n
        const x = sx + t * (w * 1.1 - sx)
        const sag = Math.sin(t * Math.PI * 0.95) * r * 0.9
        const rise = t * t * t * r * 3.2
        pts.push([x, sy + sag - rise + rng.gauss(0, 0.15)])
      }
      lines.push({ pts, o: { start: 'pool', end: 'flick', wobble: 0.55, speed: 1.05 } })
      const cx0 = w * rng.range(0.42, 0.55), cx1 = w * rng.range(0.9, 1.0), cy = base + r * 1.35
      const under: Pt[] = []
      for (let i = 0; i <= 8; i++) {
        const t = i / 8
        under.push([cx0 + t * (cx1 - cx0), cy - t * r * 0.9 + Math.sin(t * Math.PI) * r * 0.25])
      }
      lines.push({ pts: under, o: { start: 'soft', end: 'flick', wobble: 0.5, speed: 1.25 } })
    }
    ink.layer('rest', () => {
      if (p.animate) revealMark(ink, { id: markRevealId(ctx.seed, 'g'), lines, pen, box: { w, h }, pad: 28, width, revealWidth: 5 + p.fs * 0.06 })
      else ink.lines(lines, pen, { width })
    })
  },
})
