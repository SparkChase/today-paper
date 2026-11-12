import { coffeeRing } from '@/lib/ink/paper/props'
import { defineRecipe } from '@/lib/ink/recipes'
import { num, pathTag, tok } from '@/lib/ink/recipes/paper-set-ink'

export type NapkinFold = 'quarter' | 'half' | 'none'

export interface NapkinParams {
  fold: NapkinFold
  stain: boolean
}

export const napkinRecipe = defineRecipe<NapkinParams>({
  id: 'napkin-decor',
  kind: 'napkin',
  layers: ['rest'],
  pad: 4,
  draw(ink, { w, h }, { fold, stain }, ctx) {
    const r = ink.next('creases')
    const id = `ll-nk${ink.seed.toString(36)}`
    ink.layer('rest', () => {
      let s = ''
      const reach = 34
      const vertical = (x0: number, i: number) => {
        const j = r.gauss(0, 0.5)
        s += `<linearGradient id="${id}v${i}" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="${tok('ink')}" stop-opacity=".085"/><stop offset="1" stop-color="${tok('ink')}" stop-opacity="0"/></linearGradient>`
        s += pathTag(`M${num(x0 - reach)} 0H${num(x0)}V${num(h)}H${num(x0 - reach)}z`, { fill: `url(#${id}v${i})`, transform: `translate(${num(j)} 0)` })
        s += pathTag(`M${num(x0 + j)} 3L${num(x0 + j + r.gauss(0, 0.6))} ${num(h * 0.5)}L${num(x0 + j)} ${num(h - 3)}`, { stroke: tok('ink'), sw: 0.7, op: 0.2 })
        s += pathTag(`M${num(x0 + j + 1.2)} 3L${num(x0 + j + 1.2)} ${num(h - 3)}`, { stroke: tok('photo'), sw: 1, op: 0.75 })
      }
      const horizontal = (y0: number, i: number) => {
        const j = r.gauss(0, 0.5)
        s += `<linearGradient id="${id}h${i}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${tok('ink')}" stop-opacity=".085"/><stop offset="1" stop-color="${tok('ink')}" stop-opacity="0"/></linearGradient>`
        s += pathTag(`M0 ${num(y0 - reach)}H${num(w)}V${num(y0)}H0z`, { fill: `url(#${id}h${i})`, transform: `translate(0 ${num(j)})` })
        s += pathTag(`M3 ${num(y0 + j)}L${num(w * 0.5)} ${num(y0 + j + r.gauss(0, 0.6))}L${num(w - 3)} ${num(y0 + j)}`, { stroke: tok('ink'), sw: 0.7, op: 0.2 })
        s += pathTag(`M3 ${num(y0 + j + 1.2)}H${num(w - 3)}`, { stroke: tok('photo'), sw: 1, op: 0.75 })
      }
      if (fold === 'quarter') {
        vertical(w / 2 + r.gauss(0, 0.4), 0)
        horizontal(h / 2 + r.gauss(0, 0.4), 0)
      } else if (fold === 'half') horizontal(h / 2 + r.gauss(0, 0.4), 0)
      if (stain) {
        const R = Math.min(46, Math.max(24, Math.min(w, h) * 0.13))
        const ring = coffeeRing(`${ink.seed}|ring`, { radius: R, tier: ink.tier, calm: ctx.calm })
        s += `<g transform="translate(${num(w * 0.58)} ${num(h * 0.56)}) rotate(${num(r.range(-30, 30))} ${num(R)} ${num(R)})">${ring.svg}</g>`
      }
      ink.raw(s, 'top')
      ink.grow([0, 0, w, h])
    })
  },
})
