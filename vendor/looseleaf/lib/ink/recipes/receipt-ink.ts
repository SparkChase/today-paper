import { loop } from '@/lib/ink/shapes'
import { defineRecipe } from '@/lib/ink/recipes'
import { hashSeed, makeRng } from '@/lib/ink/rng'
import { n } from '@/lib/ink/paint'

export interface ReceiptCircleParams {
  pen: 'redfelt' | 'blue' | 'ink'
}

export const receiptCircleRecipe = defineRecipe<ReceiptCircleParams>({
  id: 'receipt-circle',
  kind: 'circle',
  layers: ['rest'],
  pad: 14,
  draw(ink, { w, h }, { pen }, ctx) {
    ink.layer('rest', () => {
      const rx = w / 2 + 9
      const ry = Math.max(h / 2 + 4, 12)
      loop(ink, w / 2, h / 2, rx, ry, { pen: ctx.calm ? 'redfelt.fine' : pen, turns: 1.1 })
    })
  },
})

export interface Barcode {
  d: string
  bars: ReadonlyArray<readonly [x: number, w: number]>
}

export function barcode(value: string, width: number, height: number): Barcode {
  const rng = makeRng(`barcode:${hashSeed(value)}`)
  const modules: number[] = []
  modules.push(1, 1, 1, 1)
  const digits = value.replace(/\D/g, '') || value
  for (const ch of digits) {
    const k = ch.charCodeAt(0)
    modules.push(1 + (k % 3), 1 + ((k >> 2) % 2), 1 + ((k >> 1) % 3), 1 + ((k >> 3) % 2))
    if (rng.chance(0.3)) modules.push(1 + rng.int(0, 1), 1)
  }
  modules.push(1, 1, 1, 1)
  const total = modules.reduce((a, b) => a + b, 0)
  const unit = width / total
  const bars: Array<readonly [number, number]> = []
  let x = 0
  modules.forEach((m, i) => {
    const w = m * unit
    if (i % 2 === 0) bars.push([x + rng.gauss(0, unit * 0.04), w * (1 + rng.gauss(0, 0.03))])
    x += w
  })
  let d = ''
  const drop = height * 0.012
  for (const [bx, bw] of bars) d += `M${n(bx, 20)} ${n(rng.range(0, drop), 20)}h${n(bw, 20)}V${n(height - rng.range(0, drop), 20)}h${n(-bw, 20)}z`
  return { d, bars }
}
