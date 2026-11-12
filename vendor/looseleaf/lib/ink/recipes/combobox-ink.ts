import { blobFill } from '@/lib/ink/fills'
import { ellipsePoly } from '@/lib/ink/geom'
import { defineRecipe } from '@/lib/ink/recipes'
import { drawFieldFrame } from '@/lib/ink/recipes/field-frame-ink'
import { drawSelectFrame } from '@/lib/ink/recipes/select-frame-ink'
import { clamp } from '@/lib/ink/rng'
import type { PaintKey } from '@/lib/ink/paint'
import type { Pt } from '@/lib/ink/types'

export interface ComboboxTriggerParams {
  disabled?: boolean
  invalid?: boolean
  cell?: number
}

export const comboboxTriggerRecipe = defineRecipe<ComboboxTriggerParams>({
  id: 'combobox-trigger',
  kind: 'field',
  layers: ['rest', 'hover', 'focus', 'open', 'invalid', 'disabled'],
  lazy: ['focus', 'hover'],
  pad: 12,
  draw(ink, box, params, ctx) {
    drawSelectFrame(ink, box, { ...params, openable: true }, ctx)
  },
})

export interface ComboboxChipsParams {
  disabled?: boolean
  invalid?: boolean
}

export const comboboxChipsRecipe = defineRecipe<ComboboxChipsParams>({
  id: 'combobox-chips',
  kind: 'field',
  layers: ['rest', 'hover', 'focus', 'invalid', 'disabled'],
  lazy: ['focus', 'hover'],
  pad: 12,
  draw(ink, box, params, ctx) {
    drawFieldFrame(ink, box, { ...params, multiline: box.h > 48 }, ctx)
  },
})

export const chipToneList = ['hi', 'sky', 'grass', 'bubblegum'] as const
export type ChipTone = (typeof chipToneList)[number]

export interface ComboboxChipParams {
  tone: ChipTone
  disabled?: boolean
}

const TONE: Record<ChipTone, { paint: PaintKey; alpha: number }> = {
  hi: { paint: 'hi', alpha: 0.7 },
  sky: { paint: 'sky', alpha: 0.42 },
  grass: { paint: 'grass', alpha: 0.42 },
  bubblegum: { paint: 'bubblegum', alpha: 0.5 },
}

export const chipTip = (h: number): number => clamp(h * 0.42, 8, 13)

export const comboboxChipRecipe = defineRecipe<ComboboxChipParams>({
  id: 'combobox-chip',
  kind: 'chip',
  layers: ['rest', 'disabled'],
  pad: 8,
  draw(ink, { w, h }, { tone, disabled }, ctx) {
    const rtl = ctx.dir === 'rtl'
    const X = (x: number): number => (rtl ? w - x : x)
    const rng = ink.next('chip')
    const tip = chipTip(h)
    const j = (): number => rng.gauss(0, 0.28)
    const y0 = 1.6 + j(), y1 = h - 1.6 + j()
    const outline: Pt[] = [
      [X(1.6 + j()), h / 2 + j()],
      [X(tip + j()), y0],
      [X(w - 2 + j()), y0 + j()],
      [X(w - 1.6 + j()), y1 + j()],
      [X(tip + j()), y1],
    ]
    const hole: Pt = [X(tip * 0.72 + 3.2), h / 2 + 0.3]
    const t = TONE[tone]
    ink.layer(disabled ? 'disabled' : 'rest', () => {
      ink.part('fill', () => blobFill(ink, outline.map(([x, y]) => [x + (rtl ? -0.4 : 0.4), y + 0.5] as Pt), disabled ? 'pencil-mark' : t.paint, { alpha: disabled ? 0.3 : t.alpha, rough: 0.5 }))
      const closed: Pt[] = [...outline, outline[0], [outline[1][0] + (outline[1][0] > outline[0][0] ? 2.2 : -2.2), outline[1][1] + 0.6]]
      if (ctx.calm || disabled) ink.stroke(closed, disabled ? 'pencil.fine' : 'pencil.fine', { poly: true, round: 2.4, simple: true, alpha: 0.9 })
      else ink.stroke(closed, 'ink.fine', { poly: true, round: 2.4, simple: true })
      ink.stroke(ellipsePoly(hole[0], hole[1], 1.9, 1.9, 12), disabled ? 'pencil.fine' : 'ink.fine', { poly: true, round: 0, simple: true, alpha: 0.85 })
      ink.poly('top', ellipsePoly(hole[0], hole[1], 1.3, 1.3, 10), 'slip', 1)
    })
  },
})
