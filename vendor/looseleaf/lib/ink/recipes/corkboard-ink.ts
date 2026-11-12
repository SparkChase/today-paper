import type { Ink } from '@/lib/ink/builder'
import { bandFill, blobFill, rough } from '@/lib/ink/fills'
import { TIERS, roundRectPoly, smoothClosed } from '@/lib/ink/geom'
import { n, type PaintKey } from '@/lib/ink/paint'
import { defineRecipe } from '@/lib/ink/recipes'
import { clamp } from '@/lib/ink/rng'
import { box, focusRing, loop } from '@/lib/ink/shapes'

export const CORK_FRAME = 12
const TILE = 128

export interface CorkBoardParams {
  frame?: number
}

const ell = (cx: number, cy: number, rx: number, ry: number, rot = 0): string => {
  const c = Math.cos(rot), s = Math.sin(rot)
  const p = (x: number, y: number) => `${n(cx + x * c - y * s, 10)} ${n(cy + x * s + y * c, 10)}`
  return `M${p(-rx, 0)}A${n(rx, 10)} ${n(ry, 10)} ${n((rot * 180) / Math.PI, 10)} 1 0 ${p(rx, 0)}A${n(rx, 10)} ${n(ry, 10)} ${n((rot * 180) / Math.PI, 10)} 1 0 ${p(-rx, 0)}Z`
}

function corkPattern(ink: Ink): string {
  const rng = ink.next('cork')
  const dots = new Map<string, string>()
  let chunk = ''
  let warm = ''
  const wrap = (cx: number, cy: number, r: number, draw: (x: number, y: number) => void): void => {
    const xs = cx < r ? [0, TILE] : cx > TILE - r ? [0, -TILE] : [0]
    const ys = cy < r ? [0, TILE] : cy > TILE - r ? [0, -TILE] : [0]
    for (const dx of xs) for (const dy of ys) draw(cx + dx, cy + dy)
  }
  const dot = (kind: string, x: number, y: number, width: number): void => {
    const key = `${kind}|${width}`
    wrap(x, y, width, (px, py) => dots.set(key, `${dots.get(key) ?? ''}M${n(px, 10)} ${n(py, 10)}l.01 0`))
  }
  for (let i = 0; i < 190; i++) dot(i % 3 ? 'ink' : 'soft', rng() * TILE, rng() * TILE, [1.1, 1.8, 2.6, 3.6][Math.floor(rng() * rng() * 4)])
  for (let i = 0; i < 90; i++) dot('light', rng() * TILE, rng() * TILE, [0.9, 1.5, 2.2][Math.floor(rng() * rng() * 3)])
  for (let i = 0; i < 9; i++) {
    const x = rng() * TILE, y = rng() * TILE
    const r = 3 + rng() * 5
    wrap(x, y, r + 2, (px, py) => {
      chunk += ell(px, py, r, r * (0.55 + rng() * 0.4), rng() * Math.PI)
    })
  }
  for (let i = 0; i < 4; i++) {
    const x = rng() * TILE, y = rng() * TILE
    const r = 9 + rng() * 9
    wrap(x, y, r + 2, (px, py) => {
      warm += ell(px, py, r, r * (0.7 + rng() * 0.3), rng() * Math.PI)
    })
  }
  const id = `ll-cork-${ink.seed.toString(36)}`
  const fillPath = (d: string, fill: PaintKey, op: number) => `<path d="${d}" fill="var(--ll-${fill})" fill-opacity="${n(op, 100)}"/>`
  const OPS: Record<string, [PaintKey, number]> = { ink: ['ink', 0.22], soft: ['ink-soft', 0.3], light: ['photo', 0.45] }
  let dotMarkup = ''
  for (const [key, d] of dots) {
    const [kind, width] = key.split('|')
    const [color, op] = OPS[kind]
    dotMarkup += `<path d="${d}" fill="none" stroke="var(--ll-${color})" stroke-opacity="${n(op, 100)}" stroke-width="${width}" stroke-linecap="round"/>`
  }
  ink.raw(`<defs><pattern id="${id}" width="${TILE}" height="${TILE}" patternUnits="userSpaceOnUse">${fillPath(warm, 'marker', 0.09)}${fillPath(chunk, 'ink', 0.08)}${dotMarkup}</pattern></defs>`, 'under')
  return id
}

export const corkBoardRecipe = defineRecipe<CorkBoardParams>({
  id: 'corkboard',
  kind: 'corkboard',
  layers: ['rest'],
  pad: 12,
  draw(ink, { w, h }, { frame = CORK_FRAME }, ctx) {
    const f = frame
    ink.layer('rest', () => {
      if (ctx.calm) {
        ink.raw(`<rect x="${f}" y="${f}" width="${n(w - 2 * f)}" height="${n(h - 2 * f)}" fill="var(--ll-kraft)"/>`, 'top')
        box(ink, 0, 0, w, h, { pen: 'pencil.fine', corner: 3 })
        return
      }
      for (const [x, y, sw, sh] of [[1, 1, w - 2, f], [1, h - f - 1, w - 2, f], [1, 1, f, h - 2], [w - f - 1, 1, f, h - 2]] as const) {
        bandFill(ink, roundRectPoly(x, y, sw, sh, 2), 'kraft', { alpha: 0.95, mis: 1.6, ends: 'square', passes: 2 })
      }
      const ring = (a: number) => `M${n(a)} ${n(a)}H${n(w - a)}V${n(h - a)}H${n(a)}ZM${n(f)} ${n(f)}V${n(h - f)}H${n(w - f)}V${n(f)}Z`
      ink.flat('wash', ring(3), 'marker', 0.4, { rule: 'evenodd', bbox: [0, 0, w, h] })
      box(ink, 0, 0, w, h, { pen: 'ink.fine', corner: 3 })
      const g = ink.next('grain')
      for (let i = 0; i < 4; i++) {
        const on = i % 2 === 0
        const off = 2.5 + g() * (f - 6)
        const a = g() * 0.35, b = 0.55 + g() * 0.4
        const pts: Array<[number, number]> = on ? [[w * a, off], [w * b, off + (g() - 0.5) * 1.4]] : [[w * a, h - off], [w * b, h - off + (g() - 0.5) * 1.4]]
        ink.lines([{ pts: [pts[0], [(pts[0][0] + pts[1][0]) / 2, pts[0][1] + (g() - 0.5) * 1.2], pts[1]], o: { start: 'soft', end: 'soft' } }], 'pencil.fine', { alpha: 0.5, simple: true })
      }
      const pid = corkPattern(ink)
      const field = rough(roundRectPoly(f, f, w - 2 * f, h - 2 * f, 2, 2), ink.next('edge'), 0.8, 28)
      const fieldPath = smoothClosed(field, TIERS[ink.tier])
      ink.raw(
        `<defs><path id="${pid}-f" d="${fieldPath}"/></defs><use href="#${pid}-f" fill="var(--ll-kraft)"/><use href="#${pid}-f" fill="var(--ll-marker)" fill-opacity=".13"/><use href="#${pid}-f" fill="url(#${pid})"/>`,
        'top',
      )
      ink.flat('top', `M${f} ${f}H${n(w - f)}V${n(f + 3)}H${n(f + 3)}V${n(h - f)}H${f}Z`, 'ink', 0.2)
      ink.flat('top', `M${n(w - f)} ${n(f + 3)}V${n(h - f)}H${n(f + 3)}V${n(h - f - 1.6)}H${n(w - f - 1.6)}V${n(f + 3)}Z`, 'photo', 0.22)
    })
  },
})

export interface CorkPinParams {
  color: PaintKey
}

export const corkPinRecipe = defineRecipe<CorkPinParams>({
  id: 'corkboard-pin',
  kind: 'corkboard-pin',
  layers: ['rest'],
  pad: 6,
  draw(ink, { w, h }, { color }) {
    const cx = w / 2, cy = h / 2 - 1
    const r = Math.min(w, h) * 0.33
    ink.layer('rest', () => {
      ink.flat('wash', ell(cx + 3.2, cy + 4.6, r * 0.95, r * 0.7, 0.5), 'ink', 0.26)
      blobFill(ink, roundRectPoly(cx - r, cy - r, 2 * r, 2 * r, r), color, { alpha: 0.95, mis: 0.8 })
      loop(ink, cx, cy, r + 0.6, r + 0.4, { pen: 'ink.fine', turns: 1.06 })
      ink.flat('top', ell(cx - r * 0.35, cy - r * 0.4, r * 0.32, r * 0.22, -0.7), 'photo', 0.85)
    })
  },
})

export const corkNoteRecipe = defineRecipe<Record<string, never>>({
  id: 'corkboard-note',
  kind: 'corkboard-note',
  layers: ['focus'],
  lazy: ['focus'],
  pad: 12,
  draw(_ink, { w, h }, _params, ctx) {
    ctx.lazy('focus', (f) => focusRing(f, -2, -2, w + 4, h + 4, { r: clamp(Math.min(w, h) * 0.05, 2, 5) }))
  },
})
