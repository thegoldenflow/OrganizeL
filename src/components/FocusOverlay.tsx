import { useEffect, useRef, useState } from 'react'
import { Check, LifeBuoy, LogOut } from 'lucide-react'
import { focusTask, useApp, useBackHandler } from '../state/store'
import { useDialog, useMedia } from '../lib/hooks'
import { Button, KeepPhrases, cx } from './ui'

/** “容易分心”时的简洁视图：只保留当前行动和下一小步 */
export function FocusOverlay() {
  const { state, dispatch, focusMode, setFocusMode, setStuckFor, say, showToast, completeWithUndo } = useApp()
  const task = focusTask(state)
  const ref = useRef<HTMLDivElement>(null)
  const doneHere = useRef(0)
  const [finished, setFinished] = useState(false)
  const touch = useMedia('(pointer: coarse)')
  const open = focusMode && !!task

  useEffect(() => {
    if (focusMode) {
      doneHere.current = 0
      setFinished(false)
    }
  }, [focusMode])

  function exit(extra?: () => void) {
    if (!task) return setFocusMode(false)
    if (doneHere.current > 0) {
      dispatch({
        type: 'log_progress',
        taskId: task.id,
        title: `在简洁视图里完成了 ${doneHere.current} 步`,
        detail: task.title,
      })
    }
    dispatch({ type: 'set_adjust', taskId: task.id, adjust: undefined })
    setFocusMode(false)
    if (doneHere.current > 0) showToast(`推进了 ${doneHere.current} 步，已记到进展`)
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
        <span className="pl-1 text-[13px] text-muted">简洁视图 · 其他内容已收起</span>
        <Button variant="ghost" size="sm" icon={<LogOut size={14} aria-hidden />} onClick={() => exit()}>
          退出
        </Button>
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
