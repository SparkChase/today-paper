import { Ink } from '@/lib/ink/builder'
import type { InkResult } from '@/lib/ink/builder'
import { box } from '@/lib/ink/shapes'
import { defineRecipe } from '@/lib/ink/recipes'
import { circleD, litEdge, num, pathTag, tok } from '@/lib/ink/recipes/paper-set-ink'
import { shadowMark } from '@/lib/ink/paper/faces'
import type { Accent } from '@/lib/ink/paper/props'
import type { Tier } from '@/lib/ink/types'

export type BoardTone = 'hardboard' | Accent

export interface ClipboardBoardParams {
  tone: BoardTone
}

const boardD = (w: number, h: number, r: number, j: () => number) =>
  `M${num(r)} ${num(j())}H${num(w - r)}Q${num(w)} 0 ${num(w + j())} ${num(r)}V${num(h - r)}Q${num(w)} ${num(h)} ${num(w - r)} ${num(h + j())}H${num(r)}Q0 ${num(h)} ${num(j())} ${num(h - r)}V${num(r)}Q0 0 ${num(r)} 0z`

export const clipboardBoardRecipe = defineRecipe<ClipboardBoardParams>({
  id: 'clipboard-board',
  kind: 'sheet',
  layers: ['rest'],
  pad: 4,
  draw(ink, { w, h }, { tone }, ctx) {
    const r = ink.next('board')
    const j = () => r.gauss(0, 0.25)
    const d = boardD(w, h, 11, j)
    const id = `ll-cb${ink.seed.toString(36)}`
    ink.layer('rest', () => {
      const plastic = tone !== 'hardboard'
      let s = `<clipPath id="${id}c"><path d="${d}"/></clipPath>`
      s += pathTag(d, { fill: plastic ? tok(tone) : tok('kraft') })
      s += `<g clip-path="url(#${id}c)">`
      if (!plastic) {
        s += pathTag(`M0 0H${num(w)}V${num(h)}H0z`, { fill: tok('ink'), op: 0.36 })
        let g = ''
        for (let y = 5; y < h; y += r.range(9, 15)) {
          const y0 = y + r.gauss(0, 1)
          g += `M0 ${num(y0)}` + Array.from({ length: 4 }, (_, k) => `Q${num(((k + 0.5) * w) / 4)} ${num(y0 + r.gauss(0, 1.8))} ${num(((k + 1) * w) / 4)} ${num(y0 + r.gauss(0, 0.9))}`).join('')
        }
        s += `<defs><path id="${id}g" d="${g}"/></defs>`
        s += `<use href="#${id}g" fill="none" stroke="${tok('ink')}" stroke-width=".7" stroke-opacity=".13"/>`
        s += `<use href="#${id}g" fill="none" stroke="${tok('photo')}" stroke-width=".6" stroke-opacity=".16" transform="translate(0 1.4)"/>`
      } else {
        s += `<linearGradient id="${id}s" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${tok('photo')}" stop-opacity=".3"/><stop offset=".5" stop-color="${tok('photo')}" stop-opacity="0"/></linearGradient><linearGradient id="${id}d" x1="0" y1="0" x2="1" y2="0"><stop offset=".6" stop-color="${tok('ink')}" stop-opacity="0"/><stop offset="1" stop-color="${tok('ink')}" stop-opacity=".14"/></linearGradient>`
        s += pathTag(`M0 0H${num(w)}V${num(h)}H0z`, { fill: `url(#${id}s)` })
        s += pathTag(`M0 0H${num(w)}V${num(h)}H0z`, { fill: `url(#${id}d)` })
      }
      s += pathTag(`M12 2.2H${num(w - 12)}M2.2 12V${num(h - 12)}`, { stroke: tok('photo'), sw: 2, op: 0.5 })
      s += pathTag(`M12 ${num(h - 2)}H${num(w - 12)}M${num(w - 2)} 12V${num(h - 12)}`, { stroke: tok('ink'), sw: 2.4, op: 0.22 })
      s += `</g>`
      s += pathTag(d, { stroke: tok('ink'), sw: 0.9, op: 0.42 })
      s += litEdge(`M12 0.7H${num(w - 12)}`, 0.45)
      ink.raw(shadowMark('lift', [11, 11, 11, 11]) + s, 'under')
      ink.grow([-1, -1, w + 1, h + 1])
      if (plastic && !ctx.calm) box(ink, 0.5, 0.5, w - 1, h - 1, { pen: 'ink.fine', corner: 11, opts: { alpha: 0.55, simple: w > 360 } })
    })
  },
})

export interface ClipboardClipOpts {
  width?: number
  tier?: Tier
  calm?: boolean
}

export function clipboardClip(seed: string | number, o: ClipboardClipOpts = {}): InkResult {
  const ink = new Ink(seed, { tier: o.tier, calm: o.calm })
  const w = o.width ?? 104
  const h = w * 0.42
  const r = ink.next('clip')
  const j = () => r.gauss(0, 0.2)
  const id = `ll-cl${ink.seed.toString(36)}`
  const py = h * 0.36
  const ph = h - py - 1
  let s = ''
  const arch = `M${num(w * 0.16)} ${num(py + 2)}C${num(w * 0.16)} ${num(2)} ${num(w * 0.24)} ${num(1.5)} ${num(w * 0.3)} ${num(1.5)}H${num(w * 0.7)}C${num(w * 0.76)} ${num(1.5)} ${num(w * 0.84)} ${num(2)} ${num(w * 0.84)} ${num(py + 2)}`
  s += pathTag(arch, { stroke: tok('ink'), sw: 4.4, op: 0.22, transform: 'translate(.8 1.6)' })
  s += pathTag(arch, { stroke: tok('pencil'), sw: 3.4 })
  s += pathTag(arch, { stroke: tok('photo'), sw: 1.2, op: 0.85, transform: 'translate(-.4 -.7)' })
  const plate = `M${num(3 + j())} ${num(py + 4)}Q3 ${num(py)} ${num(7)} ${num(py)}H${num(w - 7)}Q${num(w - 3)} ${num(py)} ${num(w - 3 + j())} ${num(py + 4)}V${num(py + ph - 3)}Q${num(w - 3)} ${num(py + ph)} ${num(w - 7)} ${num(py + ph)}H${num(7)}Q3 ${num(py + ph)} 3 ${num(py + ph - 3)}z`
  s += `<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tok('photo')}"/><stop offset=".38" stop-color="${tok('pencil-mark')}"/><stop offset="1" stop-color="${tok('pencil')}"/></linearGradient>`
  s += pathTag(plate, { fill: tok('ink'), op: 0.22, transform: 'translate(.9 2)' })
  s += pathTag(plate, { fill: `url(#${id}g)` })
  s += pathTag(plate, { stroke: tok('ink'), sw: 0.8, op: 0.5 })
  s += pathTag(`M8 ${num(py + 1.6)}H${num(w - 8)}`, { stroke: tok('photo'), sw: 1, op: 0.9 })
  for (const x of [w * 0.16, w * 0.84]) {
    s += pathTag(circleD(x, py + ph / 2 + 0.5, 2.5), { fill: tok('pencil-mark') })
    s += pathTag(circleD(x, py + ph / 2 + 0.5, 2.5), { stroke: tok('ink'), sw: 0.6, op: 0.5 })
    s += pathTag(circleD(x - 0.6, py + ph / 2 - 0.2, 0.8), { fill: tok('photo'), op: 0.95 })
  }
  ink.raw(s, 'top')
  ink.grow([0, 0, w, h])
  return ink.toSvg({ w, h, pad: 3 })
}
