import { useEffect, useRef, useState } from 'react'
import { ArrowUp, CircleCheck, FileText, Footprints, X } from 'lucide-react'
import type { ChatAction } from '../data/types'
import { focusTask, uid, useApp, useBackHandler } from '../state/store'
import { adoptLabel, aiHelp, matchIntent } from '../lib/mockAI'
import { dueLabel, parseDue } from '../lib/dates'
import { reducedMotion, useDialog } from '../lib/hooks'
import { useApplyStuck } from '../pages/NowPage'
import { planAtFor, planLabel, planRulesFor, ruleConflict } from '../lib/plan'
import { IconButton, cx } from './ui'

const QUICK = ['继续', '卡住', '帮我整理']

export function AssistantPanel({ variant }: { variant: 'column' | 'overlay' }) {
  const app = useApp()
  const { state, setAssistantOpen } = app
  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const applyStuck = useApplyStuck()

  const focus = focusTask(state)
  const doneToday = state.events.filter((e) => e.kind === 'action' && new Date(e.at).toDateString() === new Date().toDateString()).length
  const doneTotal = state.tasks.filter((t) => t.status === 'done').length

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [state.messages.length])

  const closeIfOverlay = () => {
    if (variant === 'overlay') setAssistantOpen(false)
  }

  const runAction = (a: ChatAction) => {
    if (a.kind === 'artifact') {
      const art = state.artifacts.find((x) => x.id === a.target)
      const cursor = state.resume?.artifactId === a.target ? state.resume.cursor : undefined
      if (art) app.openArtifact(art.id, cursor)
    } else if (a.kind === 'page') app.go(a.target as never)
    else if (a.kind === 'task') app.openTask(a.target)
    closeIfOverlay()
  }

  const handle = (raw: string) => {
    const text = raw.trim()
    if (!text) return
    app.dispatch({ type: 'chat', messages: [{ id: uid('m'), role: 'user', text, at: new Date().toISOString() }] })
    setInput('')
    const intent = matchIntent(text)
    const f = focusTask(state)

    switch (intent.kind) {
      case 'continue': {
        if (!f) {
          app.say('当前规划里的行动都完成了。可以休息，或者去规划页看看下一阶段。', { label: '查看规划', kind: 'page', target: 'plan' })
          return
        }
        app.go('now')
        // 说“继续”就是现在做：之前约的时间作废
        if (f.planAt) app.dispatch({ type: 'set_plan', taskId: f.id, reason: 'start' })
        if (state.resume?.taskId === f.id) {
          app.openArtifact(state.resume.artifactId, state.resume.cursor)
          app.say(`接着上次：停在${state.resume.where}。草稿已打开，光标在你停下的地方。`)
        } else if (f.status === 'draft' && f.artifactId) {
          app.openArtifact(f.artifactId)
          const art = state.artifacts.find((x) => x.id === f.artifactId)
          app.say(`草稿在这里，接着改就行。改好点“${art ? adoptLabel(art) : '采用这版'}”。`)
        } else if (aiHelp(f) && state.artifacts.find((x) => x.id === f.artifactId)?.status !== 'adopted') {
          app.runAI(f.id)
          app.say(`好，我先写“${f.title}”的草稿。`)
        } else {
          // AI 做不出成果的事（修车、交电费……）：直接带用户到下一步
          const steps = f.steps ?? []
          const i = steps.findIndex((_, k) => !f.stepsDone?.includes(k))
          app.setNowView('self')
          app.say(i === -1 ? '步骤都勾完了，确认没问题就点“完成了”。' : `好，从第 ${i + 1} 步开始：${steps[i]}。`)
        }
        closeIfOverlay()
        return
      }
      case 'stuck': {
        if (!f) return app.say('现在没有进行中的行动。')
        app.go('now')
        if (intent.reason) {
          applyStuck(f.id, intent.reason)
        } else {
          app.setStuckFor(f.id)
          app.say('现在主要卡在哪里？我在首页卡片里放了三个选项，选一个就行。')
        }
        closeIfOverlay()
        return
      }
      case 'organize': {
        app.go('inbox')
        const n = state.tasks.filter((t) => t.bucket === 'inbox' && !t.suggestion).length
        if (n) app.say(`我来看一下待整理里的 ${n} 件事……`)
        app.runOrganize()
        closeIfOverlay()
        return
      }
      case 'show_artifact': {
        const art = [...state.artifacts].sort((a, b) => (a.status === 'draft' ? -1 : 1) - (b.status === 'draft' ? -1 : 1) || (a.updatedAt < b.updatedAt ? 1 : -1))[0]
        if (!art) return app.say('还没有成果。点首页的“AI 先帮我做”，我会先写一份草稿。')
        app.openArtifact(art.id)
        app.say(`打开了“${art.title}”。`)
        closeIfOverlay()
        return
      }
      case 'goto': {
        app.go(intent.page)
        const label = { plan: '规划', progress: '进展', inbox: '待整理', now: '现在' }[intent.page]
        app.say(`打开了${label}页。`)
        closeIfOverlay()
        return
      }
      case 'low_energy': {
        app.dispatch({ type: 'set_energy', energy: 'low' })
        app.go('now')
        app.say('那今天只推进一小步。首页已经收起其他内容；做不动就点“卡住了”，我把它缩小。')
        return
      }
      case 'done': {
        if (f?.status === 'draft' && f.artifactId) {
          app.openArtifact(f.artifactId)
          const art = state.artifacts.find((x) => x.id === f.artifactId)
          app.say(`草稿打开了，确认没问题就点“${art ? adoptLabel(art) : '采用这版'}”。`)
        } else if (f) {
          app.go('now')
          app.setNowView('self')
          app.say('在这里点“完成了”就会记下来。')
        }
        closeIfOverlay()
        return
      }
      case 'schedule': {
        if (!f) return app.say('现在没有进行中的行动，不用约时间。')
        app.go('now')
        const openPicker = (text: string) => {
          app.setStuckFor(null)
          app.setPlanFor(f.id)
          app.say(text)
        }
        if (!intent.when) {
          openPicker('好，什么时候做？首页卡片里有几个时间，点一个就约好。')
        } else {
          const at = planAtFor(intent.when, new Date(), planRulesFor(state.tasks, f))
          const conflict = ruleConflict(at, planRulesFor(state.tasks, f))
          if (at.getTime() <= Date.now() + 5 * 60_000) openPicker(`${planLabel(at)}已经过了，换个时间吧。首页卡片里有几个时间可以选。`)
          else if (conflict) openPicker(`${planLabel(at)}和你定的“${conflict}”冲突，换个时间吧。首页卡片里有几个时间可以选。`)
          // 在助手里约时间，光标留在输入框里，不跳走
          else app.bookPlan(f.id, at, { refocus: false })
        }
        closeIfOverlay()
        return
      }
      case 'capture': {
        const id = uid('t')
        app.dispatch({ type: 'add_item', id, text: intent.text })
        const due = parseDue(intent.text)
        app.showToast('已记到待整理')
        app.say(
          `已记到待整理：“${intent.text}”。${due ? `识别到期限是${dueLabel(due)}，首页“有期限的事”里能看到。` : '需要时让我帮你整理。'}`,
          { label: '去待整理', kind: 'page', target: 'inbox' },
        )
        return
      }
    }
  }

  return (
    <aside
      className={cx(
        'flex flex-col bg-surface',
        variant === 'column' ? 'sticky top-0 h-screen w-[360px] shrink-0 border-l border-line' : 'h-full w-full',
      )}
      aria-labelledby={`assistant-title-${variant}`}
    >
      <div className="flex items-center gap-2 border-b border-line py-2 pl-4 pr-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden>
          <Footprints size={15} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <h2 id={`assistant-title-${variant}`} tabIndex={-1} className="text-[14px] font-semibold outline-none">
            助手
          </h2>
          <p className="text-[12px] text-muted">演示版 · 回复由本地规则生成</p>
        </div>
        <IconButton label="收起助手" onClick={() => setAssistantOpen(false)}>
          <X size={18} aria-hidden />
        </IconButton>
      </div>

      {/* 正在处理 / 已完成 */}
      <div className="border-b border-line bg-canvas/60 px-4 py-3">
        <p className="text-[12px] font-medium text-muted">正在处理</p>
        {focus ? (
          <button
            onClick={() => {
              app.go('now')
              closeIfOverlay()
            }}
            className="group -mx-2 mt-0.5 flex min-h-10 w-[calc(100%+16px)] touch:min-h-11 items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface"
          >
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
            <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-ink group-hover:text-accent-ink">
              {focus.adjust?.reason === 'too_big' ? focus.adjust.smallTitle : focus.title}
              <span className="ml-1.5 font-normal text-muted">
                {app.processing?.taskId === focus.id
                  ? '· 正在写草稿'
                  : focus.planAt && new Date(focus.planAt).getTime() > Date.now()
                    ? `· 约在${planLabel(new Date(focus.planAt))}`
                    : focus.status === 'draft'
                      ? '· 草稿已准备'
                      : focus.adjust && focus.adjust.reason !== 'distracted'
                        ? '· 已调整'
                        : ''}
              </span>
            </span>
          </button>
        ) : (
          <p className="mt-1 text-[13px] text-muted">暂无</p>
        )}
        <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
          <CircleCheck size={13} aria-hidden className="text-accent" />
          已完成 {doneTotal} 项{doneToday ? `，今天 ${doneToday} 项` : ''}
        </p>
      </div>

      <div ref={listRef} className="scroll-thin flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
        {state.messages.map((m) => (
          <div key={m.id} className={cx('flex animate-rise', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cx(
                'wrap-anywhere max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed',
                m.role === 'user' ? 'rounded-br-md bg-accent-soft text-accent-ink' : 'rounded-bl-md border border-line bg-canvas/60 text-ink',
              )}
            >
              {m.text}
              {m.action && (
                <button
                  onClick={() => runAction(m.action!)}
                  className="mt-2 flex min-h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-[12px] font-medium text-accent-ink hover:border-accent/40 touch:min-h-11"
                >
                  {m.action.kind === 'artifact' && <FileText size={12} aria-hidden />}
                  {m.action.label}
                </button>
              )}
            </div>
          </div>
        ))}
        {app.processing && (
          <div className="flex justify-start" aria-label="助手正在输入">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-line bg-canvas/60 px-3.5 py-3">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted [animation-delay:300ms]" />
            </div>
          </div>
        )}
      </div>

      <div className="pb-safe border-t border-line px-3 pt-2.5">
        <div className="mb-2 flex gap-1.5">
          {QUICK.map((q) => (
            <button
              key={q}
              onClick={() => handle(q)}
              className="h-8 rounded-full border border-line bg-surface px-3 text-[13px] text-ink-2 transition-colors hover:border-accent/50 hover:text-accent-ink touch:h-11 touch:px-4"
            >
              {q}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handle(input)
          }}
          className="mb-3 flex items-center gap-2 rounded-xl border border-line-strong bg-surface py-1 pl-3 pr-1 transition-[border-color,box-shadow] focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/10"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="说点什么，或随手记一件事"
            enterKeyHint="send"
            className="h-10 min-w-0 flex-1 bg-transparent text-[14px] outline-none touch:h-11"
            aria-label="给助手发消息，或随手记一件事"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-white transition-opacity disabled:opacity-35 touch:h-11 touch:w-11"
            aria-label="发送"
          >
            <ArrowUp size={16} aria-hidden />
          </button>
        </form>
      </div>
    </aside>
  )
}

export function AssistantOverlay() {
  const { assistantOpen, setAssistantOpen } = useApp()
  const ref = useRef<HTMLDivElement>(null)
  const close = () => setAssistantOpen(false)
  useDialog(ref, assistantOpen, close, () => ref.current?.querySelector<HTMLElement>('#assistant-title-overlay'))
  useBackHandler(assistantOpen, close)
  if (!assistantOpen) return null
  return (
    <div className="fixed inset-0 z-[55]">
      <div className="absolute inset-0 animate-fade-in bg-ink/30" onClick={close} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assistant-title-overlay"
        className="absolute inset-y-0 right-0 w-full animate-drawer shadow-[var(--shadow-drawer)] sm:w-[400px]"
      >
        <AssistantPanel variant="overlay" />
      </div>
    </div>
  )
}
