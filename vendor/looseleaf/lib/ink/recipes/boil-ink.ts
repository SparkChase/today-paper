import type { Knobs } from '@/lib/ink/builder'

const TABLE: readonly Knobs[] = [
  { wobble: 1, misreg: 1, bleed: 1, width: 1 },
  { wobble: 1.3, misreg: 1.7, bleed: 1.18, width: 0.96 },
  { wobble: 0.78, misreg: 0.5, bleed: 0.86, width: 1.05 },
  { wobble: 1.12, misreg: 1.3, bleed: 1.06, width: 0.98 },
]

export const BOIL_MAX_FRAMES = TABLE.length

export function boilKnobs(frame: number, strength = 1): Knobs {
  const k = TABLE[((frame % TABLE.length) + TABLE.length) % TABLE.length]
  const s = Math.max(0, strength)
  const at = (v: number) => Math.max(0.05, 1 + (v - 1) * s)
  return { wobble: at(k.wobble), misreg: at(k.misreg), bleed: at(k.bleed), width: at(k.width) }
}

export function boilSeed(seed: string | number, frame: number): string {
  return frame === 0 ? String(seed) : `${seed}~${frame}`
}
