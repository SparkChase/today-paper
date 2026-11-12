import { coffeeRing } from '@/lib/ink/paper/props'
import { defineRecipe } from '@/lib/ink/recipes'
import { holePunch, mirrorX, num, reinforcement } from '@/lib/ink/recipes/paper-set-ink'

export type PageHoles = 'none' | 'start' | 'top'

export interface PageParams {
  holes: PageHoles
  reinforce: boolean
  stain: boolean
}

export const PAGE_HOLE = { inset: 22, r: 7.5 } as const

export function pageHoles(w: number, h: number, holes: PageHoles): Array<[number, number]> {
  if (holes === 'none') return []
  if (holes === 'top') {
    const gap = Math.min(150, Math.max(70, w * 0.2))
    return [[w / 2 - gap / 2, PAGE_HOLE.inset], [w / 2 + gap / 2, PAGE_HOLE.inset]]
  }
  const x = PAGE_HOLE.inset
  if (h >= 380) return [[x, Math.max(48, h * 0.1136)], [x, h / 2], [x, Math.min(h - 48, h * 0.8864)]]
  if (h >= 190) return [[x, h * 0.3], [x, h * 0.7]]
  return [[x, h / 2]]
}

export const pageRecipe = defineRecipe<PageParams>({
  id: 'page-decor',
  kind: 'page',
  layers: ['rest'],
  pad: 0,
  draw(ink, { w, h }, { holes, reinforce, stain }, ctx) {
    const r = ink.next('holes')
    ink.layer('rest', () => {
      let s = ''
      if (stain) {
        const R = Math.min(52, Math.max(26, Math.min(w, h) * 0.09))
        const ring = coffeeRing(`${ink.seed}|ring`, { radius: R, tier: ink.tier, calm: ctx.calm })
        s += `<g transform="translate(${num(w - R * 2 - Math.min(36, w * 0.06))} ${num(h - R * 2 - Math.min(64, h * 0.1))}) rotate(${num(r.range(-30, 30))} ${num(R)} ${num(R)})">${ring.svg}</g>`
      }
      const pts = pageHoles(w, h, holes)
      let holeSvg = ''
      pts.forEach(([x, y], i) => {
        const rr = PAGE_HOLE.r * (1 + r.gauss(0, 0.025))
        const cx = x + r.gauss(0, 0.4)
        const cy = y + r.gauss(0, 0.5)
        if (reinforce) holeSvg += reinforcement(cx, cy, rr)
        holeSvg += holePunch(`ll-pg${ink.seed.toString(36)}h${i}`, cx, cy, rr, r.range(-30, 30))
      })
      s += holeSvg
      ink.raw(ctx.dir === 'rtl' && holes === 'start' ? mirrorX(w, s) : s, 'top')
      if (pts.length) ink.grow([-2, -2, w + 2, h + 2])
    })
  },
})
