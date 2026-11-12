import { blobFill } from '@/lib/ink/fills'
import { roundRectPoly, seg } from '@/lib/ink/geom'
import { defineRecipe } from '@/lib/ink/recipes'
import { makeRng } from '@/lib/ink/rng'

export interface TypeStep {
  at: number
  text: string
}

export interface TypingOptions {
  speed: number
  pause: number
  mode: 'lines' | 'cycle'
  loop?: boolean
  seed: string
}

const segmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null

function keys(s: string): string[] {
  return segmenter ? Array.from(segmenter.segment(s), (x) => x.segment) : Array.from(s)
}

function hold(ch: string): number {
  if (ch === '\n') return 4
  if (ch === '.' || ch === '!' || ch === '?') return 5
  if (ch === ',' || ch === ';' || ch === ':') return 2.6
  if (ch === ' ') return 1.15
  return 1
}

export function typingPlan(phrases: readonly string[], o: TypingOptions): { steps: TypeStep[]; total: number } {
  const rng = makeRng(`typing|${o.seed}`)
  const base = 1000 / Math.max(1, o.speed)
  const steps: TypeStep[] = [{ at: 0, text: '' }]
  let t = 0
  let page = ''
  const typed: string[] = []
  const type = (s: string) => {
    for (const ch of keys(s)) {
      t += base * hold(typed[typed.length - 1] ?? '') * (0.62 + 0.76 * rng())
      page += ch
      typed.push(ch)
      steps.push({ at: Math.round(t), text: page })
    }
  }
  const backspace = () => {
    t += (base / 3) * (0.7 + 0.6 * rng())
    page = page.slice(0, page.length - (typed.pop() as string).length)
    steps.push({ at: Math.round(t), text: page })
  }
  if (o.mode === 'cycle') {
    phrases.forEach((p, i) => {
      type(p)
      if (i < phrases.length - 1) {
        t += o.pause
        while (typed.length) backspace()
        t += base * 3
      }
    })
  } else {
    phrases.forEach((p, i) => {
      if (i) {
        t += o.pause * 0.4
        page += '\n'
        typed.push('\n')
        steps.push({ at: Math.round(t), text: page })
      }
      type(p)
    })
  }
  if (o.loop) {
    t += o.pause
    if (o.mode === 'cycle') {
      while (typed.length) backspace()
    } else {
      page = ''
      typed.length = 0
      steps.push({ at: Math.round(t), text: '' })
    }
    t += base * 4
    steps.push({ at: Math.round(t), text: '' })
  }
  return { steps, total: Math.round(t) }
}

export type CaretShape = 'block' | 'bar' | 'underscore'

export interface CaretParams {
  shape: CaretShape
}

export const typewriterCaretRecipe = defineRecipe<CaretParams>({
  id: 'typewriter-caret',
  kind: 'typewriter-caret',
  layers: ['rest'],
  pad: 3,
  draw(ink, { w, h }, { shape }) {
    ink.layer('rest', () => {
      if (shape === 'block') {
        blobFill(ink, roundRectPoly(0.5, 0.5, w - 1, h - 1, 1), 'ink', { alpha: 0.9, mis: 0.5, material: 'wash' })
      } else if (shape === 'bar') {
        ink.lines([{ pts: seg(w / 2, 0.5, w / 2 + 0.4, h - 0.5, 0.4, 5), o: { start: 'pool', end: 'soft' } }], 'ink', { width: 1.25 })
      } else {
        ink.lines([{ pts: seg(0.5, h - 1.6, w - 0.5, h - 1.9, 0.3, 4), o: { start: 'soft', end: 'flick' } }], 'ink', { width: 1.35 })
      }
    })
  },
})
