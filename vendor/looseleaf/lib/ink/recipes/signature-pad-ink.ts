import { Ink } from '@/lib/ink/builder'
import { textPath, measureText, capHeight } from '@/lib/ink/art/glyph-text'
import { seg } from '@/lib/ink/geom'
import { defineRecipe } from '@/lib/ink/recipes'
import { line } from '@/lib/ink/shapes'
import type { PaintKey } from '@/lib/ink/paint'

export interface SignatureBaselineParams {
  invalid?: boolean
}

export const BASELINE_AT = 0.72

export const signatureBaselineRecipe = defineRecipe<SignatureBaselineParams>({
  id: 'signature-baseline',
  kind: 'signature-baseline',
  layers: ['rest'],
  pad: 8,
  draw(ink, { w, h }, { invalid }) {
    const y = h * BASELINE_AT
    const pen = invalid ? 'red' : 'pencil'
    ink.layer('rest', () => {
      line(ink, w * 0.11, y, w - w * 0.05, y - 1.4, { pen, opts: { alpha: invalid ? 0.9 : 0.85 } })
      const x = w * 0.05, s = Math.min(11, h * 0.07)
      ink.lines(
        [
          { pts: seg(x - s, y - 2 * s - 2, x + s, y - 2, 0.2, 4), o: { start: 'soft', end: 'flick' } },
          { pts: seg(x + s, y - 2 * s - 3, x - s, y - 1, 0.2, 4), o: { start: 'soft', end: 'flick' } },
        ],
        pen,
        { width: 1.1 },
      )
    })
  },
})

export interface TypedSignature {
  svg: string
  size: number
}

export function typedSignature(text: string, w: number, h: number, seed: string, color: PaintKey = 'ink-you'): TypedSignature {
  const name = text.trim().slice(0, 60)
  const ink = new Ink(`sig|${seed}`)
  if (!name) return { svg: '', size: 0 }
  const x0 = w * 0.11
  const room = w - x0 - w * 0.06
  const spacing = 2
  let size = Math.min(h * 0.3, 54)
  const natural = measureText('hand', name, size, spacing)
  if (natural > room) size = Math.max(14, (size * room) / natural)
  const base = h * BASELINE_AT - 5
  const tp = textPath(name, x0, base, size, ink.next('type'), { font: 'hand', anchor: 'start', spacing, jitter: 1.1, rot: -2.2 })
  ink.flat('felt', tp.d, color, 0.93, { bbox: tp.bbox })
  const sw = Math.min(room, tp.width + 16)
  const cap = capHeight('hand', size)
  ink.stroke(
    [
      [x0 - 4, base + 5 - cap * 0.05],
      [x0 + sw * 0.35, base + 8],
      [x0 + sw * 0.7, base + 4.5],
      [x0 + sw + 4, base - 2],
    ],
    'ink.brush',
    { color, width: 0.6, end: 'flick', start: 'soft' },
  )
  return { svg: ink.toSvg({ w, h, pad: 4 }).svg, size }
}
