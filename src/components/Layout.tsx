import { useEffect, useRef, type ReactNode } from 'react'
import { BatteryLow, BatteryMedium, Check, ChevronDown, CircleHelp, Footprints, Inbox, MessageCircle, PanelRightClose, RotateCcw, Route, Sprout, X } from 'lucide-react'
import type { Page, Scenario } from '../data/types'
import { inboxItems, useApp } from '../state/store'
import { todayLabel } from '../lib/dates'
import { useMenu } from '../lib/hooks'
import { cx, menuItem, menuPanel } from './ui'

export const NAV: { id: Page; label: string; icon: ReactNode; iconSm: ReactNode }[] = [
  { id: 'now', label: '现在', icon: <Footprints size={18} aria-hidden />, iconSm: <Footprints size={22} aria-hidden /> },
  { id: 'plan', label: '规划', icon: <Route size={18} aria-hidden />, iconSm: <Route size={22} aria-hidden /> },
  { id: 'inbox', label: '待整理', icon: <Inbox size={18} aria-hidden />, iconSm: <Inbox size={22} aria-hidden /> },
  { id: 'progress', label: '进展', icon: <Sprout size={18} aria-hidden />, iconSm: <Sprout size={22} aria-hidden /> },
]

export const PAGE_TITLE: Record<Page, string> = { now: '现在', plan: '规划', inbox: '待整理', progress: '进展' }

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden className="shrink-0">
        <rect width="32" height="32" rx="9" fill="#2F6B5E" />
        <path d="M10 21.5 16 10.5l6 11" fill="none" stroke="#F6F4EF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16" cy="22" r="2" fill="#F6F4EF" />
      </svg>
      <div className="leading-tight max-[359px]:sr-only">
        <div className="text-[15px] font-semibold tracking-tight text-ink">NextStep</div>
        {!compact && <div className="text-[12px] text-muted">下一步 · 生活整理助手</div>}
      </div>
    </div>
  )
}

/** 键盘用户：第一下 Tab 就能跳过导航，直达主要内容 */
export function SkipLink() {
  return (
    <button
      type="button"
      onClick={() => document.getElementById('main')?.focus()}
      className="sr-only-focusable fixed left-3 top-3 z-[95] rounded-lg bg-ink px-3 py-2 text-[13px] font-medium text-white"
    >
      跳到主要内容
    </button>
  )
}

export function Sidebar() {
  const { page, go, state } = useApp()
  const inboxCount = inboxItems(state).length
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-line bg-canvas px-4 py-5 lg:flex">
      <div className="px-2">
        <Logo />
      </div>
      <nav className="mt-8 flex flex-col gap-1" aria-label="主导航">
        {NAV.map((n) => {
          const active = page === n.id
          return (
            <button
              key={n.id}
              onClick={() => go(n.id)}
              aria-current={active ? 'page' : undefined}
              aria-label={n.id === 'inbox' && inboxCount ? `${n.label}，${inboxCount} 件` : undefined}
              className={cx(
                'group flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] transition-colors',
                active ? 'bg-surface font-semibold text-ink shadow-[var(--shadow-card)] ring-1 ring-line' : 'text-ink-2 hover:bg-sunken hover:text-ink',
              )}
            >
              <span className={cx(active ? 'text-accent' : 'text-muted group-hover:text-ink-2')}>{n.icon}</span>
              <span className="flex-1 text-left">{n.label}</span>
              {n.id === 'inbox' && inboxCount > 0 && (
                <span className="min-w-5 rounded-full bg-sunken px-1.5 text-center text-[12px] font-medium tabular-nums text-ink-2">{inboxCount}</span>
              )}
            </button>
          )
        })}
      </nav>

      <p className="mt-auto px-2 text-[12px] leading-relaxed text-muted">
        演示原型
        <br />
        数据只保存在这个浏览器里
      </p>
    </aside>
  )
}

const SCENARIOS: { id: Scenario; label: string; hint: string }[] = [
  { id: 'normal', label: '普通启动', hint: '让 AI 先写草稿 → 编辑 → 采用' },
  { id: 'low', label: '低精力／卡住', hint: '精力偏低，卡住后把行动缩小' },
  { id: 'resume', label: '中断后回来', hint: '接上次没改完的草稿' },
]

/** 顶部低调标识“演示数据”，同时也是切换演示场景的菜单 */
function DemoMenu() {
  const { state, loadScenario, resetDemo, setOnboarding, go } = useApp()
  const m = useMenu()
  return (
    <div className={cx('relative', m.open && 'z-40')} ref={m.rootRef}>
      <button
        {...m.triggerProps}
        title="界面中的岗位、事项和对话均为虚构示例。点开可切换演示场景"
        className={cx(
          'inline-flex h-8 items-center gap-1 rounded-lg border border-dashed px-2.5 text-[12px] font-medium transition-colors touch:h-11',
          m.open ? 'border-ink-2/40 bg-sunken text-ink' : 'border-line-strong text-muted hover:border-ink-2/40 hover:text-ink',
        )}
      >
        演示数据
        <ChevronDown size={14} aria-hidden className={cx('transition-transform', m.open && 'rotate-180')} />
      </button>
      {m.open && (
        <div {...m.listProps} aria-label="演示场景" className={cx(menuPanel, 'right-0 top-[calc(100%+6px)] w-[min(300px,calc(100vw-24px))] origin-top-right')}>
          <div className="px-3 pb-1.5 pt-2 text-[12px] font-medium text-muted">界面里都是虚构示例 · 切换演示场景</div>
          {SCENARIOS.map((s) => {
            const active = state.scenario === s.id
            return (
              <button
                key={s.id}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  m.close(false)
                  loadScenario(s.id)
                }}
                className={menuItem}
              >
                <span className={cx('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center', active ? 'text-accent' : 'text-transparent')}>
                  <Check size={15} strokeWidth={2.5} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{s.label}</span>
                  <span className="block text-[12px] text-muted">{s.hint}</span>
                </span>
              </button>
            )
          })}
          <div className="my-1.5 h-px bg-line" />
          <button
            role="menuitem"
            onClick={() => {
              m.close(false)
              resetDemo()
            }}
            className={cx(menuItem, 'items-center')}
          >
            <RotateCcw size={15} className="text-muted" aria-hidden />
            重置演示
            <span className="ml-auto text-[12px] text-muted">恢复初始示例</span>
          </button>
          <button
            role="menuitem"
            onClick={() => {
              m.close(false)
              setOnboarding('manual')
              go('now')
              requestAnimationFrame(() => document.getElementById('onboard-title')?.focus())
            }}
            className={cx(menuItem, 'items-center')}
          >
            <CircleHelp size={15} className="text-muted" aria-hidden />
            新手引导
            <span className="ml-auto text-[12px] text-muted">再看一遍</span>
          </button>
        </div>
      )}
    </div>
  )
}

function EnergyToggle({ align = 'left' }: { align?: 'left' | 'right' }) {
  const { state, dispatch, say, showToast } = useApp()
  const m = useMenu()
  const low = state.energy === 'low'
  const set = (e: 'normal' | 'low') => {
    m.close()
    if (e === state.energy) return
    dispatch({ type: 'set_energy', energy: e })
    const text = e === 'low' ? '好，今天只推进一小步，首页先收起了其他内容' : '状态回来了，首页恢复正常内容'
    showToast(text)
    say(e === 'low' ? '好，今天只推进一小步。首页先收起了其他内容。' : '状态回来了。首页恢复正常内容。')
  }
  return (
    <div className={cx('relative', m.open && 'z-40')} ref={m.rootRef}>
      <button
        {...m.triggerProps}
        aria-label={`今天的精力：${low ? '偏低' : '正常'}，点开可以调整`}
        className={cx(
          'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors touch:h-11 touch:px-3',
          low ? 'border-amber-soft bg-amber-soft text-amber-ink' : 'border-line bg-surface text-ink-2 hover:border-line-strong',
        )}
      >
        {low ? <BatteryLow size={15} aria-hidden /> : <BatteryMedium size={15} aria-hidden />}
        {low ? '精力偏低' : '精力正常'}
        <ChevronDown size={13} aria-hidden className={cx('transition-transform', m.open && 'rotate-180')} />
      </button>
      {m.open && (
        <div
          {...m.listProps}
          aria-label="今天的精力"
          className={cx(menuPanel, 'top-[calc(100%+6px)] w-[240px]', align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left')}
        >
          {(
            [
              ['normal', '精力正常', '按计划推进当前行动'],
              ['low', '精力偏低', '首页只留一件事，行动可以更小'],
            ] as const
          ).map(([id, label, hint]) => (
            <button key={id} role="menuitemradio" aria-checked={state.energy === id} onClick={() => set(id)} className={menuItem}>
              <span className={cx('mt-0.5 shrink-0', state.energy === id ? 'text-accent' : 'text-transparent')}>
                <Check size={14} strokeWidth={2.5} aria-hidden />
              </span>
              <span>
                <span className="block font-medium text-ink">{label}</span>
                <span className="block text-[12px] text-muted">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function TopBar() {
  const { assistantOpen, setAssistantOpen } = useApp()
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-canvas/90 backdrop-blur-md">
      {/* 手机与平板：一行放下，省出纵向空间 */}
      <div className="flex h-14 items-center gap-2 px-4 sm:px-6 lg:hidden">
        <Logo compact />
        <div className="ml-auto flex items-center gap-2">
          <EnergyToggle align="right" />
          <DemoMenu />
        </div>
      </div>

      <div className="hidden h-14 items-center gap-3 px-8 lg:flex">
        <span className="text-[13px] tabular-nums text-muted">{todayLabel()}</span>
        <EnergyToggle />
        <div className="ml-auto flex items-center gap-2">
          <DemoMenu />
          <button
            onClick={() => setAssistantOpen(!assistantOpen)}
            aria-pressed={assistantOpen}
            className={cx(
              'inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors',
              assistantOpen ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-sunken hover:text-ink',
            )}
          >
            {assistantOpen ? <PanelRightClose size={16} aria-hidden /> : <MessageCircle size={16} aria-hidden />}
            <span>{assistantOpen ? '收起助手' : '助手'}</span>
          </button>
        </div>
      </div>
    </header>
  )
}

export function MobileTabBar() {
  const { page, go, state } = useApp()
  const inboxCount = inboxItems(state).length
  return (
    <nav aria-label="主导航" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md lg:hidden">
      <div className="mx-auto grid h-16 max-w-[560px] grid-cols-4">
        {NAV.map((n) => {
          const active = page === n.id
          return (
            <button
              key={n.id}
              onClick={() => go(n.id)}
              aria-current={active ? 'page' : undefined}
              aria-label={n.id === 'inbox' && inboxCount ? `${n.label}，${inboxCount} 件` : undefined}
              className={cx(
                'relative flex flex-col items-center justify-center gap-0.5 text-[12px] transition-colors',
                active ? 'font-semibold text-accent' : 'text-muted active:text-ink',
              )}
            >
              <span className={cx('flex h-7 w-12 items-center justify-center rounded-full transition-colors', active && 'bg-accent-soft')}>{n.iconSm}</span>
              {n.label}
              {n.id === 'inbox' && inboxCount > 0 && (
                <span
                  aria-hidden
                  className="absolute left-1/2 top-1.5 ml-3 min-w-[18px] rounded-full bg-surface px-1 text-center text-[11px] font-semibold leading-[18px] tabular-nums text-ink-2 ring-1 ring-line-strong"
                >
                  {inboxCount}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

/** 手机上的助手入口：放在拇指最容易够到的右下角，也可以随手记一件事 */
export function AssistantFab() {
  const { setAssistantOpen, nowView, page, toast } = useApp()
  if (page === 'now' && nowView === 'self') return null
  return (
    <button
      onClick={() => setAssistantOpen(true)}
      aria-label="打开助手（也可以随手记一件事）"
      className={cx(
        'fixed bottom-[calc(80px+env(safe-area-inset-bottom))] right-4 z-30 flex h-13 w-13 items-center justify-center rounded-full border border-line bg-surface text-accent shadow-[var(--shadow-fab)] transition-[transform] duration-300 ease-[var(--ease-out-expo)] active:scale-95 lg:hidden',
        toast && '-translate-y-16',
      )}
    >
      <MessageCircle size={22} aria-hidden />
    </button>
  )
}

export function ToastHost() {
  const { toast, hideToast, announcement } = useApp()
  const timer = useRef<number | undefined>(undefined)
  const start = () => {
    window.clearTimeout(timer.current)
    if (toast) timer.current = window.setTimeout(hideToast, toast.undo ? 8000 : 3200)
  }
  // 鼠标停在提示上、或键盘焦点在“撤销”上时，提示不会自己消失
  const pause = () => window.clearTimeout(timer.current)
  useEffect(() => {
    start()
    return pause
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast])

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(80px+env(safe-area-inset-bottom))] z-[70] flex justify-center px-4 lg:bottom-6"
    >
      <span className="sr-only">{announcement}</span>
      {toast && (
        <div
          key={toast.id}
          onPointerEnter={pause}
          onPointerLeave={start}
          onFocus={pause}
          onBlur={start}
          className="pointer-events-auto flex min-h-12 w-full max-w-[460px] animate-rise items-center gap-2 rounded-xl bg-ink py-1.5 pl-4 pr-1.5 text-[14px] text-white shadow-[var(--shadow-raised)] lg:w-auto lg:text-[13px]"
        >
          <span className="wrap-anywhere min-w-0 flex-1 py-1">{toast.text}</span>
          {toast.undo && (
            <button
              onClick={() => {
                const undo = toast.undo
                hideToast()
                undo?.()
              }}
              className="hit shrink-0 rounded-md px-2.5 py-1.5 font-semibold text-[#9fd3c2] hover:bg-white/10"
            >
              撤销
            </button>
          )}
          <button onClick={hideToast} aria-label="关闭提示" className="hit shrink-0 rounded-md p-1.5 text-white/70 hover:text-white">
            <X size={15} aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}
