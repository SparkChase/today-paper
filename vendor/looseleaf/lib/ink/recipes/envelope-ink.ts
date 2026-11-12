import { defineRecipe } from '@/lib/ink/recipes'
import { circleD, litEdge, mirrorX, num, paperFill, pathTag, polyD, tok } from '@/lib/ink/recipes/paper-set-ink'
import type { Accent } from '@/lib/ink/paper/props'
import type { StockName } from '@/lib/ink/paper/stocks'
import { spline } from '@/lib/ink/geom'
import type { Pt } from '@/lib/ink/types'

export interface EnvelopeBackParams {
  stock: StockName
}

export interface EnvelopeFrontParams {
  stock: StockName
  stamp: Accent | 'none'
  postmark: boolean
  airmail: boolean
}

export const FLAP = 0.5

const rectD = (w: number, h: number) => `M0 0H${num(w)}V${num(h)}H0z`

export const envelopeBackRecipe = defineRecipe<EnvelopeBackParams>({
  id: 'envelope-back',
  kind: 'sheet',
  layers: ['rest', 'hover', 'open'],
  pad: (b) => Math.ceil(b.h * FLAP) + 8,
  draw(ink, { w, h }, { stock }) {
    const r = ink.next('back')
    const flap = (lift: number, id: string) => {
      const apexX = w / 2 + r.gauss(0, 1.5)
      const H = h * lift
      const d = `M1 0.5L${num(apexX)} ${num(-H)}L${num(w - 1)} 0.5z`
      let s = paperFill(ink.seed, d, { stock, id, shadow: true, far: false })
      s += pathTag(`M${num(apexX)} ${num(-H)}L${num(w - 1)} 0.5H${num(apexX)}z`, { fill: tok('ink'), op: 0.06 })
      s += pathTag(`M2 0.6H${num(w - 2)}`, { stroke: tok('ink'), sw: 0.9, op: 0.22 })
      s += litEdge(`M1.5 -0.2L${num(apexX)} ${num(-H + 0.6)}`, 0.55)
      return s
    }
    ink.layer('rest', () => {
      ink.raw(paperFill(ink.seed, rectD(w, h), { stock, id: 'b', shadow: true }), 'under')
      ink.grow([-2, -2, w + 2, h + 2])
    })
    ink.layer('hover', () => {
      ink.raw(flap(Math.min(0.12, 14 / h), 'h'), 'under')
      ink.grow([-2, -h * 0.13, w + 2, 2])
    })
    ink.layer('open', () => {
      ink.raw(flap(FLAP, 'o'), 'under')
      ink.grow([-2, -h * FLAP - 4, w + 2, 2])
    })
  },
})

export function perfRectD(x: number, y: number, w: number, h: number, r: number, pitch: number): string {
  const nx = Math.max(2, Math.round(w / pitch))
  const ny = Math.max(2, Math.round(h / pitch))
  const gx = (w - nx * 2 * r) / (nx + 1)
  const gy = (h - ny * 2 * r) / (ny + 1)
  let d = `M${num(x)} ${num(y)}`
  for (let i = 0; i < nx; i++) d += `h${num(gx)}a${num(r)} ${num(r)} 0 0 0 ${num(2 * r)} 0`
  d += `h${num(gx)}`
  for (let i = 0; i < ny; i++) d += `v${num(gy)}a${num(r)} ${num(r)} 0 0 0 0 ${num(2 * r)}`
  d += `v${num(gy)}`
  for (let i = 0; i < nx; i++) d += `h${num(-gx)}a${num(r)} ${num(r)} 0 0 0 ${num(-2 * r)} 0`
  d += `h${num(-gx)}`
  for (let i = 0; i < ny; i++) d += `v${num(-gy)}a${num(r)} ${num(r)} 0 0 0 0 ${num(-2 * r)}`
  return d + `v${num(-gy)}z`
}

export const stampBox = (w: number): { sw: number; sh: number; x: number; y: number } => {
  const sw = Math.max(30, Math.min(58, w * 0.115))
  return { sw, sh: sw * 1.22, x: w - sw - Math.max(12, w * 0.04), y: Math.max(12, w * 0.04) }
}

export const envelopeFrontRecipe = defineRecipe<EnvelopeFrontParams>({
  id: 'envelope-front',
  kind: 'envelope',
  layers: ['rest'],
  pad: 8,
  draw(ink, { w, h }, { stock, stamp, postmark, airmail }, ctx) {
    const r = ink.next('front')
    ink.layer('rest', () => {
      let s = paperFill(ink.seed, rectD(w, h), { stock, id: 'f' })
      s += litEdge(`M1.5 0.6H${num(w - 1.5)}`, 0.7)
      const apex: Pt = [w / 2 + r.gauss(0, 1), h * 0.5]
      for (const [corner, k] of [[[0, h], 1], [[w, h], -1]] as const) {
        const line = spline([[corner[0], corner[1]], [(corner[0] + apex[0]) / 2 + r.gauss(0, 0.6), (corner[1] + apex[1]) / 2 + r.gauss(0, 0.6)], apex], 4)
        const d = polyD(line)
        s += pathTag(d, { stroke: tok('ink'), sw: 0.8, op: 0.2 })
        s += pathTag(d, { stroke: tok('photo'), sw: 0.9, op: 0.6, transform: `translate(${num(k * 0.8)} -0.9)` })
      }
      if (airmail) {
        const bw = Math.max(6, Math.min(9, h * 0.04))
        const step = 13
        const cid = `ll-am${ink.seed.toString(36)}`
        s += `<clipPath id="${cid}"><path clip-rule="evenodd" d="${rectD(w, h)}M${num(bw)} ${num(bw)}V${num(h - bw)}H${num(w - bw)}V${num(bw)}z"/></clipPath>`
        let stripes = ''
        for (let x = -h; x < w + h; x += step) {
          const c = Math.round(x / step) % 2 ? tok('sky') : tok('tomato')
          stripes += `<path d="M${num(x)} ${num(h)}L${num(x + h)} 0" stroke="${c}" stroke-width="${num(step / 2 + 0.6)}" fill="none"/>`
        }
        s += `<g clip-path="url(#${cid})" opacity=".92">${stripes}</g>`
        s += pathTag(`M${num(bw)} ${num(bw)}H${num(w - bw)}V${num(h - bw)}H${num(bw)}z`, { stroke: tok('ink'), sw: 0.6, op: 0.22 })
      }
      let inner = ''
      const { sw, sh, x, y } = stampBox(w)
      if (stamp !== 'none') {
        const d = perfRectD(x, y, sw, sh, 2.1, 7)
        inner += pathTag(d, { fill: tok('ink'), op: 0.2, transform: 'translate(.7 1.3)' })
        inner += pathTag(d, { fill: tok('photo') })
        inner += pathTag(d, { stroke: tok('ink'), sw: 0.6, op: 0.3 })
        const px = x + 4.5, py = y + 4.5, pw = sw - 9, ph = sh - 9
        inner += pathTag(`M${num(px)} ${num(py)}h${num(pw)}v${num(ph)}h${num(-pw)}z`, { fill: tok(stamp), op: 0.85 })
        inner += pathTag(circleD(px + pw * 0.66, py + ph * 0.3, pw * 0.14), { fill: tok('lemon') })
        inner += pathTag(`M${num(px)} ${num(py + ph)}V${num(py + ph * 0.7)}Q${num(px + pw * 0.3)} ${num(py + ph * 0.5)} ${num(px + pw * 0.6)} ${num(py + ph * 0.72)}T${num(px + pw)} ${num(py + ph * 0.66)}V${num(py + ph)}z`, { fill: tok('ink'), op: 0.28 })
        inner += pathTag(`M${num(px)} ${num(py)}h${num(pw)}v${num(ph)}h${num(-pw)}z`, { stroke: tok('ink'), sw: 0.6, op: 0.35 })
      }
      if (postmark) {
        const pr = Math.max(13, sw * 0.42)
        const cx = x - pr * 0.4 + r.gauss(0, 1.2), cy = y + sh * 0.5 + r.gauss(0, 1.2)
        inner += pathTag(circleD(cx, cy, pr), { stroke: tok('ink-you'), sw: 1.3, op: 0.5 })
        inner += pathTag(circleD(cx, cy, pr - 3.6), { stroke: tok('ink-you'), sw: 0.8, op: 0.42 })
        inner += pathTag(`M${num(cx - pr * 0.6)} ${num(cy)}h${num(pr * 1.2)}M${num(cx - pr * 0.5)} ${num(cy - 4)}h${num(pr)}M${num(cx - pr * 0.5)} ${num(cy + 4)}h${num(pr)}`, { stroke: tok('ink-you'), sw: 0.7, op: 0.4 })
        let wave = ''
        const x0 = cx + pr + 1
        const ripples = Math.max(2, Math.min(5, Math.floor((w - 5 - x0) / 8)))
        for (let k = 0; k < 4; k++) {
          const yy = cy - 9 + k * 6
          wave += `M${num(x0)} ${num(yy)}` + Array.from({ length: ripples }, (_, j) => `q${num(4)} ${j % 2 ? -3 : 3} ${num(8)} 0`).join('')
        }
        inner += pathTag(wave, { stroke: tok('ink-you'), sw: 1.05, op: 0.42 })
      }
      s += ctx.dir === 'rtl' ? mirrorX(w, inner) : inner
      ink.raw(s, 'under')
      ink.grow([-2, -2, w + 2, h + 2])
    })
  },
})
