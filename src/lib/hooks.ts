import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'

/* ---------------- 媒体查询与时间 ---------------- */

export function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const h = () => setMatch(m.matches)
    h()
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [query])
  return match
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** 每分钟刷新一次的“现在”，用于问候语和休息时间判断 */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

/** 把新出现的面板滚到可见处（尊重“减少动态效果”），可选地把焦点移过去 */
export function reveal(el: HTMLElement | null | undefined, opts: { focus?: boolean } = {}) {
  if (!el) return
  el.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
  if (opts.focus) el.focus({ preventScroll: true })
}

/** 原地操作让当前按钮消失后，把焦点交给页面的主按钮，键盘用户不会掉回页面开头 */
export function focusPrimary(fallback?: HTMLElement | null) {
  requestAnimationFrame(() => {
    const el = fallback && fallback.isConnected ? fallback : document.querySelector<HTMLElement>('#main [data-primary-action]')
    ;(el ?? document.getElementById('main'))?.focus({ preventScroll: true })
  })
}

/* ---------------- 对话框：焦点进入、Tab 循环、Esc 关闭、关闭后焦点回到触发处 ---------------- */

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusables(node: HTMLElement) {
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0)
}

const dialogStack: HTMLElement[] = []

export function useDialog(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
  initialFocus?: () => HTMLElement | null | undefined,
) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const initRef = useRef(initialFocus)
  initRef.current = initialFocus

  useEffect(() => {
    if (!open) return
    const node = ref.current
    if (!node) return
    const returnTo = document.activeElement as HTMLElement | null
    dialogStack.push(node)

    const raf = requestAnimationFrame(() => {
      const target = initRef.current?.() ?? node.querySelector<HTMLElement>('[data-autofocus]') ?? focusables(node)[0] ?? node
      target.focus({ preventScroll: true })
    })

    const onKey = (e: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== node) return
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const list = focusables(node)
      if (!list.length) {
        e.preventDefault()
        node.focus()
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !node.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !node.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey)
      const i = dialogStack.lastIndexOf(node)
      if (i >= 0) dialogStack.splice(i, 1)
      requestAnimationFrame(() => {
        if (dialogStack.length) return
        // 触发按钮还在就回到它；不在了（比如按钮已经换成“查看草稿”）就回到当前页的主按钮
        const back =
          returnTo && returnTo.isConnected && !returnTo.closest('[inert]') && returnTo !== document.body
            ? returnTo
            : (document.querySelector<HTMLElement>('#main [data-primary-action]') ?? document.getElementById('main'))
        back?.focus({ preventScroll: true })
      })
    }
  }, [open, ref])
}

/* ---------------- 下拉菜单：方向键、Home/End、Esc、点外面关闭 ---------------- */

export function useMenu() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const items = () =>
    Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])

  const close = useCallback((focusTrigger = true) => {
    setOpen(false)
    if (focusTrigger) triggerRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    const raf = requestAnimationFrame(() => {
      const list = items()
      ;(list.find((x) => x.getAttribute('aria-checked') === 'true') ?? list[0])?.focus({ preventScroll: true })
    })
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  const onListKeyDown = (e: ReactKeyboardEvent) => {
    const list = items()
    const i = list.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      list[(i + 1) % list.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      list[(i - 1 + list.length) % list.length]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      list[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      list[list.length - 1]?.focus()
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  const triggerProps = {
    ref: triggerRef,
    'aria-haspopup': 'menu' as const,
    'aria-expanded': open,
    onClick: () => setOpen((v) => !v),
    onKeyDown: (e: ReactKeyboardEvent) => {
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) {
        e.preventDefault()
        setOpen(true)
      } else if (e.key === 'Escape' && open) {
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
      }
    },
  }
  const listProps = { ref: listRef, role: 'menu' as const, onKeyDown: onListKeyDown }

  return { open, setOpen, close, rootRef, triggerProps, listProps }
}

/* ---------------- 底部抽屉：按住顶部往下拖即可关闭 ---------------- */

export function useSheetDrag(onClose: () => void, enabled: boolean) {
  const [dy, setDy] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ y: number; t: number; moved: boolean } | null>(null)

  const end = (clientY: number) => {
    const s = start.current
    start.current = null
    setDragging(false)
    if (!s) return
    const d = clientY - s.y
    const v = d / Math.max(1, performance.now() - s.t)
    // 无论关闭与否都要归零，否则下次打开的抽屉会停在拖下去的位置
    setDy(0)
    if (s.moved && (d > 110 || v > 0.65)) onClose()
  }

  const handlers = enabled
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          if ((e.target as HTMLElement).closest('button, a, input, textarea')) return
          start.current = { y: e.clientY, t: performance.now(), moved: false }
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        },
        onPointerMove: (e: React.PointerEvent) => {
          const s = start.current
          if (!s) return
          const d = e.clientY - s.y
          if (!s.moved && d < 6) return
          s.moved = true
          setDragging(true)
          setDy(Math.max(0, d))
        },
        onPointerUp: (e: React.PointerEvent) => end(e.clientY),
        onPointerCancel: () => {
          start.current = null
          setDragging(false)
          setDy(0)
        },
      }
    : {}

  return { dy, dragging, handlers }
}
