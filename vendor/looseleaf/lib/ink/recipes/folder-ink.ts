import { defineRecipe } from '@/lib/ink/recipes'
import { litEdge, num, paperFill, pathTag, polyD, tok } from '@/lib/ink/recipes/paper-set-ink'
import type { StockName } from '@/lib/ink/paper/stocks'
import type { Rng } from '@/lib/ink/rng'
import type { Pt } from '@/lib/ink/types'

export interface FolderTabParams {
  stock: StockName
  disabled: boolean
}

export const FOLDER_TAB = { overlap: 4, lower: 4, slant: 9, corner: 6 } as const

export function tabPoints(w: number, h: number, top: number, r: Rng, bottom = 0): Pt[] {
  const s = FOLDER_TAB.slant
  const c = FOLDER_TAB.corner
  const j = () => r.gauss(0, 0.2)
  const pts: Pt[] = [[j(), h + bottom], [j(), h]]
  pts.push([s * 0.55 + j(), top + (h - top) * 0.5], [s - 1 + j(), top + c * 0.85])
  pts.push([s + 1.5, top + 1.2], [s + c, top + j()])
  pts.push([w / 2 + j(), top + j()])
  pts.push([w - s - c, top + j()], [w - s - 1.5, top + 1.2])
  pts.push([w - s + 1 + j(), top + c * 0.85], [w - s * 0.55 + j(), top + (h - top) * 0.5], [w + j(), h], [w + j(), h + bottom])
  return pts
}

export const folderTabRecipe = defineRecipe<FolderTabParams>({
  id: 'folder-tab',
  kind: 'folder-tab',
  layers: ['rest', 'checked', 'disabled', 'hover'],
  pad: 6,
  draw(ink, { w, h }, { stock, disabled }, ctx) {
    const r = ink.next('tab')
    const seed = ink.seed
    if (disabled) {
      ink.layer('disabled', () => {
        const d = polyD(tabPoints(w, h, FOLDER_TAB.lower, r)) 
        ink.raw(pathTag(d, { stroke: tok('pencil'), sw: 1, op: 0.7, extra: 'stroke-dasharray="3.4 3"' }), 'under')
      })
      return
    }
    ink.layer('rest', () => {
      const top = FOLDER_TAB.lower
      const pts = tabPoints(w, h, top, r.fork('b'))
      const d = polyD(pts, true)
      let s = paperFill(seed, d, { stock, id: 'b' })
      s += pathTag(d, { fill: tok('ink'), op: 0.12 })
      s += pathTag(`M${num(w / 2)} ${num(top)}H${num(w)}V${num(h)}H${num(w / 2)}z`, { fill: tok('ink'), op: 0.05 })
      s += pathTag(polyD(pts.slice(1, -1)), { stroke: tok('ink'), sw: 0.7, op: 0.34 })
      s += litEdge(polyD(pts.slice(3, 8)), 0.5)
      ink.raw(s, 'under')
      ink.grow([-1, top - 1, w + 1, h + 1])
    })
    ink.layer('checked', () => {
      const pts = tabPoints(w, h, 0, r.fork('f'), FOLDER_TAB.overlap)
      const d = polyD(pts, true)
      let s = paperFill(seed, d, { stock, id: 'f' })
      s += pathTag(polyD(pts.slice(1, -1)), { stroke: tok('ink'), sw: 0.75, op: 0.32 })
      s += litEdge(polyD(pts.slice(3, 8)), 0.75)
      ink.raw(s, 'under')
      ink.grow([-1, -1, w + 1, h + FOLDER_TAB.overlap + 1])
    })
    if (!ctx.calm) {
      ink.layer('hover', () => {
        const pts = tabPoints(w, h, FOLDER_TAB.lower, r.fork('h'))
        ink.raw(pathTag(polyD(pts, true), { fill: tok('photo'), op: 0.3 }), 'top')
      })
    }
  },
})

export interface FolderBodyParams {
  crease: boolean
}

export const folderBodyRecipe = defineRecipe<FolderBodyParams>({
  id: 'folder-body',
  kind: 'folder',
  layers: ['rest'],
  pad: 2,
  draw(ink, { w, h }, { crease }) {
    const r = ink.next('fold')
    ink.layer('rest', () => {
      if (!crease) return
      const y = 11 + r.gauss(0, 0.5)
      const d = `M${num(6)} ${num(y)}L${num(w / 2)} ${num(y + r.gauss(0, 0.5))}L${num(w - 6)} ${num(y + r.gauss(0, 0.4))}`
      ink.raw(pathTag(d, { stroke: tok('ink'), sw: 0.8, op: 0.16 }) + pathTag(d, { stroke: tok('photo'), sw: 1, op: 0.7, transform: 'translate(0 1.3)' }) + pathTag(`M0 ${num(y)}H${num(w)}V0H0z`, { fill: tok('ink'), op: 0.03 }), 'top')
      ink.grow([0, 0, w, h])
    })
  },
})
