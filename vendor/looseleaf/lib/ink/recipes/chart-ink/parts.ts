import type { Ink } from '@/lib/ink/builder'
import type { PaintKey } from '@/lib/ink/paint'
import { hatch, solidFill } from '@/lib/ink/fills'
import { bboxOf, inside, scanSpans, roundRectPoly } from '@/lib/ink/geom'
import { clamp } from '@/lib/ink/rng'
import { line, loop } from '@/lib/ink/shapes'
import { slotKey, type Dash, type MarkerShape, type NotePen, type Pattern } from '@/lib/ink/charts/chart-types'
import type { PenName, Pt } from '@/lib/ink/types'

export const rectPts = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
]

export const NOTE_PEN: Record<NotePen, { std: PenName; fine: PenName }> = {
  red: { std: 'redfelt', fine: 'redfelt.fine' },
  blue: { std: 'blue', fine: 'blue.fine' },
  ink: { std: 'ink', fine: 'ink.fine' },
  green: { std: 'greenfelt', fine: 'greenfelt.fine' },
}

export const seriesColor = slotKey

export interface PatternOpts {
  color: PaintKey
  gapK?: number
  alpha?: number
  maxPulls?: number
}

function stippleIn(ink: Ink, poly: Pt[], gap: number, color: PaintKey, alpha: number, maxDots: number): void {
  const rng = ink.next('dots')
  const [x0, y0, x1, y1] = bboxOf(poly)
  const cols = Math.max(1, Math.floor((x1 - x0) / gap))
  const rows = Math.max(1, Math.floor((y1 - y0) / (gap * 0.87)))
  const stride = Math.max(1, Math.ceil((cols * rows) / maxDots))
  let d = ''
  let k = 0
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      if (k++ % stride) continue
      const x = x0 + (c + (r % 2 ? 0.5 : 0.1)) * gap + rng.gauss(0, gap * 0.12)
      const y = y0 + (r + 0.4) * gap * 0.87 + rng.gauss(0, gap * 0.1)
      if (!inside(poly, x, y)) continue
      const s = 0.85 + rng() * 0.6
      d += `M${x.toFixed(1)} ${y.toFixed(1)}l${s.toFixed(1)} ${(-0.2 * s).toFixed(1)} ${(0.1 * s).toFixed(1)} ${s.toFixed(1)} ${(-s).toFixed(1)} ${(0.1 * s).toFixed(1)}z`
    }
  }
  ink.flat('pencil', d, color, alpha)
}

function scribbleIn(ink: Ink, poly: Pt[], gap: number, color: PaintKey, alpha: number, maxPulls: number): void {
  const rng = ink.next('scrib')
  const b = bboxOf(poly)
  const g = Math.max(gap, (b[3] - b[1]) / Math.max(4, maxPulls))
  const spans = scanSpans(poly, -0.34, g, rng, { even: false, jitter: 0.12 })
  const pts: Pt[] = []
  spans.forEach((sp, i) => {
    const [a, c] = i % 2 ? [sp.b, sp.a] : [sp.a, sp.b]
    pts.push([a[0] + rng.gauss(0, 0.4), a[1] + rng.gauss(0, 0.4)], [c[0] + rng.gauss(0, 0.4), c[1] + rng.gauss(0, 0.4)])
  })
  if (pts.length > 3) ink.stroke(pts, 'pencil', { poly: true, round: 1.2, simple: true, alpha, width: 0.85, wobble: 0.5, color })
}

export function patternFill(ink: Ink, pattern: Pattern, poly: Pt[], o: PatternOpts): void {
  if (pattern === 'solid' || poly.length < 3) return
  const b = bboxOf(poly)
  const w = b[2] - b[0]
  const h = b[3] - b[1]
  if (w < 5 || h < 5) return
  const alpha = o.alpha ?? 0.62
  const maxPulls = o.maxPulls ?? 60
  const base = 5 * (o.gapK ?? 1)
  const gapDiag = Math.max(base, (w + h) / maxPulls)
  const gapRule = Math.max(base, h / maxPulls)
  const opts = { color: o.color }
  if (pattern === 'hatch') hatch(ink, poly, { pen: 'pencil', angle: 58, gap: gapDiag, alpha, width: 0.8, over: 0.5, under: 1.2, opts })
  else if (pattern === 'cross') hatch(ink, poly, { pen: 'pencil', angle: 52, gap: gapDiag * 1.25, tones: 2, cross: 76, alpha, width: 0.75, over: 0.5, under: 1.2, opts })
  else if (pattern === 'lines') hatch(ink, poly, { pen: 'pencil', angle: 4, gap: gapRule * 1.15, alpha, width: 0.8, over: 0.6, under: 1.2, opts })
  else if (pattern === 'dots') stippleIn(ink, poly, base * 1.3, o.color, alpha + 0.12, maxPulls * 3)
  else scribbleIn(ink, poly, base * 0.9, o.color, alpha, maxPulls)
}

export interface MarkerOpts {
  color: PaintKey
  rich: boolean
  pen?: PenName
  width?: number
}

export function drawMarker(ink: Ink, shape: MarkerShape, x: number, y: number, r: number, o: MarkerOpts): void {
  if (shape === 'none') return
  const rng = ink.next('mk')
  const j = () => rng.gauss(0, r * 0.05)
  const pen = o.pen ?? 'ink.fine'
  const opts = { color: o.color, simple: !o.rich, width: o.width ?? 1.15, wobble: 0.5, start: 'soft' as const, end: 'soft' as const }
  if (shape === 'circle') {
    if (o.rich) loop(ink, x, y, r, r * 0.96, { pen, opts: { color: o.color, width: o.width ?? 1.15, simple: true }, turns: 1.1 })
    else ink.dot(x, y, r * 0.62, 'ink', { color: o.color })
    return
  }
  const c: Pt = [x, y]
  const at = (a: number, k = 1): Pt => [c[0] + Math.cos(a) * r * k + j(), c[1] + Math.sin(a) * r * k + j()]
  if (shape === 'square') {
    const s = r * 0.92
    ink.stroke([[x - s, y - s + j()], [x + s + j(), y - s], [x + s, y + s + j()], [x - s + j(), y + s], [x - s, y - s + r * 0.35]], pen, { ...opts, poly: true })
  } else if (shape === 'triangle') {
    const p = [at(-Math.PI / 2, 1.1), at(Math.PI / 6, 1.1), at((5 * Math.PI) / 6, 1.1)]
    ink.stroke([p[0], p[1], p[2], p[0], [p[1][0] - r * 0.3, p[1][1] - r * 0.4]], pen, { ...opts, poly: true })
  } else if (shape === 'diamond') {
    const p = [at(-Math.PI / 2, 1.2), at(0, 1), at(Math.PI / 2, 1.2), at(Math.PI, 1)]
    ink.stroke([p[0], p[1], p[2], p[3], p[0], [p[1][0] - r * 0.2, p[1][1] - r * 0.3]], pen, { ...opts, poly: true })
  } else if (shape === 'cross') {
    const s = r * 0.85
    ink.stroke([[x - s, y - s], [x + s, y + s + j()]], pen, { ...opts, end: 'flick' })
    ink.stroke([[x + s, y - s], [x - s, y + s + j()]], pen, { ...opts, end: 'flick' })
  } else {
    const s = r * 1.05
    ink.stroke([[x - s, y + j()], [x + s, y + j()]], pen, { ...opts, end: 'flick' })
    ink.stroke([[x + j(), y - s], [x + j(), y + s]], pen, { ...opts, end: 'flick' })
  }
}

function cumulative(pts: Pt[]): number[] {
  const out = [0]
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  return out
}

function slicePath(pts: Pt[], cum: number[], a: number, b: number): Pt[] {
  const out: Pt[] = []
  const at = (d: number): Pt => {
    let i = 1
    while (i < cum.length - 1 && cum[i] < d) i++
    const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]
  }
  out.push(at(a))
  for (let i = 0; i < pts.length; i++) if (cum[i] > a && cum[i] < b) out.push(pts[i])
  out.push(at(b))
  return out
}

export function drawPolyline(ink: Ink, pts: Pt[], dash: Dash, pen: PenName, opts: { color: PaintKey; width?: number; simple?: boolean; poly?: boolean; alpha?: number }): void {
  if (pts.length < 2) return
  const base = { color: opts.color, width: opts.width ?? 1, simple: opts.simple, alpha: opts.alpha, poly: opts.poly ?? true, wobble: 0.22, dry: 0 }
  if (dash === 'solid') {
    ink.stroke(pts, pen, { ...base, start: 'soft', end: 'soft' })
    return
  }
  const cum = cumulative(pts)
  const total = cum[cum.length - 1]
  const on = dash === 'dotted' ? 0.1 : dash === 'dashed' ? 11 : 12
  const off = dash === 'dotted' ? 6.5 : dash === 'dashed' ? 6 : 5
  let d = 0
  let k = 0
  while (d < total && k < 400) {
    if (dash === 'dotted') {
      const p = slicePath(pts, cum, d, Math.min(total, d + 0.6))
      ink.dot(p[0][0], p[0][1], 1.5 * (opts.width ?? 1), 'ink', { color: opts.color })
      d += on + off
    } else {
      const len = dash === 'dashdot' && k % 2 ? 1.2 : on
      const seg = slicePath(pts, cum, d, Math.min(total, d + len))
      if (seg.length >= 2 && len > 2) ink.stroke(seg, pen, { ...base, simple: true, start: 'soft', end: 'soft' })
      else if (seg.length) ink.dot(seg[0][0], seg[0][1], 1.5 * (opts.width ?? 1), 'ink', { color: opts.color })
      d += len + off
      k++
    }
  }
}

export interface AxisFrame {
  x0: number
  y0: number
  x1: number
  y1: number
}

export function drawGrid(ink: Ink, positions: number[], frame: AxisFrame, vertical: boolean): void {
  for (const p of positions) {
    if (vertical) {
      if (Math.abs(p - frame.y1) < 1.5) continue
      line(ink, frame.x0 + 3, p, frame.x1, p, { pen: 'pencil.fine', opts: { alpha: 0.45, width: 0.8, simple: true, wobble: 0.12, dry: 0 } })
    } else {
      if (Math.abs(p - frame.x0) < 1.5) continue
      line(ink, p, frame.y0 - 2, p, frame.y1 - 2, { pen: 'pencil.fine', opts: { alpha: 0.45, width: 0.8, simple: true, wobble: 0.12, dry: 0 } })
    }
  }
}

export function drawAxisLines(ink: Ink, f: AxisFrame, o: { x: boolean; y: boolean; calm: boolean; zeroY?: number | null }): void {
  const penX: PenName = o.calm ? 'ink.fine' : 'ink.fine'
  if (o.x) line(ink, f.x0, f.y1, f.x1, f.y1, { pen: penX, opts: { simple: o.calm, width: o.calm ? 0.85 : 1.05, wobble: 0.15, dry: 0 } })
  if (o.y) line(ink, f.x0, f.y1, f.x0, f.y0 - 2, { pen: 'ink.fine', opts: { simple: o.calm, width: 0.9, wobble: 0.15, dry: 0, alpha: 0.8 } })
  if (o.zeroY != null && Math.abs(o.zeroY - f.y1) > 2) line(ink, f.x0, o.zeroY, f.x1, o.zeroY - (o.calm ? 0 : 0.6), { pen: 'ink.fine', opts: { simple: true, width: 0.95, alpha: 0.85 } })
}

export function swipeFill(ink: Ink, r: { x: number; y: number; w: number; h: number }, horizontal: boolean, calm: boolean): void {
  const along = horizontal ? r.w : r.h
  const inset = clamp(along * 0.02, 1, 4)
  const box = horizontal ? { x: r.x + inset, y: r.y, w: r.w - inset * 2, h: r.h } : { x: r.x, y: r.y + inset, w: r.w, h: r.h - inset * 2 }
  solidFill(ink, roundRectPoly(box.x, box.y, box.w, box.h, Math.min(5, Math.min(box.w, box.h) / 2)), 'hi', { alpha: calm ? 0.5 : 0.62, rough: 0.05 })
}
