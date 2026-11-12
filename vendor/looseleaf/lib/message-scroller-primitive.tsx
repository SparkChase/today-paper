"use client"

import * as React from "react"

export type MessageScrollerDefaultScrollPosition = "start" | "end" | "last-anchor"
export type MessageScrollerButtonDirection = "start" | "end"
export type MessageScrollerScrollAlign = "start" | "center" | "end" | "nearest"
export type MessageScrollerScrollOptions = { align?: MessageScrollerScrollAlign; behavior?: ScrollBehavior; scrollMargin?: number }
export type MessageScrollerScrollable = { start: boolean; end: boolean }
export type MessageScrollerVisibilityState = { currentAnchorId: string | null; visibleMessageIds: string[] }

type Mode = "following-bottom" | "free-scrolling" | "anchored-to-message" | "settling-jump"

type Options = {
  autoScroll: boolean
  defaultScrollPosition: MessageScrollerDefaultScrollPosition
  scrollEdgeThreshold: number
  scrollPreviousItemPeek: number
  scrollMargin: number
  preserveScrollOnPrepend: boolean
}

const AUTOSCROLL_MS = 180
const EPS = 0.5
const SCROLL_KEYS = new Map<string, "start" | "end">([["ArrowUp", "start"], ["PageUp", "start"], ["Home", "start"], ["ArrowDown", "end"], ["PageDown", "end"], ["End", "end"], [" ", "end"]])
const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

function createStore<T>(initial: T, equal: (a: T, b: T) => boolean) {
  let value = initial
  const subs = new Set<() => void>()
  return {
    get: () => value,
    set(next: T) {
      if (equal(value, next)) return
      value = next
      subs.forEach((f) => f())
    },
    subscribe(f: () => void) {
      subs.add(f)
      return () => void subs.delete(f)
    },
    hasSubscribers: () => subs.size > 0,
  }
}

const NO_VISIBILITY: MessageScrollerVisibilityState = { currentAnchorId: null, visibleMessageIds: [] }
const sameScrollable = (a: MessageScrollerScrollable, b: MessageScrollerScrollable) => a.start === b.start && a.end === b.end
const sameVisibility = (a: MessageScrollerVisibilityState, b: MessageScrollerVisibilityState) =>
  a.currentAnchorId === b.currentAnchorId && a.visibleMessageIds.length === b.visibleMessageIds.length && a.visibleMessageIds.every((id, i) => id === b.visibleMessageIds[i])

const px = (v: string | undefined) => {
  const n = Number.parseFloat(v ?? "")
  return Number.isFinite(n) ? n : 0
}

class Controller {
  opts: Options
  root: HTMLElement | null = null
  viewport: HTMLElement | null = null
  content: HTMLElement | null = null
  spacer: HTMLElement | null = null
  items = new Map<string, HTMLElement>()
  mode: Mode
  scrollable = createStore<MessageScrollerScrollable>({ start: false, end: false }, sameScrollable)
  visibility = createStore<MessageScrollerVisibilityState>(NO_VISIBILITY, sameVisibility)
  private itemCount = 0
  private firstItem: HTMLElement | null = null
  private appliedDefault = false
  private lastTop = 0
  private lastSet = Number.NaN
  private pointerHeld = false
  private anchored: HTMLElement | null = null
  private handled = new WeakSet<HTMLElement>()
  private prepend: { el: HTMLElement; top: number } | null = null
  private pendingMessage: { id: string; options: MessageScrollerScrollOptions } | null = null
  private autoscrolling = false
  private autoscrollTimer: number | undefined
  private frame: number | undefined
  private visFrame: number | undefined
  private spacerHeight = 0

  constructor(opts: Options) {
    this.opts = opts
    this.mode = opts.autoScroll ? "following-bottom" : "free-scrolling"
  }

  private childItems(): HTMLElement[] {
    const c = this.content
    return c ? (Array.from(c.children).filter((n) => n instanceof HTMLElement && n !== this.spacer) as HTMLElement[]) : []
  }
  private top(el: Element): number {
    return el.getBoundingClientRect().top - (this.viewport?.getBoundingClientRect().top ?? 0)
  }
  private offset(el: Element): number {
    return this.top(el) + (this.viewport?.scrollTop ?? 0)
  }
  private contentEnd(): number {
    const c = this.content
    if (!c || !this.viewport) return 0
    const items = this.childItems()
    const last = items[items.length - 1]
    const end = last ? this.offset(last) + last.getBoundingClientRect().height : 0
    const pad = typeof getComputedStyle === "function" ? px((getComputedStyle(c).paddingBlockEnd || getComputedStyle(c).paddingBottom) as string) : 0
    return end + pad
  }
  private firstBelow(items: HTMLElement[], y: number): number {
    const bottomAt = (i: number): number => {
      for (let j = i; j < items.length; j++) {
        const r = items[j].getBoundingClientRect()
        if (r.width > 0 || r.height > 0) return r.bottom
      }
      return Number.POSITIVE_INFINITY
    }
    let lo = 0
    let hi = items.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (bottomAt(mid) > y) hi = mid
      else lo = mid + 1
    }
    while (lo < items.length) {
      const r = items[lo].getBoundingClientRect()
      if (r.width > 0 || r.height > 0) break
      lo++
    }
    return lo
  }
  private computeScrollable(): MessageScrollerScrollable {
    const v = this.viewport
    if (!v) return { start: false, end: false }
    const t = this.opts.scrollEdgeThreshold
    return { start: v.scrollTop > t, end: this.contentEnd() - v.scrollTop - v.clientHeight > t }
  }

  commit = (): void => {
    const s = this.computeScrollable()
    const shown = this.mode === "following-bottom" ? { ...s, end: false } : s
    for (const el of [this.root, this.viewport]) {
      if (!el) continue
      const tokens = [shown.start && "start", shown.end && "end"].filter(Boolean).join(" ")
      if (tokens) el.setAttribute("data-scrollable", tokens)
      else el.removeAttribute("data-scrollable")
      el.toggleAttribute("data-autoscrolling", this.autoscrolling)
    }
    this.scrollable.set(shown)
  }
  scheduleCommit = (): void => {
    if (this.frame !== undefined) return
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined
      this.commit()
    })
  }
  scheduleVisibility = (): void => {
    if (!this.visibility.hasSubscribers() || this.visFrame !== undefined) return
    this.visFrame = requestAnimationFrame(() => {
      this.visFrame = undefined
      this.visibility.set(this.computeVisibility())
    })
  }
  private computeVisibility(): MessageScrollerVisibilityState {
    const v = this.viewport
    if (!v) return NO_VISIBILITY
    const vr = v.getBoundingClientRect()
    const line = vr.top + this.opts.scrollMargin + this.opts.scrollPreviousItemPeek
    const items = this.childItems()
    const visible: string[] = []
    let current: string | null = null
    const first = this.firstBelow(items, line)
    for (let i = first; i < items.length; i++) {
      const el = items[i]
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      if (r.top >= vr.bottom) break
      const id = el.dataset.messageId
      if (!id) continue
      visible.push(id)
      if (el.dataset.scrollAnchor === "true" && r.top <= line + EPS) current = id
    }
    for (let i = Math.min(first, items.length) - 1; i >= 0 && current === null; i--) {
      const el = items[i]
      if (el.dataset.messageId && el.dataset.scrollAnchor === "true") current = el.dataset.messageId
    }
    return visible.length === 0 && current === null ? NO_VISIBILITY : { currentAnchorId: current, visibleMessageIds: visible }
  }

  private flagAutoscrolling(on: boolean): void {
    window.clearTimeout(this.autoscrollTimer)
    this.autoscrollTimer = undefined
    if (this.autoscrolling !== on) {
      this.autoscrolling = on
      this.commit()
    }
    if (on) {
      this.autoscrollTimer = window.setTimeout(() => {
        this.autoscrollTimer = undefined
        this.autoscrolling = false
        this.commit()
      }, AUTOSCROLL_MS)
    }
  }

  private setSpacer(height: number): void {
    const s = this.spacer
    if (!s) return
    const h = Math.max(0, Math.ceil(height))
    if (h === this.spacerHeight) return
    this.spacerHeight = h
    s.hidden = h === 0
    s.style.height = `${h}px`
    const gap = this.content ? px(getComputedStyle(this.content).rowGap === "normal" ? getComputedStyle(this.content).gap : getComputedStyle(this.content).rowGap) : 0
    s.style.marginTop = h > 0 ? `${-gap}px` : ""
  }

  private reducedMotion(): boolean {
    if (typeof window === "undefined") return false
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || !!this.viewport?.closest('[data-motion="reduced"]')
  }

  private scrollTo(top: number, behavior: ScrollBehavior = "auto", autoscrolling = false): void {
    const v = this.viewport
    if (!v) return
    const t = Math.max(0, top)
    if (Math.abs(v.scrollTop - t) <= EPS) {
      v.scrollTop = t
      this.commit()
      return
    }
    if (autoscrolling) this.flagAutoscrolling(true)
    this.lastSet = t
    if (behavior === "smooth" && typeof v.scrollTo === "function" && !this.reducedMotion()) v.scrollTo({ top: t, behavior })
    else v.scrollTop = t
    this.scheduleCommit()
  }

  scrollToEnd = ({ behavior = "auto" }: { behavior?: ScrollBehavior } = {}): boolean => {
    const v = this.viewport
    if (!v) return false
    this.setSpacer(0)
    this.anchored = null
    this.mode = this.opts.autoScroll ? "following-bottom" : "free-scrolling"
    this.scrollTo(this.contentEnd() - v.clientHeight, behavior, true)
    this.scheduleVisibility()
    return true
  }
  scrollToStart = ({ behavior = "auto" }: { behavior?: ScrollBehavior } = {}): boolean => {
    if (!this.viewport) return false
    this.setSpacer(0)
    this.anchored = null
    this.mode = "free-scrolling"
    this.scrollTo(0, behavior)
    this.scheduleVisibility()
    return true
  }
  private targetFor(el: HTMLElement, align: MessageScrollerScrollAlign, margin: number): number {
    const v = this.viewport as HTMLElement
    const off = this.offset(el)
    const h = el.getBoundingClientRect().height
    if (align === "center") return off - (v.clientHeight - h) / 2 - margin
    if (align === "end") return off + h - v.clientHeight + margin
    if (align === "nearest") {
      const from = v.scrollTop
      const to = from + v.clientHeight
      return off >= from && off + h <= to ? from : off < from ? off - margin : off + h - v.clientHeight + margin
    }
    return off - margin
  }
  scrollToElement = (el: HTMLElement, { align = "start", behavior = "auto", scrollMargin = this.opts.scrollMargin }: MessageScrollerScrollOptions = {}, { keepPreviousPeek = false } = {}): boolean => {
    const v = this.viewport
    if (!v || !this.content?.contains(el)) return false
    const target = Math.max(0, this.targetFor(el, align, scrollMargin + (keepPreviousPeek ? this.opts.scrollPreviousItemPeek : 0)))
    this.setSpacer(target + v.clientHeight - this.contentEnd())
    this.mode = keepPreviousPeek ? "anchored-to-message" : "free-scrolling"
    this.anchored = keepPreviousPeek ? el : null
    this.scrollTo(target, behavior)
    this.snapshot()
    this.scheduleVisibility()
    return true
  }
  scrollToMessage = (id: string, options: MessageScrollerScrollOptions = {}): boolean => {
    const el = this.items.get(id)
    if (el) {
      this.appliedDefault = true
      this.pendingMessage = null
      return this.scrollToElement(el, options)
    }
    if (this.itemCount === 0) {
      this.pendingMessage = { id, options }
      this.appliedDefault = true
      return true
    }
    return false
  }
  flushPendingMessage = (): void => {
    const p = this.pendingMessage
    const el = p ? this.items.get(p.id) : undefined
    if (p && el && this.scrollToElement(el, p.options)) this.pendingMessage = null
  }

  private applyDefault(): boolean {
    if (this.appliedDefault || this.itemCount === 0) return false
    const pos = this.opts.defaultScrollPosition
    let done = false
    if (pos === "last-anchor") {
      const anchors = this.childItems().filter((n) => n.dataset.scrollAnchor === "true")
      const last = anchors[anchors.length - 1]
      const v = this.viewport
      if (!last || !v) done = this.scrollToEnd()
      else if (this.contentEnd() - this.offset(last) <= v.clientHeight) done = this.scrollToEnd()
      else done = this.scrollToElement(last, { align: "start" }, { keepPreviousPeek: true })
    } else done = pos === "end" ? this.scrollToEnd() : this.scrollToStart()
    if (done) this.appliedDefault = true
    return done
  }
  snapshot = (): void => {
    const v = this.viewport
    if (!v) return
    const vr = v.getBoundingClientRect()
    const items = this.childItems()
    const el = items[this.firstBelow(items, vr.top)]
    const r = el?.getBoundingClientRect()
    this.prepend = el && r && r.top < vr.bottom ? { el, top: r.top - vr.top } : null
  }
  private restorePrepend(): boolean {
    const v = this.viewport
    const p = this.prepend
    if (!v || !p || !p.el.isConnected) return false
    const delta = this.top(p.el) - p.top
    if (Math.abs(delta) <= EPS) return false
    v.scrollTop += delta
    this.lastSet = v.scrollTop
    this.snapshot()
    this.scheduleCommit()
    this.scheduleVisibility()
    return true
  }
  handleContentChange = (): void => {
    if (!this.content || !this.viewport) return
    if (this.pendingMessage) this.flushPendingMessage()
    const items = this.childItems()
    const before = this.itemCount
    const first = this.firstItem
    this.itemCount = items.length
    this.firstItem = items[0] ?? null
    if (before === 0) {
      if (this.applyDefault()) this.scheduleVisibility()
      else this.commit()
      this.snapshot()
      return
    }
    const at = first ? items.indexOf(first) : -1
    if (this.opts.preserveScrollOnPrepend && at > 0) {
      this.restorePrepend()
      this.commit()
      return
    }
    const fresh = items.slice(before).filter((el) => el.dataset.scrollAnchor === "true" && !this.handled.has(el))
    if (fresh.length) {
      for (const el of fresh) this.handled.add(el)
      const newest = fresh[fresh.length - 1]
      if (this.mode === "following-bottom" && this.opts.autoScroll && fresh.length > 1) this.scrollToEnd()
      else this.scrollToElement(newest, { align: "start" }, { keepPreviousPeek: true })
      return
    }
    if (this.mode === "following-bottom" && this.opts.autoScroll) this.scrollToEnd()
    else this.commit()
    this.snapshot()
    this.scheduleVisibility()
  }
  handleResize = (): void => {
    if (this.mode === "following-bottom" && this.opts.autoScroll) {
      this.scrollToEnd()
      return
    }
    const el = this.anchored
    if (el?.isConnected && this.mode === "anchored-to-message") {
      const v = this.viewport as HTMLElement
      const target = Math.max(0, this.targetFor(el, "start", this.opts.scrollMargin + this.opts.scrollPreviousItemPeek))
      const had = this.spacerHeight
      this.setSpacer(target + v.clientHeight - this.contentEnd())
      if (Math.abs(v.scrollTop - target) > EPS && this.spacerHeight > 0) {
        v.scrollTop = target
        this.lastSet = target
      }
      if (this.opts.autoScroll && had > 0 && this.spacerHeight === 0) {
        this.scrollToEnd()
        return
      }
    }
    this.scheduleCommit()
    this.scheduleVisibility()
  }
  handleScroll = (): void => {
    const v = this.viewport
    if (!v) return
    const s = this.computeScrollable()
    const up = v.scrollTop < this.lastTop - EPS
    this.lastTop = v.scrollTop
    if (this.pointerHeld && !(Math.abs(v.scrollTop - this.lastSet) <= 1.5) && (this.mode === "following-bottom" || this.mode === "anchored-to-message")) this.mode = "free-scrolling"
    if (this.opts.autoScroll && !s.end && this.mode !== "settling-jump" && this.mode !== "anchored-to-message") this.mode = "following-bottom"
    else if (this.mode === "following-bottom" && s.end && up && !(Math.abs(v.scrollTop - this.lastSet) <= 1.5)) this.mode = "free-scrolling"
    this.snapshot()
    this.commit()
    this.scheduleVisibility()
  }
  userIntent = (toward: "start" | "end" | "any" = "any"): void => {
    if (this.mode === "following-bottom") {
      if (toward !== "end") this.mode = "free-scrolling"
    } else if (this.mode === "anchored-to-message" || this.mode === "settling-jump") this.mode = "free-scrolling"
  }
  holdPointer = (on: boolean): void => {
    this.pointerHeld = on
  }
  setSpacerElement = (el: HTMLElement | null): void => {
    this.spacer = el
  }
  registerItem = (id: string, el: HTMLElement | null, previous: HTMLElement | null): void => {
    if (el) {
      this.items.set(id, el)
      if (this.pendingMessage?.id === id) requestAnimationFrame(this.flushPendingMessage)
    } else if (previous && this.items.get(id) === previous) this.items.delete(id)
    this.scheduleVisibility()
  }
  setAutoScroll = (on: boolean): void => {
    this.opts.autoScroll = on
    if (on) {
      if (this.mode === "free-scrolling" && this.viewport && !this.computeScrollable().end) this.mode = "following-bottom"
    } else if (this.mode === "following-bottom") this.mode = "free-scrolling"
  }
  dispose = (): void => {
    for (const f of [this.frame, this.visFrame]) if (f !== undefined) cancelAnimationFrame(f)
    this.frame = undefined
    this.visFrame = undefined
    window.clearTimeout(this.autoscrollTimer)
    this.autoscrollTimer = undefined
    if (this.autoscrolling) {
      this.autoscrolling = false
      this.viewport?.removeAttribute("data-autoscrolling")
      this.root?.removeAttribute("data-autoscrolling")
    }
  }
}

const ControllerContext = React.createContext<Controller | null>(null)

function useController(): Controller {
  const c = React.useContext(ControllerContext)
  if (!c) throw new Error("MessageScroller parts and hooks must be used inside <MessageScroller.Provider>")
  return c
}

export function useMessageScroller() {
  const c = useController()
  return React.useMemo(() => ({ scrollToEnd: c.scrollToEnd, scrollToMessage: c.scrollToMessage, scrollToStart: c.scrollToStart }), [c])
}

export function useMessageScrollerScrollable(): MessageScrollerScrollable {
  const c = useController()
  return React.useSyncExternalStore(c.scrollable.subscribe, c.scrollable.get, c.scrollable.get)
}

export function useMessageScrollerVisibility(): MessageScrollerVisibilityState {
  const c = useController()
  const subscribe = React.useCallback(
    (f: () => void) => {
      const off = c.visibility.subscribe(f)
      c.scheduleVisibility()
      return off
    },
    [c]
  )
  return React.useSyncExternalStore(subscribe, c.visibility.get, c.visibility.get)
}

function MessageScrollerProvider({
  autoScroll = false,
  children,
  defaultScrollPosition = "end",
  scrollEdgeThreshold = 8,
  scrollPreviousItemPeek = 64,
  scrollMargin = 0,
}: {
  children?: React.ReactNode
  autoScroll?: boolean
  defaultScrollPosition?: MessageScrollerDefaultScrollPosition
  scrollEdgeThreshold?: number
  scrollPreviousItemPeek?: number
  scrollMargin?: number
}) {
  const ref = React.useRef<Controller | null>(null)
  ref.current ??= new Controller({ autoScroll, defaultScrollPosition, scrollEdgeThreshold, scrollPreviousItemPeek, scrollMargin, preserveScrollOnPrepend: true })
  const c = ref.current
  c.opts.defaultScrollPosition = defaultScrollPosition
  c.opts.scrollEdgeThreshold = scrollEdgeThreshold
  c.opts.scrollPreviousItemPeek = scrollPreviousItemPeek
  c.opts.scrollMargin = scrollMargin
  React.useLayoutEffect(() => c.setAutoScroll(autoScroll), [c, autoScroll])
  React.useEffect(() => {
    c.scheduleCommit()
    c.scheduleVisibility()
    return () => c.dispose()
  }, [c])
  return <ControllerContext.Provider value={c}>{children}</ControllerContext.Provider>
}

function MessageScrollerRoot({ ref, ...props }: React.ComponentProps<"div">) {
  const c = useController()
  const set = React.useCallback(
    (el: HTMLDivElement | null) => {
      c.root = el
      if (el) c.commit()
      if (typeof ref === "function") ref(el)
      else if (ref) (ref as React.RefObject<HTMLDivElement | null>).current = el
    },
    [c, ref]
  )
  return <div ref={set} {...props} />
}

function MessageScrollerViewport({
  preserveScrollOnPrepend = true,
  onScroll,
  onWheel,
  onPointerDown,
  onTouchStart,
  onTouchMove,
  onKeyDown,
  role,
  tabIndex,
  ref,
  "aria-label": ariaLabel,
  ...props
}: React.ComponentProps<"div"> & {
  preserveScrollOnPrepend?: boolean
}) {
  const c = useController()
  const touchY = React.useRef<number | null>(null)
  c.opts.preserveScrollOnPrepend = preserveScrollOnPrepend
  const set = React.useCallback(
    (el: HTMLDivElement | null) => {
      c.viewport = el
      if (typeof ref === "function") ref(el)
      else if (ref) (ref as React.RefObject<HTMLDivElement | null>).current = el
      if (el) {
        c.commit()
        c.handleContentChange()
      }
    },
    [c, ref]
  )
  React.useEffect(() => {
    const release = () => c.holdPointer(false)
    window.addEventListener("pointerup", release)
    window.addEventListener("pointercancel", release)
    return () => {
      window.removeEventListener("pointerup", release)
      window.removeEventListener("pointercancel", release)
    }
  }, [c])
  React.useEffect(() => {
    const el = c.viewport
    if (!el || typeof ResizeObserver === "undefined") return
    let f = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(f)
      f = requestAnimationFrame(c.handleResize)
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(f)
      ro.disconnect()
    }
  }, [c])
  return (
    <div
      ref={set}
      role={role ?? "region"}
      aria-label={ariaLabel ?? "Messages"}
      tabIndex={tabIndex ?? 0}
      onScroll={(e) => {
        c.handleScroll()
        onScroll?.(e)
      }}
      onWheel={(e) => {
        if (e.deltaY !== 0) c.userIntent(e.deltaY < 0 ? "start" : "end")
        onWheel?.(e)
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) c.holdPointer(true)
        onPointerDown?.(e)
      }}
      onTouchStart={(e) => {
        touchY.current = e.touches[0]?.clientY ?? null
        onTouchStart?.(e)
      }}
      onTouchMove={(e) => {
        const y = e.touches[0]?.clientY
        const before = touchY.current
        touchY.current = y ?? null
        c.userIntent(y === undefined || before === null ? "any" : y > before ? "start" : y < before ? "end" : "any")
        onTouchMove?.(e)
      }}
      onKeyDown={(e) => {
        const toward = SCROLL_KEYS.get(e.key)
        if (toward && !e.defaultPrevented && !isField(e.target)) c.userIntent(e.key === " " && e.shiftKey ? "start" : toward)
        onKeyDown?.(e)
      }}
      {...props}
    />
  )
}

function MessageScrollerContent({
  children,
  spacerClassName,
  role,
  ref,
  "aria-relevant": ariaRelevant,
  ...props
}: React.ComponentProps<"div"> & { spacerClassName?: string }) {
  const c = useController()
  const own = React.useRef<HTMLDivElement | null>(null)
  const set = React.useCallback(
    (el: HTMLDivElement | null) => {
      own.current = el
      c.content = el
      if (typeof ref === "function") ref(el)
      else if (ref) (ref as React.RefObject<HTMLDivElement | null>).current = el
    },
    [c, ref]
  )
  React.useLayoutEffect(() => {
    c.handleContentChange()
  })
  React.useEffect(() => {
    const el = own.current
    if (!el) return
    const mo = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => c.handleContentChange())
    mo?.observe(el, { childList: true })
    let f = 0
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      cancelAnimationFrame(f)
      f = requestAnimationFrame(c.handleResize)
    })
    ro?.observe(el)
    return () => {
      mo?.disconnect()
      cancelAnimationFrame(f)
      ro?.disconnect()
    }
  }, [c])
  return (
    <div ref={set} role={role ?? "log"} aria-relevant={ariaRelevant ?? "additions"} {...props}>
      {children}
      <div
        ref={c.setSpacerElement}
        aria-hidden="true"
        data-message-scroller-spacer=""
        hidden
        className={spacerClassName}
      />
    </div>
  )
}

function MessageScrollerItem({
  messageId,
  scrollAnchor = false,
  ref,
  ...props
}: React.ComponentProps<"div"> & {
  messageId?: string
  scrollAnchor?: boolean
}) {
  const c = useController()
  const prev = React.useRef<HTMLDivElement | null>(null)
  const set = React.useCallback(
    (el: HTMLDivElement | null) => {
      const before = prev.current
      prev.current = el
      if (messageId) c.registerItem(messageId, el, before)
      if (typeof ref === "function") ref(el)
      else if (ref) (ref as React.RefObject<HTMLDivElement | null>).current = el
    },
    [c, messageId, ref]
  )
  return <div ref={set} data-message-id={messageId} data-scroll-anchor={scrollAnchor ? "true" : "false"} {...props} />
}

type ButtonRenderState = { active: boolean; direction: MessageScrollerButtonDirection }

function mergeProps(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a }
  for (const k of Object.keys(b)) {
    const v = b[k]
    if (v === undefined) continue
    const w = out[k]
    if (k === "className") out[k] = [w, v].filter(Boolean).join(" ")
    else if (k === "style") out[k] = { ...(w as object), ...(v as object) }
    else if (/^on[A-Z]/.test(k) && typeof w === "function" && typeof v === "function") out[k] = (e: { defaultPrevented?: boolean }) => (void (v as (e: unknown) => void)(e), e.defaultPrevented ? undefined : (w as (e: unknown) => void)(e))
    else out[k] = v
  }
  return out
}

function MessageScrollerButton({
  behavior = "smooth",
  direction = "end",
  render,
  children,
  onClick,
  tabIndex,
  type = "button",
  ...props
}: Omit<React.ComponentProps<"button">, "ref"> & {
  ref?: React.Ref<HTMLButtonElement>
  behavior?: ScrollBehavior
  direction?: MessageScrollerButtonDirection
  render?: React.ReactElement | ((props: Record<string, unknown>, state: ButtonRenderState) => React.ReactElement)
}) {
  const c = useController()
  const sc = React.useSyncExternalStore(c.scrollable.subscribe, c.scrollable.get, c.scrollable.get)
  const active = direction === "start" ? sc.start : sc.end
  const merged: Record<string, unknown> = {
    type,
    inert: !active,
    tabIndex: active ? tabIndex : -1,
    "data-active": active ? "true" : "false",
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!active) return
      onClick?.(e)
      if (e.defaultPrevented) return
      if (e.currentTarget === document.activeElement) {
        if (c.viewport) c.viewport.focus({ preventScroll: true })
        else e.currentTarget.blur()
      }
      if (direction === "start") c.scrollToStart({ behavior })
      else c.scrollToEnd({ behavior })
    },
    children: children ?? <span>Scroll to {direction}</span>,
    ...props,
  }
  const state = { active, direction }
  if (!render) return React.createElement("button", merged as React.ComponentProps<"button">)
  if (typeof render === "function") return render(merged, state)
  if (!React.isValidElement(render)) return null
  const own = render.props as Record<string, unknown>
  return React.cloneElement(render, mergeProps(own, merged))
}

export const MessageScroller = {
  Provider: MessageScrollerProvider,
  Root: MessageScrollerRoot,
  Viewport: MessageScrollerViewport,
  Content: MessageScrollerContent,
  Item: MessageScrollerItem,
  Button: MessageScrollerButton,
}
