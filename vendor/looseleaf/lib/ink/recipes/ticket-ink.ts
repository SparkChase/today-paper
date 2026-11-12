import { defineRecipe } from '@/lib/ink/recipes'
import { circleD, litEdge, num, paperFill, pathTag, tok } from '@/lib/ink/recipes/paper-set-ink'
import type { StockName } from '@/lib/ink/paper/stocks'

export type TicketStub = 'end' | 'start' | 'none'

export interface TicketParams {
  stock: StockName
  stub: TicketStub
  stubWidth: number
  punched: boolean
}

export const TICKET = { corner: 6, notch: 8, hole: 1.2, holeGap: 6.6, frameInset: 7 } as const

export function ticketPath(w: number, h: number, sx: number, holes: readonly [number, number][] = []): { d: string; holesD: string } {
  const c = TICKET.corner
  const nr = TICKET.notch
  let d = `M${num(c)} 0`
  const notch = sx > 0 && sx < w
  if (notch) d += `H${num(sx - nr)}A${nr} ${nr} 0 0 0 ${num(sx + nr)} 0`
  d += `H${num(w - c)}A${c} ${c} 0 0 0 ${num(w)} ${c}V${num(h - c)}A${c} ${c} 0 0 0 ${num(w - c)} ${num(h)}`
  if (notch) d += `H${num(sx + nr)}A${nr} ${nr} 0 0 0 ${num(sx - nr)} ${num(h)}`
  d += `H${num(c)}A${c} ${c} 0 0 0 0 ${num(h - c)}V${num(c)}A${c} ${c} 0 0 0 ${num(c)} 0z`
  let holesD = ''
  if (notch) for (let y = nr + 7; y < h - nr - 6; y += TICKET.holeGap) holesD += circleD(sx, y, TICKET.hole)
  for (const [x, y] of holes) holesD += circleD(x, y, 5.6)
  return { d, holesD }
}

export const ticketRecipe = defineRecipe<TicketParams>({
  id: 'ticket-sheet',
  kind: 'sheet',
  layers: ['rest'],
  pad: 4,
  draw(ink, { w, h }, { stock, stub, stubWidth, punched }, ctx) {
    const r = ink.next('ticket')
    const left = (stub === 'start') !== (ctx.dir === 'rtl')
    const sx = stub === 'none' ? -1 : left ? stubWidth : w - stubWidth
    const bodyStart = stub === 'none' ? 0 : left ? sx : 0
    const bodyEnd = stub === 'none' ? w : left ? w : sx
    const px = ctx.dir === 'rtl' ? bodyStart + 32 : bodyEnd - 32
    const punch: [number, number][] = punched ? [[px + r.gauss(0, 2), h - 30 + r.gauss(0, 2.5)]] : []
    const { d, holesD } = ticketPath(w, h, sx, punch)
    ink.layer('rest', () => {
      let s = paperFill(ink.seed, d + holesD, { stock, evenodd: true, shadow: true, inset: [0.5, 0.5, 0.5, 0.5] })
      const fi = TICKET.frameInset
      const frame = (x0: number, x1: number) => `M${num(x0)} ${num(fi)}H${num(x1)}V${num(h - fi)}H${num(x0)}z`
      const [b0, b1] = stub === 'none' ? [fi, w - fi] : left ? [sx + fi + 2, w - fi] : [fi, sx - fi - 2]
      s += pathTag(frame(b0, b1), { stroke: tok('ink'), sw: 0.8, op: 0.34 })
      s += pathTag(frame(b0 + 2, b1 - 2), { stroke: tok('ink'), sw: 0.5, op: 0.2 })
      if (stub !== 'none') {
        const [s0, s1] = left ? [fi, sx - fi - 2] : [sx + fi + 2, w - fi]
        s += pathTag(frame(s0, s1), { stroke: tok('ink'), sw: 0.8, op: 0.34 })
        s += pathTag(`M${num(sx)} ${num(TICKET.notch)}V${num(h - TICKET.notch)}`, { stroke: tok('ink'), sw: 0.6, op: 0.1 })
      }
      s += litEdge(`M${num(TICKET.corner)} 0.6H${num(w - TICKET.corner)}`, 0.7)
      ink.raw(s, 'under')
      ink.grow([-2, -2, w + 2, h + 2])
    })
  },
})
