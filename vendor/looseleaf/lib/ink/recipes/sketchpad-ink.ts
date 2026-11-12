import { Ink } from '@/lib/ink/builder'
import { blobFill, highlight } from '@/lib/ink/fills'
import { ellipsePoly, roundRectPoly, seg } from '@/lib/ink/geom'
import { esc, n, type PaintKey } from '@/lib/ink/paint'
import { pen as resolvePen } from '@/lib/ink/pens'
import { defineRecipe } from '@/lib/ink/recipes'
import { clamp } from '@/lib/ink/rng'
import { box, focusRing, loop } from '@/lib/ink/shapes'
import { svgMaskDefs } from '@/lib/ink/textures'
import type { GrainMaskKind } from '@/lib/ink/textures'
import type { PenName, Pt, StrokeOpts, Tier } from '@/lib/ink/types'

export const DRAW_TOOLS = ['felt', 'brush', 'pencil', 'marker', 'highlighter'] as const
export const SKETCH_TOOLS = [...DRAW_TOOLS, 'eraser'] as const
export type DrawTool = (typeof DRAW_TOOLS)[number]
export type SketchTool = (typeof SKETCH_TOOLS)[number]

export const SKETCH_COLORS = ['ink', 'ink-you', 'red', 'green', 'marker', 'tangerine', 'hi', 'teal', 'grape', 'bubblegum'] as const
export type SketchColor = (typeof SKETCH_COLORS)[number]

export const SKETCH_SIZES = { fine: 0.6, medium: 1, bold: 1.9 } as const
export type SketchSizeName = keyof typeof SKETCH_SIZES

export type SketchPoint = [number, number] | [number, number, number]

export interface SketchStroke {
  id: string
  tool: DrawTool
  color: SketchColor
  size: number
  pts: SketchPoint[]
}

const TOOL_PEN: Record<DrawTool, { pen: PenName; base: number }> = {
  felt: { pen: 'ink', base: 1.5 },
  brush: { pen: 'ink.brush', base: 1.05 },
  pencil: { pen: 'pencil', base: 1.5 },
  marker: { pen: 'terracotta', base: 0.85 },
  highlighter: { pen: 'hi', base: 1 },
}

const TOOL_GRAIN: Record<DrawTool, GrainMaskKind | null> = { felt: 'felt', brush: 'felt', pencil: 'graphite', marker: 'marker', highlighter: null }

export const DARK_INKS: ReadonlySet<SketchColor> = new Set<SketchColor>(['ink', 'ink-you', 'red', 'green'])

const toolPen = (tool: DrawTool, color: SketchColor): { pen: PenName; color?: PaintKey } => {
  const { pen } = TOOL_PEN[tool]
  if (tool === 'pencil') return color === 'ink' ? { pen } : { pen: 'orange', color }
  return { pen, color }
}

export const strokeWidth = (s: Pick<SketchStroke, 'tool' | 'size'>): number => resolvePen(TOOL_PEN[s.tool].pen).W * TOOL_PEN[s.tool].base * s.size

const MIN_STEP = 2.2

export function cleanPoints(src: readonly SketchPoint[]): { pts: Pt[]; pressure: number[] | null } {
  const P: Pt[] = []
  const R: number[] = []
  for (const p of src) {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue
    const last = P[P.length - 1]
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < MIN_STEP) continue
    P.push([p[0], p[1]])
    R.push(p[2] ?? -1)
  }
  const tail = src[src.length - 1]
  if (P.length > 1 && tail && Number.isFinite(tail[0]) && Number.isFinite(tail[1])) {
    const last = P[P.length - 1]
    if (Math.hypot(tail[0] - last[0], tail[1] - last[1]) > 0.4) {
      P.push([tail[0], tail[1]])
      R.push(tail[2] ?? -1)
    }
  }
  for (let pass = 0; pass < 2 && P.length > 3; pass++) {
    const prev = P.map((p): Pt => [p[0], p[1]])
    for (let i = 1; i < P.length - 1; i++) {
      P[i][0] = (prev[i - 1][0] + 2 * prev[i][0] + prev[i + 1][0]) / 4
      P[i][1] = (prev[i - 1][1] + 2 * prev[i][1] + prev[i + 1][1]) / 4
    }
  }
  const has = R.some((r) => r >= 0)
  return { pts: P, pressure: has ? R.map((r) => (r < 0 ? 0.5 : r)) : null }
}

function pressFn(pts: Pt[], pr: number[]): (t: number) => number {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const L = cum[cum.length - 1] || 1
  return (t) => {
    const s = clamp(t, 0, 1) * L
    let i = 1
    while (i < cum.length - 1 && cum[i] < s) i++
    const span = cum[i] - cum[i - 1] || 1
    const u = clamp((s - cum[i - 1]) / span, 0, 1)
    const p = pr[i - 1] + (pr[i] - pr[i - 1]) * u
    return 0.5 + clamp(p, 0.05, 1)
  }
}

export function strokeBounds(s: Pick<SketchStroke, 'pts' | 'tool' | 'size'>): [number, number, number, number] {
  const known = boundsOf.get(s)
  if (known && known.n === s.pts.length && known.size === s.size && known.tool === s.tool) return known.b
  const b = measureBounds(s)
  boundsOf.set(s, { n: s.pts.length, size: s.size, tool: s.tool, b })
  return b
}

const boundsOf = new WeakMap<object, { n: number; size: number; tool: DrawTool; b: [number, number, number, number] }>()

function measureBounds(s: Pick<SketchStroke, 'pts' | 'tool' | 'size'>): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of s.pts) {
    if (p[0] < x0) x0 = p[0]
    if (p[0] > x1) x1 = p[0]
    if (p[1] < y0) y0 = p[1]
    if (p[1] > y1) y1 = p[1]
  }
  if (x0 === Infinity) return [0, 0, 0, 0]
  const r = strokeWidth(s) / 2
  return [x0 - r, y0 - r, x1 + r, y1 + r]
}

const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax, dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

export function strokeHit(s: Pick<SketchStroke, 'pts' | 'tool' | 'size'>, x: number, y: number, r: number): boolean {
  const reach = r + strokeWidth(s) / 2
  const b = strokeBounds(s)
  if (x < b[0] - r || x > b[2] + r || y < b[1] - r || y > b[3] + r) return false
  const pts = s.pts
  if (pts.length === 1) return Math.hypot(x - pts[0][0], y - pts[0][1]) <= reach
  for (let i = 1; i < pts.length; i++) if (segDist(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= reach) return true
  return false
}

export interface StrokeMarkup {
  svg: string
  centre: string
  length: number
  bbox: [number, number, number, number]
}

const CACHE_MAX = 3000
const CACHE_CHARS = 24_000_000
const cache = new Map<string, StrokeMarkup>()
let cacheChars = 0

const weigh = (m: StrokeMarkup): number => m.svg.length + m.centre.length + 96

export const strokeCacheStats = (): { entries: number; chars: number; maxChars: number; maxEntries: number } => ({ entries: cache.size, chars: cacheChars, maxChars: CACHE_CHARS, maxEntries: CACHE_MAX })

const fingerprint = (s: SketchStroke): string => {
  let h = 0
  for (const p of s.pts) h = (Math.imul(h, 31) + Math.round(p[0] * 10) * 7 + Math.round(p[1] * 10) * 13 + Math.round((p[2] ?? 0) * 10)) | 0
  return `${s.id}|${s.tool}|${s.color}|${s.size}|${s.pts.length}|${h}`
}

export interface StrokeMarkupOptions {
  tier?: Tier
  live?: boolean
}

export function strokeMarkup(stroke: SketchStroke, o: StrokeMarkupOptions = {}): StrokeMarkup {
  const tier = o.tier ?? 'lo'
  const key = `${fingerprint(stroke)}|${tier}|${o.live ? 1 : 0}`
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const { pts, pressure } = cleanPoints(stroke.pts)
  const { pen, color } = toolPen(stroke.tool, stroke.color)
  const ink = new Ink(`sk|${stroke.id}|${stroke.tool}`, { tier })
  const opts: StrokeOpts = { color, width: TOOL_PEN[stroke.tool].base * stroke.size, wobble: stroke.tool === 'pencil' ? 0.2 : 0.12 }
  if (pressure && pts.length > 1) opts.press = pressFn(pts, pressure)
  if (stroke.tool === 'brush') opts.dry = 0.45
  if (o.live) {
    opts.simple = stroke.tool === 'felt' || stroke.tool === 'brush' || stroke.tool === 'pencil'
    opts.dry = 0
    opts.end = 'soft'
  }
  ink.stroke(pts, pen, opts)
  const res = ink.toSvg({ w: 1, h: 1, pad: 2 })
  const step = Math.max(1, Math.ceil(pts.length / 64))
  let centre = ''
  let length = 0
  for (let i = 0; i < pts.length; i += step) {
    const p = pts[i]
    if (i) length += Math.hypot(p[0] - pts[i - step][0], p[1] - pts[i - step][1])
    centre += `${i ? 'L' : 'M'}${n(p[0], 10)} ${n(p[1], 10)}`
  }
  if (pts.length > 1 && (pts.length - 1) % step) {
    const last = pts[pts.length - 1]
    length += Math.hypot(last[0] - pts[pts.length - 1 - ((pts.length - 1) % step)][0], last[1] - pts[pts.length - 1 - ((pts.length - 1) % step)][1])
    centre += `L${n(last[0], 10)} ${n(last[1], 10)}`
  }
  if (pts.length === 1) centre = `M${n(pts[0][0], 10)} ${n(pts[0][1], 10)}l.01 0`
  const out: StrokeMarkup = { svg: res.svg, centre, length, bbox: strokeBounds(stroke) }
  if (!o.live) {
    const w = weigh(out)
    if (w <= CACHE_CHARS) {
      while (cache.size && (cache.size >= CACHE_MAX || cacheChars + w > CACHE_CHARS)) {
        const oldest = cache.keys().next().value as string
        cacheChars -= weigh(cache.get(oldest) as StrokeMarkup)
        cache.delete(oldest)
      }
      cache.set(key, out)
      cacheChars += w
    }
  }
  return out
}

export const clearStrokeCache = (): void => {
  cache.clear()
  cacheChars = 0
}

export interface StrokesSvgOptions {
  width: number
  height: number
  tier?: Tier
  background?: string
  resolve?: (name: string) => string | undefined
  margin?: number
  title?: string
}

export function strokesToSvg(strokes: readonly SketchStroke[], o: StrokesSvgOptions): string {
  const tier = o.tier ?? 'lo'
  const grains = new Set<GrainMaskKind>()
  let body = ''
  for (const s of strokes) {
    const g = TOOL_GRAIN[s.tool]
    if (g) grains.add(g)
    body += `<g data-stroke="${esc(s.id)}">${strokeMarkup(s, { tier }).svg}</g>`
  }
  const m = o.margin ?? 0
  const W = o.width + 2 * m, H = o.height + 2 * m
  let doc =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(-m)} ${n(-m)} ${n(W)} ${n(H)}" width="${n(W)}" height="${n(H)}"${o.title ? ' role="img"' : ''}>` +
    (o.title ? `<title>${esc(o.title)}</title>` : '') +
    (grains.size ? `<defs>${svgMaskDefs({ kinds: [...grains] })}</defs>` : '') +
    (o.background ? `<rect x="${n(-m)}" y="${n(-m)}" width="${n(W)}" height="${n(H)}" fill="${esc(o.background)}"/>` : '') +
    `<g isolation="isolate">${body}</g></svg>`
  if (o.resolve) {
    const resolve = o.resolve
    doc = doc.replace(/var\((--ll-[a-z0-9-]+)\)/g, (whole, name: string) => resolve(name) || whole)
  }
  return doc
}

export const svgDataUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

export function cursorMarkup(seed: string): string {
  const ink = new Ink(`sk-cursor|${seed}`)
  ink.stroke([[-8, 0], [-2, 0]], 'focus', { wobble: 0, width: 0.8 })
  ink.stroke([[2, 0], [8, 0]], 'focus', { wobble: 0, width: 0.8 })
  ink.stroke([[0, -8], [0, -2]], 'focus', { wobble: 0, width: 0.8 })
  ink.stroke([[0, 2], [0, 8]], 'focus', { wobble: 0, width: 0.8 })
  return ink.toSvg({ w: 1, h: 1, pad: 2 }).svg
}

export interface SketchToolParams {
  tool: SketchTool
  color: SketchColor
}

export const sketchToolRecipe = defineRecipe<SketchToolParams>({
  id: 'sketchpad-tool',
  kind: 'sketchpad-tool',
  layers: ['rest', 'hover', 'checked', 'focus'],
  lazy: ['focus'],
  pad: 12,
  draw(ink, { w, h }, { tool, color }, ctx) {
    ctx.lazy('focus', (f) => focusRing(f, 0, 0, w, h, { r: 5 }))
    if (ctx.lazyOnly) return
    const cy = clamp(h * 0.34, 9, 20)
    const x0 = clamp(w * 0.16, 8, 16), x1 = w - x0
    ink.layer('rest', () => {
      if (tool === 'eraser') {
        const bw = clamp(w * 0.5, 22, 36), bh = 13
        const x = w / 2 - bw / 2, y = cy - bh / 2
        const body = roundRectPoly(x, y, bw, bh, 3)
        blobFill(ink, body, 'bubblegum', { alpha: 0.85, mis: 1.6 })
        blobFill(ink, roundRectPoly(x + bw * 0.62, y, bw * 0.38, bh, 3), 'paper-shade', { alpha: 0.9, mis: 1 })
        box(ink, x, y, bw, bh, { pen: 'ink.fine', corner: 3 })
        ink.dot(x - 6, cy + 5, 1.1, 'pencil')
        ink.dot(x - 9.5, cy + 2, 0.8, 'pencil')
        return
      }
      const pts: Pt[] = []
      const amp = tool === 'highlighter' || tool === 'marker' ? 1.6 : 3.2
      for (let i = 0; i <= 12; i++) pts.push([x0 + ((x1 - x0) * i) / 12, cy + Math.sin((i / 12) * Math.PI * 2 + 0.4) * amp - (i / 12) * 1.5])
      const tp = toolPen(tool, tool === 'highlighter' && DARK_INKS.has(color) ? 'hi' : color)
      ink.stroke(pts, tp.pen, { color: tp.color, width: TOOL_PEN[tool].base * (tool === 'brush' ? 1.1 : 1), wobble: 0.5, start: 'pool', end: tool === 'highlighter' || tool === 'marker' ? 'soft' : 'flick' })
    })
    ink.layer('hover', () => {
      ink.lines([{ pts: seg(4, h - 1.5, w - 5, h - 1, 0.4, 5), o: { start: 'soft', end: 'flick' } }], 'pencil.fine', { alpha: 0.7 })
    })
    ink.layer('checked', () => {
      highlight(ink, 5, h - 21, w - 10, 17, { pen: 'hi' })
      box(ink, 1, 1, w - 2, h - 2, { pen: 'ink.fine', corner: 5 })
    })
  },
})

export interface SketchSwatchParams {
  color: SketchColor
}

export const sketchSwatchRecipe = defineRecipe<SketchSwatchParams>({
  id: 'sketchpad-swatch',
  kind: 'sketchpad-swatch',
  layers: ['rest', 'hover', 'checked', 'focus'],
  lazy: ['focus'],
  pad: 12,
  draw(ink, { w, h }, { color }, ctx) {
    const cx = w / 2, cy = h / 2
    const r = Math.min(w, h) * 0.3
    ctx.lazy('focus', (f) => focusRing(f, 0, 0, w, h, { shape: 'ellipse' }))
    if (ctx.lazyOnly) return
    ink.layer('rest', () => {
      ink.part('fill', () => blobFill(ink, ellipsePoly(cx, cy, r, r * 0.94, 20), color, { alpha: color === 'hi' ? 0.95 : 0.9, mis: 1.4 }))
      loop(ink, cx, cy, r + 1.4, r + 0.8, { pen: 'ink.fine', turns: 1.06 })
    })
    ink.layer('hover', () => {
      ink.lines([{ pts: seg(cx - r, cy + r + 2.5, cx + r + 1, cy + r + 2.2, 0.3, 4), o: { start: 'soft', end: 'flick' } }], 'ink.fine', { alpha: 0.7 })
    })
    ink.layer('checked', () => {
      loop(ink, cx, cy, r + 5.4, r + 5.6, { pen: 'ink', turns: 1.12 })
    })
  },
})

export interface SketchSizeParams {
  size: SketchSizeName
}

const DOT_R: Record<SketchSizeName, number> = { fine: 2.2, medium: 4.4, bold: 7.4 }

export const sketchSizeRecipe = defineRecipe<SketchSizeParams>({
  id: 'sketchpad-size',
  kind: 'sketchpad-size',
  layers: ['rest', 'hover', 'checked', 'focus'],
  lazy: ['focus'],
  pad: 12,
  draw(ink, { w, h }, { size }, ctx) {
    const cx = w / 2, cy = h / 2
    ctx.lazy('focus', (f) => focusRing(f, 0, 0, w, h, { shape: 'ellipse' }))
    if (ctx.lazyOnly) return
    ink.layer('rest', () => {
      ink.dot(cx, cy, DOT_R[size], 'ink', { width: 1 })
    })
    ink.layer('hover', () => {
      ink.lines([{ pts: seg(cx - 6, cy + 11, cx + 7, cy + 10.6, 0.3, 3), o: { start: 'soft', end: 'flick' } }], 'ink.fine', { alpha: 0.7 })
    })
    ink.layer('checked', () => {
      loop(ink, cx, cy, Math.min(w, h) * 0.44, Math.min(w, h) * 0.44, { pen: 'ink.fine', turns: 1.1 })
    })
  },
})

export const canvasFrameRecipe = defineRecipe<Record<string, never>>({
  id: 'sketchpad-canvas',
  kind: 'sketchpad-canvas',
  layers: ['rest', 'focus'],
  lazy: ['focus'],
  pad: 12,
  draw(ink, { w, h }, _params, ctx) {
    ctx.lazy('focus', (f) => focusRing(f, -3, -3, w + 6, h + 6, { r: 4 }))
    if (ctx.lazyOnly) return
    ink.layer('rest', () => {
      if (ctx.calm) return
      box(ink, -2, -2, w + 4, h + 4, { pen: 'pencil.fine', opts: { alpha: 0.5 } })
    })
  },
})
