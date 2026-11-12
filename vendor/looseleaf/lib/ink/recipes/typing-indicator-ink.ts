import { blobFill } from '@/lib/ink/fills'
import { rectPoly } from '@/lib/ink/geom'
import { clamp } from '@/lib/ink/rng'
import { defineRecipe } from '@/lib/ink/recipes'
import type { Ink } from '@/lib/ink/builder'
import type { PenName, Pt } from '@/lib/ink/types'

export type TypingVariant = 'dots' | 'squiggle'

export interface TypingParams {
  variant: TypingVariant
  pen?: 'ink' | 'you'
  pencil?: boolean
}

export function typingGeometry(w: number, h: number, variant: TypingVariant): { y: number; xs: number[]; x0: number; x1: number; span: number } {
  const y = h * 0.7
  if (variant === 'dots') {
    const gap = clamp(h * 0.62, 10, 18)
    const start = w * 0.14
    const xs = [start, start + gap, start + 2 * gap]
    return { y, xs, x0: xs[0], x1: xs[2], span: xs[2] - xs[0] }
  }
  const x0 = w * 0.1
  const x1 = w * 0.62
  return { y, xs: [x0, x1], x0, x1, span: x1 - x0 }
}

function cursive(ink: Ink, x0: number, y: number, span: number, amp: number): Pt[] {
  const rng = ink.next('scrawl')
  const loops = Math.max(3, Math.round(span / (amp * 3.1)))
  const steps = loops * 12
  const ph = rng.range(0, 1)
  const pts: Pt[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = (t * loops + ph) * Math.PI * 2
    const k = 1 + 0.18 * Math.sin(t * 9 + ph * 6) + rng.gauss(0, 0.015)
    pts.push([x0 + span * t - amp * 1.1 * k * Math.sin(a), y - amp * 0.8 * k * Math.cos(a) - amp * 0.5 * Math.sin(t * Math.PI)])
  }
  return pts
}

function pencilShape(ink: Ink, tx: number, ty: number, scale: number): void {
  const L = 21 * scale, hw = 2.7 * scale, cone = 5.4 * scale, ferrule = 2.2 * scale, eraser = 3.2 * scale
  const body: Pt[] = rectPoly(cone, -hw, L - cone, 2 * hw)
  const tip: Pt[] = [[0, 0], [cone + 0.4, -hw * 0.92], [cone + 0.4, hw * 0.92]]
  ink.group({ transform: `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) rotate(-38)` }, () => {
    blobFill(ink, body, 'lemon', { alpha: 0.92, mis: 0.5, rough: 0.3 })
    blobFill(ink, tip, 'kraft', { alpha: 0.95, mis: 0.4, rough: 0.2 })
    blobFill(ink, rectPoly(L, -hw, ferrule + eraser, 2 * hw), 'bubblegum', { alpha: 0.9, mis: 0.4, rough: 0.2 })
    ink.stroke([[cone - 1, -hw], [L, -hw - 0.2], [L + ferrule + eraser, -hw + 0.1]], 'ink.fine', { simple: true, wobble: 0.5, width: 0.9 })
    ink.stroke([[cone - 1, hw], [L, hw + 0.2], [L + ferrule + eraser, hw - 0.1]], 'ink.fine', { simple: true, wobble: 0.5, width: 0.9 })
    ink.stroke([[cone, -hw], [0.2, 0], [cone, hw]], 'ink.fine', { simple: true, wobble: 0.4, width: 0.9 })
    ink.stroke([[L, -hw], [L + 0.4, hw]], 'ink.fine', { simple: true, wobble: 0.3, width: 0.8 })
    ink.stroke([[0, 0], [1.9 * scale, 0]], 'pencil', { simple: true, width: 1.5 })
  }, 'top')
}

export const typingIndicatorRecipe = defineRecipe<TypingParams>({
  id: 'typing-indicator',
  kind: 'typing',
  layers: ['rest'],
  pad: 10,
  draw(ink, { w, h }, { variant, pen = 'ink', pencil = true }, ctx) {
    const g = typingGeometry(w, h, variant)
    const felt: PenName = ctx.calm ? 'pencil.fine' : pen === 'you' ? 'blue' : 'ink'
    const r = clamp(h * 0.1, 1.8, 3.2)
    ink.layer('rest', () => {
      if (variant === 'dots') {
        g.xs.forEach((x, i) => {
          ink.part(
            `dot-${i + 1}`,
            () => {
              ink.dot(x + ink.rng.gauss(0, 0.3), g.y + ink.rng.gauss(0, 0.4), r * (i === 1 ? 1.05 : 0.95), felt, { alpha: 1 })
            },
            'top',
          )
        })
      } else {
        ink.part(
          'line',
          () => {
            ink.stroke(cursive(ink, g.x0, g.y - 2, g.span, clamp(h * 0.16, 2.6, 5)), felt, { wobble: 0.5, speed: 1.05, start: 'pool', end: 'flick' })
          },
          'top',
        )
      }
      if (pencil) ink.part('pencil', () => pencilShape(ink, g.x1 + clamp(h * 0.32, 5, 9), g.y + 0.5, clamp(h / 24, 0.7, 1.4)), 'top')
    })
  },
})

