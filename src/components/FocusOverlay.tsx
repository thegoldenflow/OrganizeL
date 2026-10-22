import { useEffect, useRef, useState } from 'react'
import { Check, LifeBuoy, LogOut, Timer } from 'lucide-react'
import { focusTask, useApp, useBackHandler } from '../state/store'
import { STORAGE_KEY } from '../data/seed'
import { useDialog, useMedia, useNow } from '../lib/hooks'
import { Button, KeepPhrases, cx } from './ui'

/**
 * 可选的正计时：只显示“已专注几分钟”，不倒计时、不显示秒、不到点提醒。
 * 对时间不敏感的人，把时间“摆在眼前”能帮助感知时间（Barkley 关于 ADHD 的“把时间外化”建议）；
 * 倒计时则会带来截止压力，所以默认关闭，想用的人点一下“计时”，下次进来还记得。
 */
const TIMER_KEY = `${STORAGE_KEY}-focus-timer`
function readTimerPref() {
  try {
    return localStorage.getItem(TIMER_KEY) === '1'
  } catch {
    return false
  }
}
function writeTimerPref(on: boolean) {
  try {
    if (on) localStorage.setItem(TIMER_KEY, '1')
    else localStorage.removeItem(TIMER_KEY)
  } catch {
    /* 隐私模式下忽略 */
  }
}

const minutesSince = (t: number, now = Date.now()) => Math.max(0, Math.floor((now - t) / 60_000))

/** 每 15 秒刷新一次，只在计时打开时挂载 */
function FocusClock({ since }: { since: number }) {
  const now = useNow(15_000)
  const m = minutesSince(since, now.getTime())
  return <>{m < 1 ? '刚开始专注' : `已专注 ${m} 分钟`}</>
}

/** “容易分心”时的简洁视图：只保留当前行动和下一小步 */
export function FocusOverlay() {
  const { state, dispatch, focusMode, setFocusMode, setStuckFor, say, showToast, completeWithUndo } = useApp()
  const task = focusTask(state)
  const ref = useRef<HTMLDivElement>(null)
  const doneHere = useRef(0)
  const [finished, setFinished] = useState(false)
  const [showTimer, setShowTimer] = useState(readTimerPref)
  // 每次进入简洁视图都从 0 开始算；在渲染时就重置，避免先闪一下上一次的时长
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [wasOpen, setWasOpen] = useState(focusMode)
  if (focusMode !== wasOpen) {
    setWasOpen(focusMode)
    if (focusMode) setStartedAt(Date.now())
  }
  const touch = useMedia('(pointer: coarse)')
  const open = focusMode && !!task

  useEffect(() => {
    if (focusMode) {
      doneHere.current = 0
      setFinished(false)
    }
  }, [focusMode])

  // 切到别的应用、锁屏的那段时间不算“专注”：页面隐藏期间暂停计时
  useEffect(() => {
    if (!open) return
    let hiddenAt: number | null = null
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else if (hiddenAt !== null) {
        const away = Date.now() - hiddenAt
        hiddenAt = null
        setStartedAt((t) => t + away)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [open])

  const toggleTimer = () => {
    const next = !showTimer
    setShowTimer(next)
    writeTimerPref(next)
  }

  function exit(extra?: () => void) {
    if (!task) return setFocusMode(false)
    // 打开了计时才提专注时长；没打开就不统计给用户看
    const mins = showTimer ? minutesSince(startedAt) : 0
    if (doneHere.current > 0) {
      dispatch({
        type: 'log_progress',
        taskId: task.id,
        title: `在简洁视图里完成了 ${doneHere.current} 步`,
        detail: mins >= 1 ? `${task.title} · 专注 ${mins} 分钟` : task.title,
      })
    }
    dispatch({ type: 'set_adjust', taskId: task.id, adjust: undefined })
    setFocusMode(false)
    if (doneHere.current > 0) showToast(`推进了 ${doneHere.current} 步${mins >= 1 ? `，专注了 ${mins} 分钟` : ''}，已记到进展`)
    extra?.()
  }

  useDialog(ref, open, () => exit(), () => ref.current?.querySelector<HTMLElement>('#focus-title'))
  useBackHandler(open, () => exit())

  if (!open || !task) return null

  const steps = task.steps ?? ['做第一步']
  const done = new Set(task.stepsDone ?? [])
  const idx = steps.findIndex((_, i) => !done.has(i))
  const allDone = idx === -1

  const stepDone = () => {
    dispatch({ type: 'toggle_step', taskId: task.id, index: idx })
    doneHere.current += 1
    if (idx === steps.length - 1) setFinished(true)
  }

  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="focus-title" className="fixed inset-0 z-[80] flex animate-fade-in flex-col bg-canvas">
      <div className="flex items-center justify-between gap-3 px-4 py-2 sm:px-8 sm:py-4">
        <span className="pl-1 text-[13px] tabular-nums text-muted">
          {showTimer ? (
            <>
              {/* 窄屏上只留时长，不折行 */}
              <span className="hidden sm:inline">简洁视图 · </span>
              <FocusClock since={startedAt} />
            </>
          ) : (
            <>
              简洁视图
              <span className="hidden sm:inline"> · 其他内容已收起</span>
            </>
          )}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={showTimer}
            title={showTimer ? '关掉计时' : '显示已专注多久（不倒计时）'}
            icon={<Timer size={14} aria-hidden />}
            onClick={toggleTimer}
            className={cx(showTimer && 'bg-sunken text-ink')}
          >
            计时
          </Button>
          <Button variant="ghost" size="sm" icon={<LogOut size={14} aria-hidden />} onClick={() => exit()}>
            退出
          </Button>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[600px] flex-1 flex-col px-5 sm:justify-center sm:pb-24">
        <div className="my-auto sm:my-0">
          {finished || allDone ? (
            <div className="animate-rise">
              <h1 id="focus-title" tabIndex={-1} className="text-pretty text-[26px] font-semibold leading-snug tracking-tight outline-none sm:text-[30px]">
                {finished ? '这件事做完了吗？' : '步骤都勾完了'}
              </h1>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
                做完了就记下来；没做完也没关系，停在这里，下次接着来。
              </p>
              <p className="mt-3 text-[13px] text-muted">{task.title}</p>
            </div>
          ) : (
            <div key={idx} className="animate-rise">
              <h1 id="focus-title" tabIndex={-1} className="text-pretty text-[26px] font-semibold leading-snug tracking-tight outline-none sm:text-[32px]">
                <KeepPhrases text={steps[idx]} />
              </h1>
              <div className="mt-5 flex items-center gap-1.5" role="img" aria-label={`第 ${idx + 1} 步，共 ${steps.length} 步`}>
                {steps.map((_, i) => (
                  <span
                    key={i}
                    className={cx('h-1.5 rounded-full transition-all', done.has(i) ? 'w-6 bg-accent' : i === idx ? 'w-10 bg-accent/60' : 'w-6 bg-line-strong')}
                  />
                ))}
              </div>
              <p className="mt-2.5 text-[13px] leading-relaxed text-muted">
                第 {idx + 1} 步，共 {steps.length} 步 · {idx === steps.length - 1 && steps.length > 1 ? '最后一步了' : '现在只做这一步'}
                <span className="block">{task.title}</span>
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 pb-[calc(16px+env(safe-area-inset-bottom))] pt-8 sm:flex-row sm:pb-0 sm:pt-10">
          {finished || allDone ? (
            <>
              <Button
                variant="primary"
                size="lg"
                className="w-full sm:w-auto"
                icon={<Check size={17} aria-hidden />}
                onClick={() =>
                  exit(() => {
                    completeWithUndo({ type: 'complete_task', taskId: task.id }, task.id)
                    say(`“${task.title}”完成了，已记到进展。`)
                  })
                }
              >
                做完了
              </Button>
              <Button variant="ghost" size="lg" onClick={() => exit()}>
                先停在这里
              </Button>
            </>
          ) : (
            <>
              <Button variant="primary" size="lg" className="w-full sm:w-auto" icon={<Check size={17} aria-hidden />} onClick={stepDone}>
                这一步做完了
              </Button>
              <Button variant="ghost" size="lg" icon={<LifeBuoy size={16} aria-hidden />} onClick={() => exit(() => setStuckFor(task.id))}>
                还是卡住
              </Button>
            </>
          )}
        </div>
      </div>

      <p className="hidden px-5 pb-6 text-center text-[12px] text-muted sm:block">
        {touch ? '需要时随时点右上角“退出”。' : '如果手机就在手边，可以先把它扣过来。按 Esc 也能退出。'}
      </p>
    </div>
  )
}
