import { useState, type ReactNode } from 'react'
import {
  CircleCheck,
  FileText,
  Footprints,
  Mail,
  MailQuestion,
  Plus,
  SlidersHorizontal,
} from 'lucide-react'
import type { EventKind, Outcome, TimelineEvent } from '../data/types'
import { useApp } from '../state/store'
import { dayGroup, relativeTime } from '../lib/dates'
import { Button, Empty, Pill, SectionHeader, cx } from '../components/ui'

const KIND: Record<EventKind, { label: string; icon: ReactNode; dot: string }> = {
  action: { label: '完成行动', icon: <CircleCheck size={15} />, dot: 'bg-accent text-white' },
  progress: { label: '小步推进', icon: <Footprints size={14} />, dot: 'bg-accent-soft text-accent-ink' },
  artifact: { label: '成果', icon: <FileText size={14} />, dot: 'bg-sky-soft text-sky-ink' },
  outcome: { label: '外部结果', icon: <Mail size={14} />, dot: 'bg-amber-soft text-amber-ink' },
  adjust: { label: '调整安排', icon: <SlidersHorizontal size={14} />, dot: 'bg-sunken text-ink-2' },
}

const OUTCOME_LABEL: Record<Outcome['status'], { text: string; tone: 'amber' | 'accent' | 'neutral' | 'plum' }> = {
  waiting: { text: '待观察', tone: 'amber' },
  positive: { text: '积极回应', tone: 'accent' },
  neutral: { text: '一般', tone: 'neutral' },
  negative: { text: '没有通过', tone: 'plum' },
}

export function ProgressPage() {
  const { state } = useApp()
  const [filter, setFilter] = useState<EventKind | 'all'>('all')
  const weekAgo = Date.now() - 7 * 86400000
  const recent = state.events.filter((e) => new Date(e.at).getTime() > weekAgo)
  const actions = recent.filter((e) => e.kind === 'action').length
  const steps = recent.filter((e) => e.kind === 'progress').length
  const arts = state.artifacts.filter((a) => a.status === 'adopted' && new Date(a.updatedAt).getTime() > weekAgo).length
  const waiting = state.outcomes.filter((o) => o.status === 'waiting').length
  const counts = (Object.keys(KIND) as EventKind[]).map((k) => [k, state.events.filter((e) => e.kind === k).length] as const)
  // 累计数只增不减：不像“连续打卡”那样一断就归零（断了就容易整个放弃）
  const allActions = state.events.filter((e) => e.kind === 'action').length
  const allSteps = state.events.filter((e) => e.kind === 'progress').length
  const cumulative = [allActions ? `${allActions} 个行动` : '', allSteps ? `${allSteps} 个小步` : ''].filter(Boolean).join(' · ')

  return (
    <div className="mx-auto w-full max-w-[1040px] @container">
      <header className="mb-5">
        <h1 className="text-[26px] font-semibold tracking-tight">进展</h1>
        <p className="mt-1 text-[14px] leading-relaxed text-muted">看实际推进了什么。行动是你做完的事；结果是外部世界的回应，两者分开记。</p>
      </header>

      <section className="card p-5 sm:p-6" aria-label="最近 7 天">
        {actions + steps + arts === 0 ? (
          <p className="text-[16px] leading-relaxed text-ink">这 7 天还没有新的记录。做完一件事，它就会出现在这里，不用另外补记。</p>
        ) : (
          <p className="text-[16px] leading-relaxed text-ink">
            最近 7 天，你完成了 <b className="font-semibold tabular-nums text-accent-ink">{actions}</b> 个行动
            {steps > 0 && (
              <>
                、<b className="font-semibold tabular-nums text-accent-ink">{steps}</b> 个小步推进
              </>
            )}
            {arts > 0 && (
              <>
                ，采用了 <b className="font-semibold tabular-nums text-sky-ink">{arts}</b> 份成果
              </>
            )}
            {waiting > 0 ? (
              <>
                ；外部结果有 <b className="font-semibold tabular-nums text-amber-ink">{waiting}</b> 条还在等回复。
              </>
            ) : (
              '。'
            )}
          </p>
        )}
        {cumulative && (
          <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-relaxed text-muted">
            <Footprints size={14} aria-hidden className="mt-[3px] shrink-0 text-accent" />
            <span>
              从开始到现在，一共推进了 <b className="font-semibold tabular-nums text-ink-2">{allActions + allSteps}</b> 次（{cumulative}）。这个数只会往上加，不会清零。
            </span>
          </p>
        )}
      </section>

      <div className="mt-5 grid items-start gap-5 @4xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 @4xl:col-start-1 @4xl:row-start-1">
          <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="timeline-title">
            <h2 id="timeline-title" className="text-[15px] font-semibold text-ink">
              时间线
            </h2>
            <div role="group" aria-label="按类型筛选" className="scroll-thin -mx-1 mb-4 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
              <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="全部" count={state.events.length} />
              {counts.map(([k, n]) => (
                <FilterChip key={k} active={filter === k} onClick={() => setFilter(k)} label={KIND[k].label} count={n} icon={KIND[k].icon} dot={KIND[k].dot} />
              ))}
            </div>
            <Timeline filter={filter} />
          </section>
        </div>
        <div className="order-first grid min-w-0 items-start gap-5 @xl:grid-cols-2 @4xl:order-none @4xl:col-start-2 @4xl:row-start-1 @4xl:grid-cols-1">
          <Artifacts />
          <Outcomes />
        </div>
      </div>
    </div>
  )
}

function FilterChip({ active, onClick, label, count, icon, dot }: { active: boolean; onClick: () => void; label: string; count: number; icon?: ReactNode; dot?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border pl-1.5 pr-3 text-[12px] transition-colors touch:h-11',
        active ? 'border-accent/40 bg-accent-soft font-medium text-accent-ink' : 'border-line bg-surface text-ink-2 hover:border-line-strong',
        !icon && 'pl-3',
      )}
    >
      {icon && <span className={cx('flex h-5 w-5 items-center justify-center rounded-full', dot)} aria-hidden>{icon}</span>}
      {label}
      <span className="tabular-nums text-muted">{count}</span>
    </button>
  )
}

function Timeline({ filter }: { filter: EventKind | 'all' }) {
  const { state, openArtifact, openTask } = useApp()
  const events = [...state.events].filter((e) => filter === 'all' || e.kind === filter).sort((a, b) => (a.at < b.at ? 1 : -1))
  const groups: { label: string; items: TimelineEvent[] }[] = []
  for (const e of events) {
    const g = dayGroup(e.at)
    const last = groups[groups.length - 1]
    if (last?.label === g) last.items.push(e)
    else groups.push({ label: g, items: [e] })
  }
  if (!groups.length) return <p className="py-4 text-[13px] text-muted">这一类还没有记录。</p>
  return (
    <div>
      {groups.map((g) => (
        <div key={g.label} className="mb-4 last:mb-0">
          <h3 className="mb-2 text-[12px] font-medium text-muted">{g.label}</h3>
          <ol className="relative ml-2.5 border-l border-line pl-5">
            {g.items.map((e) => {
              const k = KIND[e.kind]
              const clickable = !!(e.artifactId || e.taskId)
              const body = (
                <>
                  <span className={cx('absolute -left-[31px] top-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full ring-4 ring-surface', k.dot)}>
                    {k.icon}
                  </span>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[12px] text-muted">{k.label}</span>
                    {e.detail === '草稿已准备' && <Pill tone="sky" className="h-5 text-[12px]">草稿</Pill>}
                    {e.kind === 'artifact' && e.detail === '已采用' && <Pill tone="accent" className="h-5 text-[12px]">已采用</Pill>}
                    <span className="ml-auto text-[12px] text-muted">{relativeTime(e.at)}</span>
                  </div>
                  <p className={cx('mt-0.5 text-[14px] leading-snug text-ink', clickable && 'group-hover:text-accent-ink')}>{e.title}</p>
                  {e.detail && !['草稿已准备', '已采用'].includes(e.detail) && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{e.detail}</p>}
                </>
              )
              return (
                <li key={e.id} className="relative pb-4 last:pb-1">
                  {clickable ? (
                    <button
                      className="group -mx-2 block w-[calc(100%+16px)] rounded-lg px-2 py-1 text-left hover:bg-canvas"
                      onClick={() => (e.artifactId ? openArtifact(e.artifactId) : openTask(e.taskId!))}
                    >
                      <div className="relative">{body}</div>
                    </button>
                  ) : (
                    <div className="relative py-1">{body}</div>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </div>
  )
}

function Artifacts() {
  const { state, openArtifact } = useApp()
  const list = [...state.artifacts].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  return (
    <section className="card p-5">
      <SectionHeader title="成果" hint="点击可以重新查看和复制" />
      {list.length === 0 ? (
        <Empty icon={<FileText size={22} />} title="还没有成果" />
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {list.map((a) => (
            <li key={a.id}>
              <button onClick={() => openArtifact(a.id)} className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-canvas">
                <FileText size={16} className="mt-0.5 shrink-0 text-sky-ink" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] leading-snug text-ink">{a.title}</span>
                  <span className="mt-0.5 block text-[12px] text-muted">{relativeTime(a.updatedAt)}</span>
                </span>
                <Pill tone={a.status === 'draft' ? 'sky' : 'accent'} className="h-5 text-[12px]">
                  {a.status === 'draft' ? '草稿' : '已采用'}
                </Pill>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Outcomes() {
  const { state, dispatch, showToast } = useApp()
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [replyFor, setReplyFor] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const list = [...state.outcomes].sort((a, b) => (a.status === 'waiting' ? -1 : 1) - (b.status === 'waiting' ? -1 : 1) || (a.at < b.at ? 1 : -1))

  const record = (id: string, status: Outcome['status']) => {
    dispatch({ type: 'update_outcome', id, status, result: reply.trim() || undefined })
    setReplyFor(null)
    setReply('')
    showToast('已记录外部结果')
  }

  return (
    <section className="card p-5">
      <SectionHeader
        title="外部结果"
        hint="面试邀请、回复这类结果只在你收到时记录，完成行动不会自动生成。"
      />
      <ul className="space-y-2">
        {list.map((o) => {
          const s = OUTCOME_LABEL[o.status]
          return (
            <li key={o.id} className="rounded-xl border border-line p-3">
              <div className="flex items-start gap-2.5">
                {o.status === 'waiting' ? (
                  <MailQuestion size={16} className="mt-0.5 shrink-0 text-amber-ink" />
                ) : (
                  <Mail size={16} className="mt-0.5 shrink-0 text-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] leading-snug">{o.title}</p>
                  {o.result && <p className="mt-0.5 text-[12px] text-muted">{o.result}</p>}
                  <div className="mt-1.5 flex items-center gap-2">
                    <Pill tone={s.tone} className="h-5 text-[12px]">
                      {s.text}
                    </Pill>
                    <span className="text-[12px] text-muted">{relativeTime(o.at)}</span>
                    {o.status === 'waiting' && replyFor !== o.id && (
                      <button onClick={() => setReplyFor(o.id)} className="hit ml-auto rounded-md text-[13px] font-medium text-accent hover:underline">
                        收到回复了
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {replyFor === o.id && (
                <div className="mt-3 animate-fade-in border-t border-line pt-3">
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="一句话记下回复内容（可选）"
                    className="h-9 w-full rounded-lg border border-line bg-canvas/50 px-3 text-[13px] outline-none focus:border-accent/60"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="soft" onClick={() => record(o.id, 'positive')}>
                      积极回应
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => record(o.id, 'neutral')}>
                      一般
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => record(o.id, 'negative')}>
                      没有通过
                    </Button>
                    <Button size="sm" variant="quiet" onClick={() => setReplyFor(null)}>
                      取消
                    </Button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {adding ? (
        <form
          className="mt-3 animate-fade-in"
          onSubmit={(e) => {
            e.preventDefault()
            if (!title.trim()) return
            dispatch({ type: 'add_outcome', title: title.trim(), status: 'waiting' })
            setTitle('')
            setAdding(false)
            showToast('已记下，等有回复时再更新')
          }}
        >
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：投递了星河科技，等待回复"
            className="h-9 w-full rounded-lg border border-line bg-canvas/50 px-3 text-[13px] outline-none focus:border-accent/60"
          />
          <div className="mt-2 flex gap-1.5">
            <Button size="sm" variant="primary" type="submit" disabled={!title.trim()}>
              记下
            </Button>
            <Button size="sm" variant="quiet" type="button" onClick={() => setAdding(false)}>
              取消
            </Button>
          </div>
        </form>
      ) : (
        <Button size="sm" variant="ghost" icon={<Plus size={14} />} className="mt-2" onClick={() => setAdding(true)}>
          记一个外部结果
        </Button>
      )}
    </section>
  )
}
