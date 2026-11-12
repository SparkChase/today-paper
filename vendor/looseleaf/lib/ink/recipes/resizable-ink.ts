import { wash } from '@/lib/ink/fills'
import { roundRectPoly } from '@/lib/ink/geom'
import { defineRecipe } from '@/lib/ink/recipes'
import { box, focusRing, RULER } from '@/lib/ink/shapes'
import type { Line, Pt } from '@/lib/ink/types'

export interface ResizableParams {
  line: 'vertical' | 'horizontal'
  grip: boolean
  disabled?: boolean
}

const TAB_LONG = 32
const TAB_SHORT = 18

function stitches(len: number, across: number, vertical: boolean, gap: Pt | null): Line[] {
  const c = across / 2
  const at = (t: number): Pt => (vertical ? [c, t] : [t, c])
  const dash = 9, space = 5.2
  const count = Math.max(1, Math.round((len - 6 + space) / (dash + space)))
  const step = (len - 6 + space) / count
  const lines: Line[] = []
  for (let i = 0; i < count; i++) {
    const y = 3 + i * step, y1 = y + step - space
    if (!gap || y1 < gap[0] || y > gap[1]) lines.push({ pts: [at(y), at(y1)], o: { ...RULER, simple: true } })
  }
  return lines
}

export const resizableRecipe = defineRecipe<ResizableParams>({
  id: 'resizable',
  kind: 'seam',
  layers: ['rest', 'hover', 'pressed', 'focus', 'disabled'],
  lazy: ['focus'],
  pad: 12,
  draw(ink, { w, h }, { line, grip, disabled }, ctx) {
    const vertical = line === 'vertical'
    const len = vertical ? h : w
    const across = vertical ? w : h
    const mid = len / 2
    const tabLen = grip ? TAB_LONG : 0
    const gap: Pt | null = grip ? [mid - tabLen / 2 - 2, mid + tabLen / 2 + 2] : null
    const cx = w / 2, cy = h / 2
    const tabW = vertical ? TAB_SHORT : TAB_LONG
    const tabH = vertical ? TAB_LONG : TAB_SHORT

    if (disabled) {
      if (ctx.lazyOnly) return
      ink.layer('disabled', () => ink.lines(stitches(len, across, vertical, null), 'pencil.fine', { alpha: 0.4 }))
      return
    }

    const ringW = vertical ? Math.max(across, TAB_SHORT) : TAB_LONG + 4
    const ringH = vertical ? TAB_LONG + 4 : Math.max(across, TAB_SHORT)
    ctx.lazy('focus', (f) => focusRing(f, cx - ringW / 2, cy - ringH / 2, ringW, ringH, { r: 4 }))
    if (ctx.lazyOnly) return

    const geometry = stitches(len, across, vertical, gap)
    const tab = (): void => {
      const x = cx - tabW / 2, y = cy - tabH / 2
      ink.poly('under', roundRectPoly(x + 0.8, y + 0.8, tabW - 1.6, tabH - 1.6, 3), 'slip', 0.98)
      box(ink, x, y, tabW, tabH, { pen: ctx.calm ? 'pencil.fine' : 'ink.fine', corner: 3 })
    }

    ink.layer('rest', () => {
      ink.lines(geometry, ctx.calm ? 'pencil.fine' : 'pencil', { alpha: 1, width: ctx.calm ? 1.25 : 1.3 })
      if (grip) tab()
    })
    ink.layer('hover', () => {
      ink.lines(geometry, 'ink.fine', { alpha: 0.85, width: 1.3 })
      if (grip && !ctx.calm) wash(ink, roundRectPoly(cx - tabW / 2, cy - tabH / 2, tabW, tabH, 3), 'hi', { alpha: 0.6 })
    })
    ink.layer('pressed', () => {
      const a: Pt = vertical ? [cx, 1] : [1, cy]
      const b: Pt = vertical ? [cx, len - 1] : [len - 1, cy]
      ink.stroke([a, b], 'blue', { ...RULER, width: 1.15 })
    })
  },
})
