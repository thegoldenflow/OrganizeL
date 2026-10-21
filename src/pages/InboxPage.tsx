import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Archive, ArrowRight, CalendarClock, Check, ChevronDown, ChevronRight, CornerDownLeft, Hourglass, Inbox, RefreshCcw, Sparkles, Target, Undo2 } from 'lucide-react'
import type { Bucket, Task } from '../data/types'
import { BUCKET_LABEL, MOVE_VERB, currentStage, inboxItems, uid, useApp } from '../state/store'
import { daysFromToday, dueLabel, relativeTime } from '../lib/dates'
import { useMedia, useMenu } from '../lib/hooks'
import { Button, CategoryTag, Empty, Pill, Spinner, cx, menuItem, menuPanel } from '../components/ui'

type Dest = Exclude<Bucket, 'inbox'>
const TARGETS: { b: Dest; icon: React.ReactNode }[] = [
  { b: 'plan', icon: <Target size={15} aria-hidden /> },
  { b: 'maintain', icon: <RefreshCcw size={15} aria-hidden /> },
  { b: 'later', icon: <Hourglass size={15} aria-hidden /> },
  { b: 'archived', icon: <Archive size={15} aria-hidden /> },
]

const SPEC_PLACEHOLDER = '把脑子里的事放这里，例如：改简历、修自行车、学法语……'

export function InboxPage() {
  const { state, dispatch, runOrganize, organizingAll, showToast } = useApp()
  const [text, setText] = useState('')
  const [fresh, setFresh] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const roomy = useMedia('(min-width: 640px)')

  const inbox = inboxItems(state).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const unsorted = inbox.filter((t) => !t.suggestion)
  const suggested = inbox.filter((t) => t.suggestion)

  // 输入框随内容长高，长句子也不会被截断
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  const add = () => {
    const v = text.trim()
    if (!v) return
    const id = uid('t')
    dispatch({ type: 'add_item', id, text: v })
    setText('')
    setFresh(id)
    showToast('记下了，在下面的列表里')
    window.setTimeout(() => setFresh((f) => (f === id ? null : f)), 2400)
    inputRef.current?.focus()
  }

  const applyAll = () => {
    const snap = state
    const n = suggested.length
    dispatch({ type: 'apply_all' })
    showToast(`已按建议放好 ${n} 件事`, () => {
      dispatch({ type: 'load', state: snap })
      showToast('已撤销')
    })
  }

  return (
    <div className="mx-auto w-full max-w-[820px]">
      <header className="mb-5">
        <h1 className="text-[26px] font-semibold tracking-tight">待整理</h1>
        <p className="mt-1 text-[14px] leading-relaxed text-muted">先放进来，不用想清楚。分类、轻重和去处交给 AI 建议，你来确认。</p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        className="card flex items-end gap-2 p-2 pl-4 transition-[border-color,box-shadow] focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/10"
      >
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              add()
            }
          }}
          rows={1}
          enterKeyHint="done"
          placeholder={roomy ? SPEC_PLACEHOLDER : '把脑子里的事放这里…'}
          className="min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[15px] leading-relaxed outline-none touch:min-h-11"
          aria-label="新增待整理事项"
          aria-describedby="capture-hint"
        />
        <Button type="submit" variant={text.trim() ? 'primary' : 'secondary'} disabled={!text.trim()} iconRight={<CornerDownLeft size={14} aria-hidden />}>
          记下
        </Button>
      </form>
      <p id="capture-hint" className="mt-2 px-1 text-[12px] leading-relaxed text-muted">
        {roomy
          ? '不用填日期或分类。写了“明天”“周五前”“10月28日”这类词，会自动识别期限并放进首页。'
          : '例如：改简历、修自行车、学法语。写了“明天”“周五前”这类词，会自动识别期限。'}
      </p>

      <section className="mt-7" aria-labelledby="inbox-title">
        <h2 id="inbox-title" tabIndex={-1} className="mb-3 text-[15px] font-semibold outline-none">
          还没放好的 <span className="ml-1 font-normal tabular-nums text-muted">{inbox.length}</span>
        </h2>

        {inbox.length > 0 && (
          <div className="mb-3 flex flex-col gap-3 rounded-2xl bg-accent-softer p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1" aria-live="polite">
              {organizingAll ? (
                <p className="flex items-center gap-2 text-[14px] font-medium text-accent-ink">
                  <Spinner /> AI 正在看这 {unsorted.length} 件事…
                </p>
              ) : unsorted.length > 0 ? (
                <>
                  <p className="flex items-center gap-1.5 text-[14px] font-medium text-accent-ink">
                    <Sparkles size={15} aria-hidden className="text-accent" />
                    {unsorted.length} 件还没有去处
                  </p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-accent-ink-2">AI 会给每件一个去处和一句理由，你确认后才会移动。</p>
                </>
              ) : (
                <>
                  <p className="flex items-center gap-1.5 text-[14px] font-medium text-accent-ink">
                    <Check size={15} aria-hidden className="text-accent" />
                    {suggested.length} 件都有了建议
                  </p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-accent-ink-2">可以一次放好，也可以在下面逐条确认。</p>
                </>
              )}
            </div>
            {!organizingAll && unsorted.length > 0 && (
              <Button variant="primary" className="w-full sm:w-auto" icon={<Sparkles size={15} aria-hidden />} onClick={runOrganize}>
                AI 帮我整理
              </Button>
            )}
            {!organizingAll && unsorted.length === 0 && suggested.length > 0 && (
              <Button variant="primary" className="w-full sm:w-auto" icon={<Check size={15} aria-hidden />} onClick={applyAll}>
                全部按建议放好（{suggested.length}）
              </Button>
            )}
          </div>
        )}

        {inbox.length === 0 ? (
          <Empty icon={<Inbox size={26} aria-hidden />} title="都整理好了" hint="想到什么随时记在上面，或者在助手里直接说。" />
        ) : (
          <ul className="space-y-2">
            {inbox.map((t) => (
              <InboxItem key={t.id} task={t} fresh={fresh === t.id} />
            ))}
          </ul>
        )}
      </section>

      <Groups />
    </div>
  )
}

function MoveMenu({ exclude, onMove, label }: { exclude?: Dest; onMove: (b: Dest) => void; label: string }) {
  const m = useMenu()
  return (
    <div className={cx('relative', m.open && 'z-40')} ref={m.rootRef}>
      <button
        {...m.triggerProps}
        className={cx(
          'inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[13px] text-ink-2 transition-colors hover:bg-sunken hover:text-ink touch:h-11',
          m.open && 'bg-sunken text-ink',
        )}
      >
        {label}
        <ChevronDown size={14} aria-hidden className={cx('transition-transform', m.open && 'rotate-180')} />
      </button>
      {m.open && (
        <div {...m.listProps} aria-label={label} className={cx(menuPanel, 'left-0 top-[calc(100%+4px)] w-[200px] origin-top-left')}>
          {TARGETS.filter((x) => x.b !== exclude).map((x) => (
            <button
              key={x.b}
              role="menuitem"
              onClick={() => {
                m.close(false)
                onMove(x.b)
              }}
              className={cx(menuItem, 'items-center')}
            >
              <span className="text-muted">{x.icon}</span>
              {MOVE_VERB[x.b]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function InboxItem({ task, fresh }: { task: Task; fresh: boolean }) {
  const { state, dispatch, showToast, openTask } = useApp()
  const sug = task.suggestion
  const stage = currentStage(state)

  const itemRef = useRef<HTMLLIElement>(null)
  const move = (b: Dest) => {
    // 这一条会从列表里消失：先找好下一条，焦点不会掉回页面开头
    const li = itemRef.current
    const next = (li?.nextElementSibling ?? li?.previousElementSibling)?.querySelector<HTMLElement>('button')
    const snap = state
    dispatch({ type: 'move', id: task.id, bucket: b })
    const text = b === 'archived' ? `已归档“${task.title}”` : b === 'plan' ? `已加入当前规划 · ${stage.title}` : `已${MOVE_VERB[b]}`
    showToast(text, () => {
      dispatch({ type: 'load', state: snap })
      showToast('已撤销')
    })
    requestAnimationFrame(() => (next && next.isConnected ? next : document.getElementById('inbox-title'))?.focus({ preventScroll: true }))
  }

  return (
    <li ref={itemRef} className={cx('card animate-rise p-4 transition-[box-shadow,border-color]', fresh && 'border-accent/50 ring-4 ring-accent/10')}>
      <button onClick={() => openTask(task.id)} className="group flex w-full items-start gap-2 text-left" >
        <span className="min-w-0 flex-1">
          <span className="wrap-anywhere block text-[15px] leading-snug text-ink group-hover:text-accent-ink">{task.title}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-muted">
            {sug && <CategoryTag category={task.category} />}
            {task.due && (
              <span className={cx('inline-flex items-center gap-1', daysFromToday(task.due) <= 3 && 'font-medium text-amber-ink')}>
                <CalendarClock size={12} aria-hidden /> {dueLabel(task.due)}
              </span>
            )}
            <span>{fresh ? '刚刚记下' : relativeTime(task.createdAt)}</span>
          </span>
        </span>
        <ChevronRight size={16} aria-hidden className="mt-0.5 shrink-0 text-ghost transition-colors group-hover:text-ink-2" />
      </button>

      {task.organizing ? (
        <div className="mt-3 space-y-2" aria-label="正在整理">
          <div className="skeleton-line h-3 w-2/5" />
          <div className="skeleton-line h-3 w-4/5" />
        </div>
      ) : (
        <>
          {sug && (
            <div className="mt-3 animate-fade-in rounded-xl bg-accent-softer px-3.5 py-2.5">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-accent-ink">
                <Sparkles size={13} aria-hidden className="text-accent" />
                建议{MOVE_VERB[sug.bucket]}
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-accent-ink-2">{sug.reason}</p>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {sug && (
              <Button size="sm" variant="soft" icon={<Check size={14} aria-hidden />} onClick={() => move(sug.bucket)}>
                {MOVE_VERB[sug.bucket]}
              </Button>
            )}
            <MoveMenu exclude={sug?.bucket} onMove={move} label={sug ? '换个去处' : '放到…'} />
          </div>
        </>
      )}
    </li>
  )
}

/** 已放好的事：一次只看一组，计数随移动实时变化 */
function Groups() {
  const { state, dispatch, openTask, go, showToast } = useApp()
  const groups: { b: Dest; hint: string; items: Task[] }[] = [
    { b: 'plan', hint: '归到当前阶段，会出现在规划页的行动列表里', items: state.tasks.filter((t) => t.bucket === 'plan' && t.captured) },
    { b: 'maintain', hint: '生活事务和休息，照常进行', items: state.tasks.filter((t) => t.bucket === 'maintain') },
    { b: 'later', hint: '现在不做，放着不会丢', items: state.tasks.filter((t) => t.bucket === 'later') },
    { b: 'archived', hint: '随时可以恢复', items: state.tasks.filter((t) => t.bucket === 'archived') },
  ]
  const [tab, setTab] = useState<Dest>(() => (groups[0].items.length ? 'plan' : 'maintain'))
  const current = groups.find((g) => g.b === tab)!
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const j = (i + d + groups.length) % groups.length
    setTab(groups[j].b)
    tabRefs.current[j]?.focus()
  }

  return (
    <section className="mt-9" aria-labelledby="groups-title">
      <h2 id="groups-title" className="text-[15px] font-semibold">
        已放好的事
      </h2>
      <p className="mb-3 mt-0.5 text-[13px] text-muted">和规划页、首页共用同一份数据，在任意一处调整都会同步。</p>
      <div className="card overflow-hidden">
        <div role="tablist" aria-label="分组" className="scroll-thin flex gap-1 overflow-x-auto border-b border-line p-1.5">
          {groups.map((g, i) => {
            const active = g.b === tab
            return (
              <button
                key={g.b}
                ref={(el) => {
                  tabRefs.current[i] = el
                }}
                role="tab"
                id={`tab-${g.b}`}
                aria-selected={active}
                aria-controls="group-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => setTab(g.b)}
                onKeyDown={(e) => onKey(e, i)}
                className={cx(
                  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] transition-colors touch:h-11',
                  active ? 'bg-accent-soft font-medium text-accent-ink' : 'text-ink-2 hover:bg-sunken',
                )}
              >
                {BUCKET_LABEL[g.b]}
                <span className={cx('tabular-nums', active ? 'text-accent-ink' : 'text-muted')}>{g.items.length}</span>
              </button>
            )
          })}
        </div>
        <div role="tabpanel" id="group-panel" aria-labelledby={`tab-${tab}`} className="p-4">
          <p className="text-[12px] text-muted">{current.hint}</p>
          <ul className="-mx-2 mt-2 space-y-0.5">
            {current.items.length === 0 && <li className="px-2 py-2 text-[13px] text-muted">暂无</li>}
            {current.items.map((t) => (
              <li key={t.id} className="flex items-center gap-2 rounded-lg px-2 hover:bg-canvas">
                <button onClick={() => openTask(t.id)} className="flex min-h-10 min-w-0 flex-1 items-center gap-2 py-1.5 text-left touch:min-h-11">
                  <span className={cx('min-w-0 flex-1 truncate text-[14px]', t.status === 'done' ? 'text-muted line-through' : 'text-ink')}>{t.title}</span>
                  {t.due && t.status !== 'done' && <Pill tone={daysFromToday(t.due) <= 3 ? 'amber' : 'neutral'}>{dueLabel(t.due).replace(/（.*）/, '')}</Pill>}
                  {t.rest && <Pill tone="sky">休息</Pill>}
                </button>
                {tab === 'archived' && (
                  <button
                    onClick={() => {
                      dispatch({ type: 'unarchive', id: t.id })
                      showToast('已恢复')
                    }}
                    className="hit inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-accent hover:bg-accent-soft"
                  >
                    <Undo2 size={12} aria-hidden /> 恢复
                  </button>
                )}
              </li>
            ))}
          </ul>
          {tab === 'plan' && current.items.length > 0 && (
            <button onClick={() => go('plan')} className="hit mt-2 inline-flex items-center gap-1 text-[13px] text-accent hover:underline">
              在规划页查看完整路径 <ArrowRight size={13} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
