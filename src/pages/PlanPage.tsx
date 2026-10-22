import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Circle,
  CircleCheck,
  Clock3,
  Coffee,
  Ellipsis,
  FileText,
  Hourglass,
  Pencil,
  RefreshCcw,
  Scissors,
  Target,
} from 'lucide-react'
import type { Bucket, Stage, Task } from '../data/types'
import { MOVE_VERB, focusTask, planAddNote, stageTasks, useApp } from '../state/store'
import { dueLabel } from '../lib/dates'
import { Button, CategoryTag, Pill, SectionHeader, cx, menuItem, menuPanel } from '../components/ui'
import { useMenu } from '../lib/hooks'
import { routeCaption } from '../lib/progress'
import { directionKind, planDirection, type PlanTemplate } from '../lib/mockAI'

export function PlanPage() {
  return (
    <div className="mx-auto w-full max-w-[1040px] @container">
      <header className="mb-6">
        <h1 className="text-[26px] font-semibold tracking-tight">规划</h1>
        <p className="mt-1 text-[14px] text-muted">方向、路径和取舍都在这里。日常只需要看首页的那一件。</p>
      </header>

      <DirectionCard />

      <div className="mt-5 grid items-start gap-5 @4xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          <WhyFirst />
          <StagePath />
        </div>
        <div className="grid min-w-0 items-start gap-5 @xl:grid-cols-2 @4xl:row-span-2 @4xl:grid-cols-1">
          <SideGroup bucket="maintain" />
          <SideGroup bucket="later" />
        </div>
        <div className="min-w-0 @4xl:col-start-1">
          <AdjustCondition />
        </div>
      </div>
    </div>
  )
}

function DirectionCard() {
  const { state, dispatch, showToast, say } = useApp()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(state.direction.title)
  // 换了方向时，系统拟一条新路线让用户确认（系统提议，用户决定）
  const [proposal, setProposal] = useState<{ title: string; plan: PlanTemplate; changed: boolean } | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing) ref.current?.select()
  }, [editing])
  useEffect(() => setValue(state.direction.title), [state.direction.title])
  const focusById = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus())

  const propose = (title: string, changed: boolean) => {
    setProposal({ title, plan: planDirection(title), changed })
    focusById('replan-title')
  }

  const save = () => {
    const v = value.trim()
    setEditing(false)
    if (!v || v === state.direction.title) return setValue(state.direction.title)
    // 只是改改措辞（还是同一类方向），不打扰；换了一类方向，才主动提议重新规划
    const changedKind = directionKind(v) !== directionKind(state.direction.title)
    dispatch({ type: 'set_direction', title: v })
    if (changedKind) propose(v, true)
    else showToast('近期方向已更新，首页同步显示')
  }

  const pending = state.tasks.filter((t) => t.bucket === 'plan' && t.status !== 'done').length
  // 现在的阶段是按哪类方向排的（示例数据是求职）；和方向对不上时，才给“重新规划阶段”的入口
  const mismatch = directionKind(state.direction.title) !== (state.planKind ?? 'job')

  const apply = () => {
    if (!proposal) return
    const snap = state
    // 约好了时间的事会挪到“稍后考虑”，约定也随之取消：说出来，别让日历里的提醒变成“幽灵”
    const booked = state.tasks.find((t) => t.bucket === 'plan' && t.status !== 'done' && t.planAt && new Date(t.planAt).getTime() > Date.now())
    dispatch({ type: 'replan', title: proposal.title, plan: proposal.plan })
    setProposal(null)
    showToast('已按新方向重新规划', () => {
      dispatch({ type: 'load', state: snap })
      showToast('已撤销，回到原来的阶段')
    })
    const first = proposal.plan.stages[0]
    say(
      `按“${proposal.title}”重新规划了 ${proposal.plan.stages.length} 个阶段。现在从“${first.title}”开始，第一件是：${first.tasks[0].title}。` +
        (booked ? `原来给“${booked.title}”约的时间取消了${booked.planCal ? '，日历里那条提醒需要你自己删掉' : ''}。` : ''),
    )
    focusById('direction-title')
  }

  return (
    <>
      <section className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Target size={20} />
        </div>
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                save()
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <input
                ref={ref}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && (setEditing(false), setValue(state.direction.title))}
                className="h-10 min-w-0 flex-1 rounded-lg border border-accent/50 bg-surface px-3 text-[17px] font-semibold outline-none ring-4 ring-accent/10"
                aria-label="近期方向"
              />
              <Button type="submit" variant="primary" size="sm">
                保存
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => (setEditing(false), setValue(state.direction.title))}>
                取消
              </Button>
            </form>
          ) : (
            <p id="direction-title" tabIndex={-1} className="text-[19px] font-semibold leading-snug tracking-tight outline-none">
              {state.direction.title}
            </p>
          )}
          <p className="mt-1 text-[13px] text-muted">近期方向 · {state.direction.horizon}</p>
          <RouteProgress />
        </div>
        {!editing && (
          <div className="flex items-center gap-1 self-start sm:flex-col sm:items-end sm:self-center">
            <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => setEditing(true)}>
              编辑
            </Button>
            {!proposal && mismatch && (
              <button onClick={() => propose(state.direction.title, false)} className="hit rounded-md px-2 py-1 text-[12px] text-muted hover:text-ink">
                重新规划阶段
              </button>
            )}
          </div>
        )}
      </section>

      {proposal && (
        <section aria-labelledby="replan-title" className="card mt-3 animate-rise border-accent/30 p-5 sm:p-6">
          <h2 id="replan-title" tabIndex={-1} className="text-[16px] font-semibold leading-snug text-ink outline-none">
            {proposal.changed ? '方向变了，要按新方向重新规划阶段吗？' : '按现在的方向重新规划阶段？'}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            系统按“{proposal.title}”拟了一条路线（{proposal.plan.horizon}），你看看合不合适：
          </p>
          <ol className="mt-4 space-y-3">
            {proposal.plan.stages.map((st, i) => (
              <li key={st.title} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold tabular-nums text-accent-ink">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-ink">{st.title}</p>
                  <p className="text-[13px] leading-relaxed text-muted">阶段成果：{st.outcome}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{st.tasks.map((x) => x.title).join('；')}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded-lg bg-canvas px-3 py-2 text-[13px] leading-relaxed text-ink-2">
            {pending ? `现在规划里还没做完的 ${pending} 件事会放到“稍后考虑”，随时能拿回来；` : ''}
            做完的记录都留在进展里。先只拆第一件事的步骤，后面的事用到时再拆。
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button variant="primary" className="w-full sm:w-auto" onClick={apply}>
              按这个重新规划
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setProposal(null)
                showToast('好，阶段保持不变')
                focusById('direction-title')
              }}
            >
              保留现在的阶段
            </Button>
          </div>
        </section>
      )}
    </>
  )
}

/** 整条路线的进度：把上一阶段已经做完的也算进来，新阶段开始时不会显得“从零起步”（起点进度效应） */
function RouteProgress() {
  const { state } = useApp()
  const all = state.tasks.filter((t) => t.bucket === 'plan' && t.stageId)
  const done = all.filter((t) => t.status === 'done').length
  if (!all.length) return null
  const stageIdx = state.stages.findIndex((x) => x.status === 'current')
  const pct = Math.round((done / all.length) * 100)
  return (
    <div className="mt-3 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <div
        role="progressbar"
        aria-label="整条路线的进度"
        aria-valuemin={0}
        aria-valuemax={all.length}
        aria-valuenow={done}
        aria-valuetext={`已完成 ${done} 个行动，共 ${all.length} 个`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-line sm:max-w-[240px]"
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[12px] tabular-nums text-muted">
        {routeCaption(done, all.length)}
        {stageIdx >= 0 && ` · 第 ${stageIdx + 1}/${state.stages.length} 阶段`}
      </span>
    </div>
  )
}

function WhyFirst() {
  const { state, go } = useApp()
  const f = focusTask(state)
  if (!f) return null
  const reasons = f.reasons ?? [
    { label: '支持主线', text: '属于当前阶段，完成后离方向更近一步' },
    { label: '投入可控', text: f.estimate ? `${f.estimate}，可以一次做完` : '可以拆成小步完成' },
  ]
  return (
    <section className="card p-5 sm:p-6">
      <SectionHeader
        title="为什么先做这件事"
        right={
          <button onClick={() => go('now')} className="hit rounded-md text-[13px] font-medium text-accent hover:underline">
            去首页处理
          </button>
        }
      />
      <p className="text-[16px] font-semibold leading-snug">{f.title}</p>
      <ul className="mt-4 grid gap-2.5 @xl:grid-cols-3">
        {reasons.map((r) => (
          <li key={r.label} className="rounded-xl bg-canvas/70 px-3.5 py-3">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-accent-ink">
              <Check size={14} className="text-accent" strokeWidth={2.5} />
              {r.label}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{r.text}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function StagePath() {
  const { state } = useApp()
  return (
    <section className="card p-5 sm:p-6">
      <SectionHeader title="阶段路径" hint="每个阶段有一个看得见的成果，完成后自动进入下一阶段。" />
      <ol className="relative mt-2">
        {state.stages.map((s, i) => (
          <StageItem key={s.id} stage={s} index={i} last={i === state.stages.length - 1} />
        ))}
      </ol>
    </section>
  )
}

function StageItem({ stage, index, last }: { stage: Stage; index: number; last: boolean }) {
  const { state } = useApp()
  const [open, setOpen] = useState(stage.status === 'current')
  useEffect(() => {
    if (stage.status === 'current') setOpen(true)
  }, [stage.status])
  const tasks = stageTasks(state, stage.id)
  const doneCount = tasks.filter((t) => t.status === 'done').length

  const statusPill =
    stage.status === 'done' ? (
      <Pill tone="neutral">已完成</Pill>
    ) : stage.status === 'current' ? (
      <Pill tone="accent">当前阶段</Pill>
    ) : (
      <Pill tone="outline">之后</Pill>
    )

  return (
    <li className="relative flex gap-4 pb-1">
      <div className="flex flex-col items-center">
        <span
          className={cx(
            'z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold',
            stage.status === 'done' && 'bg-accent text-white',
            stage.status === 'current' && 'bg-surface text-accent ring-2 ring-accent',
            stage.status === 'upcoming' && 'bg-sunken text-muted',
          )}
        >
          {stage.status === 'done' ? <Check size={15} strokeWidth={3} /> : index + 1}
        </span>
        {!last && <span className={cx('w-0.5 flex-1', stage.status === 'done' ? 'bg-accent/60' : 'bg-line')} />}
      </div>

      <div className="min-w-0 flex-1 pb-6">
        <button onClick={() => setOpen((v) => !v)} className="group flex w-full items-start gap-2 text-left" aria-expanded={open}>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cx('text-[16px] font-semibold', stage.status === 'upcoming' && 'text-ink-2')}>{stage.title}</span>
              {statusPill}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              <span className="text-ink-2">阶段成果：</span>
              {stage.outcome}
            </p>
            {!open && (
              <p className="mt-1 text-[12px] text-muted">
                {tasks.length} 个行动{doneCount ? ` · 已完成 ${doneCount}` : ''}
              </p>
            )}
          </div>
          <ChevronDown size={18} aria-hidden className={cx('mt-0.5 shrink-0 text-muted transition-transform group-hover:text-ink-2', open && 'rotate-180')} />
        </button>

        {open && (
          <ul className="mt-3 animate-fade-in space-y-1.5">
            {tasks.map((t, i) => (
              <ActionRow key={t.id} task={t} canUp={i > 0 && tasks[i - 1].status !== 'done'} canDown={i < tasks.length - 1} />
            ))}
            {tasks.length === 0 && <li className="text-[13px] text-muted">暂无行动</li>}
          </ul>
        )}
      </div>
    </li>
  )
}

function ActionRow({ task, canUp, canDown }: { task: Task; canUp: boolean; canDown: boolean }) {
  const { state, openTask } = useApp()
  const isFocus = state.focusTaskId === task.id
  const done = task.status === 'done'
  return (
    <li
      className={cx(
        'group flex items-center gap-1 rounded-xl border transition-colors',
        isFocus ? 'border-accent/40 bg-accent-softer' : 'border-transparent hover:border-line hover:bg-canvas/70',
      )}
    >
      <button onClick={() => openTask(task.id)} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left touch:min-h-12">
        {done ? (
          <CircleCheck size={18} className="shrink-0 text-accent" />
        ) : isFocus ? (
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 border-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
        ) : (
          <Circle size={18} aria-hidden className="shrink-0 text-control" />
        )}
        <span className={cx('min-w-0 flex-1 text-[14px]', done ? 'text-muted line-through decoration-faint' : 'text-ink')}>
          <span className="block @lg:truncate">{task.title}</span>
          {task.adjust?.reason === 'too_big' && <span className="block text-[12px] text-amber-ink">已缩小为：{task.adjust.smallTitle}</span>}
          {(isFocus || task.status === 'draft') && (
            <span className="mt-1 flex flex-wrap gap-1.5 @lg:hidden">
              <RowTags task={task} isFocus={isFocus} />
            </span>
          )}
        </span>
        <span className="hidden shrink-0 items-center gap-1.5 @lg:flex">
          <RowTags task={task} isFocus={isFocus} />
          {task.adjust?.reason === 'too_big' && <Scissors size={13} className="text-amber-ink" />}
          {!done && task.estimate && <span className="hidden text-[12px] text-muted @xl:inline">{task.estimate}</span>}
        </span>
      </button>
      {!done && <RowMenu task={task} canUp={canUp} canDown={canDown} />}
    </li>
  )
}

function RowTags({ task, isFocus }: { task: Task; isFocus: boolean }) {
  return (
    <>
      {isFocus && <Pill tone="accent">当前</Pill>}
      {task.status === 'draft' && (
        <Pill tone="sky" icon={<FileText size={11} />}>
          草稿
        </Pill>
      )}
    </>
  )
}

function RowMenu({ task, canUp, canDown }: { task: Task; canUp: boolean; canDown: boolean }) {
  const { state, dispatch, showToast, say } = useApp()
  const m = useMenu()
  const isFocus = state.focusTaskId === task.id

  const item = (label: string, icon: ReactNode, fn: () => void, disabled = false) => (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        m.close(false)
        fn()
      }}
      className={cx(menuItem, 'items-center py-2 text-[13px]')}
    >
      <span className="text-muted">{icon}</span>
      {label}
    </button>
  )

  const move = (b: Bucket) => {
    const snap = state
    dispatch({ type: 'move', id: task.id, bucket: b })
    showToast(`已把“${task.title}”${b === 'inbox' ? '移回待整理' : MOVE_VERB[b]}`, () => {
      dispatch({ type: 'load', state: snap })
      showToast('已撤销')
    })
  }
  // 调整顺序可能会换掉首页的当前行动，要说出来
  const reorder = (dir: -1 | 1) => {
    const before = state.focusTaskId
    const list = stageTasks(state, task.stageId!).filter((x) => x.status !== 'done')
    const i = list.findIndex((x) => x.id === task.id)
    const j = i + dir
    dispatch({ type: 'reorder', taskId: task.id, dir })
    const f = list.find((x) => x.id === before)
    if (f && f.status === 'todo' && (j === 0 || i === 0)) {
      const newFirst = j === 0 ? task : list[1]
      if (newFirst && newFirst.id !== before) showToast(`首页的当前行动换成了“${newFirst.title}”`)
    }
  }

  return (
    <div className={cx('relative pr-1', m.open && 'z-40')} ref={m.rootRef}>
      <button
        {...m.triggerProps}
        className={cx(
          'flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink touch:h-11 touch:w-11',
          m.open && 'bg-sunken text-ink',
        )}
        aria-label={`调整“${task.title}”`}
      >
        <Ellipsis size={17} aria-hidden />
      </button>
      {m.open && (
        <div {...m.listProps} aria-label="调整" className={cx(menuPanel, 'right-0 top-[calc(100%+4px)] w-[200px] origin-top-right p-1')}>
          {!isFocus &&
            item('设为当前行动', <Target size={14} aria-hidden />, () => {
              dispatch({ type: 'set_focus', taskId: task.id })
              showToast('首页已换成这件事')
              say(`好，把“${task.title}”设为当前行动。`)
            })}
          {item('提前', <ArrowUp size={14} aria-hidden />, () => reorder(-1), !canUp)}
          {item('推后', <ArrowDown size={14} aria-hidden />, () => reorder(1), !canDown)}
          <div className="my-1 h-px bg-line" role="separator" />
          {item(MOVE_VERB.later, <Hourglass size={14} aria-hidden />, () => move('later'))}
          {item(MOVE_VERB.maintain, <RefreshCcw size={14} aria-hidden />, () => move('maintain'))}
        </div>
      )}
    </div>
  )
}

function AdjustCondition() {
  const { state } = useApp()
  const applyStage = state.stages.find((s) => s.id === 's3')
  const applyTask = state.tasks.find((t) => t.id === 't-apply')
  const applied = applyTask?.status === 'done'
  const outcomesReceived = applied ? state.outcomes.filter((o) => o.status !== 'waiting' && o.at > (applyTask?.doneAt ?? '')).length : 0
  return (
    <section className="rounded-2xl border border-dashed border-line-strong bg-surface/50 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <RefreshCcw size={16} className="text-accent" />
        <h2 className="text-[15px] font-semibold">什么时候重新检查方向</h2>
      </div>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{state.adjustCondition}</p>
      {applyTask && applyTask.stageId && (
      <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
        <Pill tone={applied ? 'accent' : 'outline'} icon={applied ? <Check size={12} /> : <Clock3 size={12} />}>
          完成一轮针对性投递{applied ? '' : `（${applyStage?.status === 'upcoming' ? '下一阶段' : '进行中'}）`}
        </Pill>
        <Pill tone="outline" icon={<Clock3 size={12} />}>
          收到投递反馈{outcomesReceived ? '' : '（尚未开始）'}
        </Pill>
      </div>
      )}
      <p className="mt-3 text-[12px] text-muted">在这之前，不需要反复怀疑方向；按阶段推进就好。</p>
    </section>
  )
}

function SideGroup({ bucket }: { bucket: 'maintain' | 'later' }) {
  const { state, openTask, dispatch, showToast } = useApp()
  const items = state.tasks.filter((t) => t.bucket === bucket && t.status !== 'done')
  const isMaintain = bucket === 'maintain'
  return (
    <section className="card p-5">
      <div className="mb-1 flex items-center gap-2">
        {isMaintain ? <Coffee size={16} className="text-sky-ink" /> : <Hourglass size={16} className="text-plum-ink" />}
        <h2 className="text-[15px] font-semibold">{isMaintain ? '维持安排' : '稍后考虑'}</h2>
        <span className="text-[12px] tabular-nums text-muted">{items.length}</span>
      </div>
      <p className="mb-3 text-[12px] leading-relaxed text-muted">
        {isMaintain ? '休息和基本生活照常进行，不为主线让路。' : '有价值，但不是现在。放在这里不会丢。'}
      </p>
      <ul className="-mx-2 space-y-0.5">
        {items.map((t) => (
          <li key={t.id} className="group flex items-center rounded-lg hover:bg-canvas">
            <button onClick={() => openTask(t.id)} className="flex min-w-0 flex-1 items-start gap-2.5 px-2 py-2 text-left touch:min-h-12">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] leading-snug text-ink">{t.title}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                  {t.rest && <span className="text-sky-ink">休息</span>}
                  {t.schedule && <span>{t.schedule}</span>}
                  {t.due && <span className="text-amber-ink">{dueLabel(t.due)}</span>}
                  {!t.rest && !t.schedule && !t.due && <CategoryTag category={t.category} />}
                </span>
              </span>
            </button>
            {!isMaintain && (
              <button
                onClick={() => {
                  const snap = state
                  dispatch({ type: 'move', id: t.id, bucket: 'plan' })
                  showToast(`已加入当前规划：“${t.title}”${planAddNote(t)}`, () => {
                    dispatch({ type: 'load', state: snap })
                    showToast('已撤销')
                  })
                }}
                className="mr-1 inline-flex min-h-8 shrink-0 items-center rounded-md px-2 text-[12px] font-medium text-accent hover:bg-accent-soft touch:min-h-11 pointer-fine:opacity-0 pointer-fine:focus:opacity-100 pointer-fine:group-hover:opacity-100"
              >
                加入当前规划
              </button>
            )}
          </li>
        ))}
        {items.length === 0 && <li className="px-2 py-2 text-[13px] text-muted">暂无</li>}
      </ul>
    </section>
  )
}
