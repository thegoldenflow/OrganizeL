import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BatteryLow,
  CalendarClock,
  Check,
  ChevronDown,
  CircleCheck,
  Clock3,
  FileText,
  Focus,
  History,
  LifeBuoy,
  Lightbulb,
  ListChecks,
  Moon,
  PenLine,
  Scissors,
  Sparkles,
  Target,
  Undo2,
  X,
} from 'lucide-react'
import type { StuckReason, Task, TimelineEvent } from '../data/types'
import {
  artifactById,
  attentionItems,
  focusTask,
  restRule,
  stageTasks,
  stepsFor,
  taskById,
  useApp,
  useBackHandler,
  VISIT_GAP_DAYS,
} from '../state/store'
import { stuckAdjust } from '../lib/mockAI'
import { clockLabel, dueLabel, daysFromToday, greeting, minutesOf, relativeTime } from '../lib/dates'
import { focusPrimary, reveal, useNow } from '../lib/hooks'
import { afterDoneCaption, stageCaption, stepTag } from '../lib/progress'
import { Button, CheckDraw, IconButton, Pill, Spinner, cx } from '../components/ui'

export function NowPage() {
  const { state, nowView } = useApp()
  const task = focusTask(state)
  if (nowView === 'self' && task) return <SelfDoView task={task} />
  return <NowHome />
}

/** 用户自己定的休息边界：到点后（到凌晨 5 点前）不再催主线 */
function useRestBoundary(task?: Task) {
  const { state } = useApp()
  const now = useNow()
  const rule = restRule(state)
  if (!rule || !task || task.category !== '求职') return { active: false, now, rule: undefined as Task | undefined }
  const mins = now.getHours() * 60 + now.getMinutes()
  const active = mins >= minutesOf(rule.at) || mins < 5 * 60
  return { active, now, rule: rule.task as Task | undefined }
}

function NowHome() {
  const { state, go, restDecision } = useApp()
  const task = focusTask(state)
  const low = state.energy === 'low'
  const resuming = !!state.resume && state.resume.taskId === task?.id
  const rest = useRestBoundary(task)
  const resting = !!task && restDecision === 'stop'
  const restPrompt = rest.active && restDecision === null

  // 新起点效应：周一、隔了几天再打开，都是“重新开始”的好时机，用不带内疚的说法接住
  const now = new Date()
  const freshWeek = now.getDay() === 1 && now.getHours() >= 5 && now.getHours() < 14

  const title = resting
    ? '今天就到这里'
    : !task
      ? '行动都完成了，可以歇一歇'
      : restPrompt
        ? `${greeting()}，今天可以收工了`
        : resuming
          ? '欢迎回来，接着上次的来'
          : low
            ? '今天精力有限，推进一小步就够'
            : VISIT_GAP_DAYS >= 3
              ? '好久不见，从这一件重新开始就好'
              : freshWeek
                ? '新的一周，先推进这一件'
                : `${greeting()}，先推进这一件`

  return (
    <div className="mx-auto w-full max-w-[760px]">
      <header className="mb-5 sm:mb-6">
        <h1 className="text-[24px] font-semibold leading-tight tracking-tight text-ink sm:text-[28px]">{title}</h1>
        <button
          onClick={() => go('plan')}
          className="group mt-3 inline-flex min-h-8 max-w-full touch:min-h-11 items-center gap-2 rounded-lg text-left text-[14px] text-ink-2"
        >
          <span className="shrink-0 rounded-md bg-sunken px-1.5 py-0.5 text-[12px] text-ink-2">近期方向</span>
          <span className="truncate font-medium text-ink">{state.direction.title}</span>
          <ArrowRight size={14} aria-hidden className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
        </button>
      </header>

      {restPrompt && rest.rule && <RestBanner ruleTitle={rest.rule.title} clock={clockLabel(rest.now)} />}

      {state.justCompleted && <CompletedBanner />}

      {task ? resting ? <RestingCard task={task} /> : <ActionCard key={task.id} task={task} /> : <AllDone />}

      <SideInfo quiet={low || resting} />
    </div>
  )
}

/* ---------------- 休息边界 ---------------- */

function RestBanner({ ruleTitle, clock }: { ruleTitle: string; clock: string }) {
  const { decideRest } = useApp()
  return (
    <section aria-labelledby="rest-title" className="mb-4 animate-rise rounded-2xl bg-sky-soft/70 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Moon size={20} aria-hidden className="mt-0.5 shrink-0 text-sky-ink" />
        <div className="min-w-0 flex-1">
          <h2 id="rest-title" className="text-[15px] font-semibold text-ink">
            已经 {clock} 了
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-sky-ink">你定过：“{ruleTitle}”。当前这件事明天接着做，进度都记着。</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<Moon size={14} aria-hidden />}
              onClick={() => {
                decideRest('stop')
                focusPrimary()
              }}
            >
              好，今天到这里
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                decideRest('continue')
                focusPrimary()
              }}
            >
              我还想做一点
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

/** “今天”从早上 5 点算起，和“今天到这里”的有效期一致 */
function startOfRestDay() {
  const d = new Date()
  if (d.getHours() < 5) d.setDate(d.getDate() - 1)
  d.setHours(5, 0, 0, 0)
  return d.getTime()
}

const SUMMARY_KIND: Partial<Record<TimelineEvent['kind'], string>> = { action: '完成', progress: '小步', artifact: '成果' }

function RestingCard({ task }: { task: Task }) {
  const { state, decideRest, openArtifact, openTask } = useApp()
  // 收工小结：把今天推进了什么列出来（进步原则），再写清明天从哪开始（给没做完的事一个计划，晚上就不容易惦记）
  const since = startOfRestDay()
  const todays = state.events.filter((e) => SUMMARY_KIND[e.kind] && new Date(e.at).getTime() >= since)
  const doneTasks = new Set(todays.filter((e) => e.kind === 'action').map((e) => e.taskId))
  // 采用草稿和完成行动是同一件事，只记一次；“草稿已准备”还不算推进
  const today = todays
    .filter((e) => !(e.kind === 'artifact' && (e.detail === '草稿已准备' || doneTasks.has(e.taskId))))
    .sort((a, b) => (a.at < b.at ? -1 : 1))
  const steps = task.steps ?? []
  const done = new Set(task.stepsDone ?? [])
  const next = steps.findIndex((_, i) => !done.has(i))
  const art = artifactById(state, task.artifactId)
  const status =
    art?.status === 'draft'
      ? '草稿已经存好，明天打开就能接着改。'
      : done.size && next !== -1
        ? `已经做了 ${done.size}/${steps.length} 步，明天从第 ${next + 1} 步开始。`
        : '还没开始也没关系，明天可以先让 AI 写一版草稿。'
  return (
    <section className="card animate-rise p-5 sm:p-7" aria-labelledby="tomorrow-title">
      <p className="flex items-center gap-2 text-[13px] font-medium text-sky-ink">
        <Moon size={15} aria-hidden /> 明天从这里开始
      </p>
      <h2 id="tomorrow-title" className="mt-2 text-balance text-[20px] font-semibold leading-snug tracking-tight">
        {task.title}
      </h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{status}</p>

      <div className="mt-5 border-t border-line pt-4">
        <h3 className="text-[13px] font-medium text-ink-2">{today.length ? `今天推进了 ${today.length} 次` : '今天推进了'}</h3>
        {today.length ? (
          <ul className="-mx-2 mt-1.5">
            {today.slice(-5).map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => (e.artifactId ? openArtifact(e.artifactId) : e.taskId ? openTask(e.taskId) : undefined)}
                  className="flex min-h-9 w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-canvas touch:min-h-11"
                >
                  <Check size={15} aria-hidden className="mt-0.5 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 text-[14px] leading-snug text-ink">
                    <span className="mr-1.5 text-[12px] text-muted">{SUMMARY_KIND[e.kind]}</span>
                    {e.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[14px] leading-relaxed text-muted">今天没有记录也没关系，休息本身就在安排里。</p>
        )}
      </div>

      <div className="mt-5">
        {/* 独立的文字按钮：让文字和上面的内容左对齐，背景只在悬停时出现 */}
        <Button
          variant="ghost"
          className="-ml-4"
          data-primary-action
          onClick={() => {
            decideRest('continue')
            focusPrimary()
          }}
        >
          我还想做一点
        </Button>
      </div>
    </section>
  )
}

/* ---------------- 当前行动卡 ---------------- */

/** 本阶段的行动进度：每一小段是一个行动，紧挨着“本阶段已完成”的文字 */
function StageTrail({ list, currentId }: { list: Task[]; currentId: string }) {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {list.map((t) => (
        <span
          key={t.id}
          className={cx(
            'h-1.5 w-4 rounded-full transition-colors duration-500',
            t.status === 'done' ? 'bg-accent' : t.id === currentId ? 'bg-accent/45' : 'bg-line-strong',
          )}
        />
      ))}
    </span>
  )
}

const RESUME_NAME: Record<string, string> = { project: '项目经历', skills: '技能栏', intro: '自我介绍' }

function ActionCard({ task }: { task: Task }) {
  const { state, dispatch, processing, runAI, stuckFor, setStuckFor, setNowView, openArtifact, showToast, decideRest } = useApp()
  const stage = state.stages.find((s) => s.id === task.stageId)
  const stageIdx = stage ? state.stages.findIndex((s) => s.id === stage.id) : -1
  const stageList = stage ? stageTasks(state, stage.id) : []
  const doneInStage = stageList.filter((t) => t.status === 'done').length
  const isProcessing = processing?.taskId === task.id
  const showStuck = stuckFor === task.id && !task.adjust
  const adjust = task.adjust && task.adjust.reason !== 'distracted' ? task.adjust : undefined
  const resume = state.resume?.taskId === task.id ? state.resume : null
  const artifact = artifactById(state, task.artifactId)
  const low = state.energy === 'low'
  const steps = task.steps ?? []
  const stepsDone = new Set(task.stepsDone ?? [])
  const nextStep = steps.findIndex((_, i) => !stepsDone.has(i))
  const startedSteps = stepsDone.size > 0 && nextStep !== -1
  const displayTitle = adjust?.reason === 'too_big' ? adjust.smallTitle : task.title

  // 交互区换了内容（处理中 / 卡住了 / 缩小 / 示例）时，滚到能看见的位置，并把焦点移过去
  const panelRef = useRef<HTMLDivElement>(null)
  const mode = isProcessing ? 'processing' : showStuck ? 'stuck' : (adjust?.reason ?? 'idle')
  const prevMode = useRef(mode === 'stuck' ? 'idle' : mode)
  useEffect(() => {
    if (prevMode.current !== mode && mode !== 'idle') reveal(panelRef.current, { focus: true })
    prevMode.current = mode
  }, [mode])

  const leaveBanner = () => state.justCompleted && dispatch({ type: 'dismiss_completed' })
  const today = new Date().toDateString()
  const smallStepToday = state.events.filter((e) => e.taskId === task.id && e.kind === 'progress' && new Date(e.at).toDateString() === today).at(-1)
  const [more, setMore] = useState(false)
  const enough = low && !!smallStepToday && !more && !adjust && !isProcessing && !showStuck
  const tinyStep = steps[nextStep === -1 ? 0 : nextStep]
  const doTinyStep = () => {
    if (nextStep !== -1) dispatch({ type: 'toggle_step', taskId: task.id, index: nextStep })
    dispatch({ type: 'log_progress', taskId: task.id, title: `小步推进：${tinyStep ?? '看了一眼要做什么'}`, detail: task.title })
    showToast('推进了一小步，已记到进展')
  }

  return (
    <section className="card relative animate-rise overflow-hidden" aria-labelledby="action-title">
      <div className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {stage ? (
            <Pill tone="accent">
              阶段 {stageIdx + 1}/{state.stages.length} · {stage.title}
            </Pill>
          ) : (
            <Pill tone="neutral">当前行动</Pill>
          )}
          {stageList.length > 1 && (
            <span className="inline-flex items-center gap-2 text-[12px] tabular-nums text-muted">
              <StageTrail list={stageList} currentId={task.id} />
              {stageCaption(doneInStage, stageList.length, stageIdx)}
              <span className="sr-only">
                （本阶段 {stageList.length} 件，已完成 {doneInStage} 件）
              </span>
            </span>
          )}
          <span className="ml-auto flex items-center gap-2">
            {task.status === 'draft' && !resume && (
              <Pill tone="sky" icon={<FileText size={12} aria-hidden />}>
                草稿已准备
              </Pill>
            )}
            {adjust && (
              <Pill tone="amber" icon={adjust.reason === 'too_big' ? <Scissors size={12} aria-hidden /> : <Lightbulb size={12} aria-hidden />}>
                {adjust.reason === 'too_big' ? '已缩小' : '有示例'}
              </Pill>
            )}
          </span>
        </div>

        {resume && artifact && (
          <ResumeBlock name={RESUME_NAME[task.aiKind ?? ''] ?? '草稿'} text={artifact.after} cursor={resume.cursor} at={resume.at} where={resume.where} />
        )}

        <h2 id="action-title" className="wrap-anywhere mt-4 text-balance text-[21px] font-semibold leading-snug tracking-tight text-ink sm:text-[23px]">
          {displayTitle}
        </h2>
        {adjust?.reason === 'too_big' && (
          <p className="mt-1 text-[13px] leading-relaxed text-muted">先做这一小步。原来的“{task.title}”还在，做完再接着。</p>
        )}

        {!adjust && !low && task.why && <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{task.why}</p>}

        {!adjust && task.progress && task.progress.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {task.progress.map((p) => (
              <Pill key={p} tone="outline" icon={<Check size={12} className="text-accent" aria-hidden />}>
                {p}
              </Pill>
            ))}
          </div>
        )}

        {enough ? (
          <div className="mt-4 animate-rise rounded-xl bg-accent-softer px-4 py-3">
            <p className="flex items-center gap-1.5 text-[14px] font-medium text-accent-ink">
              <CircleCheck size={16} aria-hidden className="text-accent" /> 今天推进了一小步，够了
            </p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-accent-ink-2">
              {smallStepToday!.title}。剩下的明天再说，进度都记着。
            </p>
          </div>
        ) : (
          !adjust &&
          low && (
            <div className="mt-4 rounded-xl bg-amber-soft/70 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-amber-ink">
                <BatteryLow size={15} aria-hidden /> 今天只做最小的一步，也算推进
              </p>
              <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[15px] leading-relaxed text-ink">{tinyStep ?? '花 5 分钟看一眼要做什么'}</p>
                <Button size="sm" variant="secondary" className="shrink-0 self-start sm:self-auto" icon={<Check size={14} aria-hidden />} onClick={doTinyStep}>
                  这一步做完了
                </Button>
              </div>
            </div>
          )
        )}

        {!adjust && !low && (task.criteria || task.estimate) && (
          <div className="mt-5 rounded-xl bg-accent-softer px-4 py-3 text-[14px] leading-relaxed">
            {task.criteria && (
              <p className="flex items-start gap-3">
                <Target size={17} aria-hidden className="mt-0.5 shrink-0 text-accent" />
                <span>
                  <span className="font-medium text-accent-ink">完成标准</span>
                  <span className="mx-1.5 text-accent-ink-2">·</span>
                  <span className="text-accent-ink-2">{task.criteria}</span>
                </span>
              </p>
            )}
            {task.estimate && (
              <p className={cx('flex items-center gap-1.5 text-[13px] text-accent-ink-2', task.criteria && 'mt-1 pl-[29px]')}>
                <Clock3 size={14} aria-hidden /> {task.estimate}
              </p>
            )}
          </div>
        )}

        {!adjust && startedSteps && !low && (
          <p className="mt-3 flex items-start gap-2 text-[13px] leading-relaxed text-ink-2">
            <ListChecks size={15} aria-hidden className="mt-0.5 shrink-0 text-accent" />
            <span>
              已做 {stepsDone.size}/{steps.length} 步 · 下一步：{steps[nextStep]}
            </span>
          </p>
        )}

        {/* 交互区 */}
        <div ref={panelRef} tabIndex={-1} className="mt-6 outline-none">
          {isProcessing ? (
            <ProcessingSteps task={task} step={processing!.step} />
          ) : showStuck ? (
            <StuckQuestion task={task} />
          ) : adjust?.reason === 'too_big' ? (
            <ShrinkPanel task={task} />
          ) : adjust?.reason === 'unknown' ? (
            <ExamplePanel task={task} />
          ) : enough ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                data-primary-action
                variant="primary"
                size="lg"
                className="w-full sm:w-auto"
                icon={<Moon size={17} aria-hidden />}
                onClick={() => {
                  decideRest('stop')
                  focusPrimary()
                }}
              >
                好，今天到这里
              </Button>
              <Button variant="ghost" className="max-sm:bg-sunken/70" onClick={() => setMore(true)}>
                再做一点
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              {resume ? (
                <Button
                  data-primary-action
                  variant="primary"
                  size="lg"
                  className="w-full sm:w-auto"
                  icon={<PenLine size={17} aria-hidden />}
                  onClick={() => openArtifact(resume.artifactId, resume.cursor)}
                >
                  接着改
                </Button>
              ) : task.status === 'draft' && artifact ? (
                <Button
                  data-primary-action
                  variant="primary"
                  size="lg"
                  className="w-full sm:w-auto"
                  icon={<FileText size={17} aria-hidden />}
                  onClick={() => openArtifact(artifact.id)}
                >
                  查看草稿
                </Button>
              ) : (
                <Button
                  data-primary-action
                  variant="primary"
                  size="lg"
                  className="w-full sm:w-auto"
                  icon={<Sparkles size={17} aria-hidden />}
                  onClick={() => runAI(task.id)}
                >
                  {task.note || task.progress?.length ? 'AI 接着帮我写完' : 'AI 先帮我做'}
                </Button>
              )}
              <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-1">
                {resume ? (
                  <Button variant="ghost" className="max-sm:bg-sunken/70" onClick={() => runAI(task.id)} icon={<Sparkles size={15} aria-hidden />}>
                    AI 帮我改完
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    className="max-sm:bg-sunken/70"
                    icon={<ListChecks size={15} aria-hidden />}
                    onClick={() => {
                      leaveBanner()
                      setNowView('self')
                    }}
                  >
                    {startedSteps ? `接着做第 ${nextStep + 1} 步` : '我来做'}
                  </Button>
                )}
                <Button
                  variant={low ? 'soft' : 'ghost'}
                  className={cx(!low && 'max-sm:bg-sunken/70')}
                  icon={<LifeBuoy size={15} aria-hidden />}
                  onClick={() => {
                    leaveBanner()
                    setStuckFor(task.id)
                  }}
                >
                  卡住了
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function ResumeBlock({ name, text, cursor, at, where }: { name: string; text: string; cursor: number; at: string; where: string }) {
  const before = text.slice(0, cursor)
  const after = text.slice(cursor)
  const shownBefore = before.split('\n').slice(-3).join('\n')
  return (
    <div className="mt-4 rounded-xl bg-canvas p-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
        <History size={15} aria-hidden className="text-accent" />
        <span className="font-semibold text-ink">接上次：{name}已改到这里</span>
        <span className="text-muted">· 停在{where} · {relativeTime(at)}</span>
      </p>
      <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-[14px] leading-relaxed text-ink-2">
        {shownBefore}
        <span className="mx-px inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-pulse bg-accent" role="img" aria-label="上次停在这里" />
        <span className="text-muted">{after.split('\n').slice(0, 2).join('\n')}</span>
      </pre>
    </div>
  )
}

function ProcessingSteps({ task, step }: { task: Task; step: number }) {
  const labels = stepsFor(task)
  return (
    <div className="rounded-xl bg-canvas p-4" role="status" aria-live="polite">
      <p className="mb-3 flex items-center gap-2 text-[13px] font-medium text-accent-ink">
        <Sparkles size={15} aria-hidden className="text-accent" /> AI 正在准备草稿…
      </p>
      <ol className="space-y-2.5">
        {labels.map((l, i) => {
          const done = i < step
          const active = i === step
          return (
            <li key={l} className={cx('flex items-center gap-3 text-[14px] transition-colors', done ? 'text-ink-2' : active ? 'text-ink' : 'text-muted')}>
              <span className="flex h-5 w-5 items-center justify-center">
                {done ? (
                  <CircleCheck size={18} aria-hidden className="animate-pop text-accent" />
                ) : active ? (
                  <span className="text-accent">
                    <Spinner size={16} />
                  </span>
                ) : (
                  <span className="h-2 w-2 rounded-full bg-ghost" />
                )}
              </span>
              {l}
              {done && <span className="sr-only">（已完成）</span>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/* ---------------- 卡住了 ---------------- */

const STUCK_OPTIONS: { id: StuckReason; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: 'unknown', label: '不知道怎么做', hint: '给我一个能直接改的开头', icon: <Lightbulb size={18} aria-hidden /> },
  { id: 'too_big', label: '这一步太大', hint: '缩小成几分钟能做完的一步', icon: <Scissors size={18} aria-hidden /> },
  { id: 'distracted', label: '容易分心', hint: '换成只有这件事的简洁视图', icon: <Focus size={18} aria-hidden /> },
]

export function useApplyStuck() {
  const { state, dispatch, setStuckFor, setFocusMode, say } = useApp()
  return (taskId: string, reason: StuckReason) => {
    const task = taskById(state, taskId)
    if (!task) return
    const adjust = stuckAdjust(task, reason)
    dispatch({ type: 'set_adjust', taskId, adjust })
    setStuckFor(null)
    if (reason === 'distracted') {
      setFocusMode(true)
      say('切到简洁视图了，只留当前这件事和下一小步。想回来随时点“退出”。')
    } else if (reason === 'too_big') {
      say(`那先只做一小步：${adjust.reason === 'too_big' ? adjust.smallTitle : ''}。确认几项信息就行，不用改写。`)
    } else {
      say('给了一个可以直接改的开头，在首页卡片里。改成你的说法，保存就算推进了一步。')
    }
  }
}

function StuckQuestion({ task }: { task: Task }) {
  const { setStuckFor } = useApp()
  const apply = useApplyStuck()
  return (
    <div className="animate-rise border-t border-line pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-semibold text-ink">现在主要卡在哪里？</h3>
          <p className="mt-0.5 text-[13px] text-muted">选一个最接近的就行，不用解释。</p>
        </div>
        <IconButton
          label="不卡了，收起"
          onClick={() => {
            setStuckFor(null)
            focusPrimary()
          }}
        >
          <X size={18} aria-hidden />
        </IconButton>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {STUCK_OPTIONS.map((o) => (
          <button
            key={o.id}
            onClick={() => apply(task.id, o.id)}
            className="group flex min-h-14 items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left transition-[border-color,box-shadow,background] hover:border-accent/50 hover:shadow-[var(--shadow-card)] active:bg-accent-softer sm:flex-col sm:items-start sm:gap-2 sm:px-3"
          >
            <span className="text-accent-ink-2 transition-colors group-hover:text-accent">{o.icon}</span>
            <span>
              <span className="block text-[15px] font-medium text-ink sm:text-[14px]">{o.label}</span>
              <span className="block text-[12px] leading-snug text-muted">{o.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ShrinkPanel({ task }: { task: Task }) {
  const { dispatch, showToast, say } = useApp()
  const adj = task.adjust?.reason === 'too_big' ? task.adjust : null
  const [ok, setOk] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [showSource, setShowSource] = useState(false)
  if (!adj) return null
  const total = adj.checks.length
  const all = ok.size === total

  const toggle = (id: string) =>
    setOk((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const backToRow = (id: string) => requestAnimationFrame(() => document.getElementById(`check-btn-${id}`)?.focus())
  const saveEdit = (id: string) => {
    const v = draft.trim()
    if (v) dispatch({ type: 'update_check', taskId: task.id, checkId: id, value: v })
    setOk((prev) => new Set(prev).add(id))
    setEditing(null)
    backToRow(id)
  }
  const confirm = () => {
    dispatch({ type: 'confirm_small', taskId: task.id })
    showToast('推进了一小步，已记到进展')
    say('确认好了，这就是一个具体推进。接下来可以让我按这些信息写草稿，也可以先停在这里。')
    focusPrimary()
  }

  return (
    <div className="animate-rise">
      <p className="text-[14px] leading-relaxed text-ink-2">看一眼下面几项对不对，不用改写。对的点一下，不对就直接改。</p>
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line">
        {adj.checks.map((c) => {
          const checked = ok.has(c.id)
          if (editing === c.id) {
            return (
              <li key={c.id} className="bg-surface px-4 py-2.5">
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    saveEdit(c.id)
                  }}
                >
                  <label htmlFor={`check-${c.id}`} className="w-[72px] shrink-0 text-[13px] text-muted">
                    {c.label}
                  </label>
                  <input
                    id={`check-${c.id}`}
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Escape') return
                      e.stopPropagation()
                      setEditing(null)
                      backToRow(c.id)
                    }}
                    className="h-10 min-w-0 flex-1 rounded-lg border border-accent/50 bg-surface px-3 text-[14px] outline-none ring-4 ring-accent/10"
                  />
                  <Button type="submit" size="sm" variant="soft">
                    好了
                  </Button>
                </form>
              </li>
            )
          }
          return (
            <li key={c.id} className={cx('flex items-center gap-1 pr-2 transition-colors', checked ? 'bg-accent-softer' : 'bg-surface')}>
              <button
                id={`check-btn-${c.id}`}
                role="checkbox"
                aria-checked={checked}
                onClick={() => toggle(c.id)}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left"
              >
                <span
                  className={cx(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-[1.5px] transition-colors',
                    checked ? 'border-accent bg-accent text-white' : 'border-control bg-surface',
                  )}
                >
                  {checked && <Check size={13} strokeWidth={3} aria-hidden />}
                </span>
                <span className="w-[72px] shrink-0 text-[13px] text-muted">{c.label}</span>
                <span className="min-w-0 text-[14px] text-ink">{c.value}</span>
              </button>
              <button
                onClick={() => {
                  setDraft(c.value)
                  setEditing(c.id)
                }}
                aria-label={`修改${c.label}`}
                className="hit shrink-0 rounded-md px-2 py-1 text-[13px] font-medium text-accent hover:bg-accent-soft"
              >
                改
              </button>
            </li>
          )
        })}
      </ul>

      {adj.source && (
        <div className="mt-2">
          <button
            onClick={() => setShowSource((v) => !v)}
            aria-expanded={showSource}
            className="hit inline-flex items-center gap-1 rounded-md py-1 text-[13px] text-muted hover:text-ink"
          >
            <ChevronDown size={14} aria-hidden className={cx('transition-transform', showSource && 'rotate-180')} />
            {showSource ? '收起原文' : '对照简历里现在的这段'}
          </button>
          {showSource && (
            <p className="mt-1.5 animate-fade-in whitespace-pre-wrap rounded-xl bg-sunken/70 px-4 py-3 text-[13px] leading-relaxed text-ink-2">{adj.source}</p>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button data-primary-action variant="primary" size="lg" className="w-full sm:w-auto" icon={<Check size={17} aria-hidden />} onClick={confirm}>
          {all ? '都确认了，记一小步' : '没问题，记一小步'}
        </Button>
        <span className="text-center text-[12px] tabular-nums text-muted sm:text-left">{ok.size ? `已核对 ${ok.size}/${total}` : '逐项点一下，或者直接确认'}</span>
        <Button
          variant="ghost"
          className="sm:ml-auto"
          icon={<Undo2 size={15} aria-hidden />}
          onClick={() => {
            dispatch({ type: 'set_adjust', taskId: task.id, adjust: undefined })
            focusPrimary()
          }}
        >
          换回原来的行动
        </Button>
      </div>
    </div>
  )
}

function ExamplePanel({ task }: { task: Task }) {
  const { dispatch, showToast, say } = useApp()
  const adj = task.adjust?.reason === 'unknown' ? task.adjust : null
  const [text, setText] = useState(adj?.example ?? '')
  if (!adj) return null
  return (
    <div className="animate-rise">
      <p className="flex items-start gap-2 text-[14px] leading-relaxed text-ink-2">
        <Lightbulb size={16} aria-hidden className="mt-0.5 shrink-0 text-amber-ink" />
        {adj.hint}
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="mt-3 w-full resize-y rounded-xl border border-line-strong bg-surface px-4 py-3 text-[15px] leading-relaxed text-ink outline-none transition-[border-color,box-shadow] focus:border-accent/60 focus:ring-4 focus:ring-accent/10"
        aria-label="可直接修改的示例"
      />
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          data-primary-action
          variant="primary"
          size="lg"
          className="w-full sm:w-auto"
          disabled={!text.trim()}
          icon={<Check size={17} aria-hidden />}
          onClick={() => {
            dispatch({ type: 'save_example', taskId: task.id, text })
            showToast('第一段已保存，已记到进展')
            say('第一段有了。剩下的可以让我接着写，你再改。')
            focusPrimary()
          }}
        >
          保存这一段
        </Button>
        <Button
          variant="ghost"
          icon={<Undo2 size={15} aria-hidden />}
          onClick={() => {
            dispatch({ type: 'set_adjust', taskId: task.id, adjust: undefined })
            focusPrimary()
          }}
        >
          换回原来的行动
        </Button>
      </div>
    </div>
  )
}

/* ---------------- 完成后的反馈 ---------------- */

const FEEDBACK_REPLY = {
  ok: '好，就按这个节奏。',
  hard: '收到。下一件今天先做前两步就好，约 10 分钟。也可以先休息，进度都记着。',
  more: '下一件已经在下面了，准备好就开始。',
} as const

function CompletedBanner() {
  const { state, dispatch, openArtifact, say, canUndo, undoComplete } = useApp()
  const jc = state.justCompleted!
  const task = taskById(state, jc.taskId)
  if (!task) return null
  const stage = state.stages.find((s) => s.id === task.stageId)
  const list = stage ? stageTasks(state, stage.id) : []
  const done = list.filter((t) => t.status === 'done').length
  const summary = !stage ? '已记到进展' : afterDoneCaption(done, list.length, stage.title)

  const feedback = (level: 'ok' | 'hard' | 'more') => {
    dispatch({ type: 'feedback', level })
    say(FEEDBACK_REPLY[level])
    focusPrimary()
  }

  return (
    <section aria-labelledby="done-title" className="mb-4 animate-rise rounded-2xl border border-accent/25 bg-accent-softer p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <CheckDraw />
        <div className="min-w-0 flex-1">
          <h2 id="done-title" className="text-[15px] font-semibold leading-snug text-ink">
            完成了：{task.title}
          </h2>
          <p className="mt-0.5 text-[13px] text-accent-ink-2">
            {summary}
            {jc.artifactId && (
              <>
                <span className="mx-1.5">·</span>
                <button onClick={() => openArtifact(jc.artifactId!)} className="hit font-medium text-accent-ink underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent">
                  查看成果
                </button>
              </>
            )}
          </p>
          {jc.feedback ? (
            <p className="mt-3 animate-fade-in text-[13px] leading-relaxed text-accent-ink">{FEEDBACK_REPLY[jc.feedback]}</p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="这一步感觉怎么样">
              <span className="text-[13px] text-accent-ink-2">这一步感觉：</span>
              {(
                [
                  ['ok', '刚好'],
                  ['hard', '有点吃力'],
                  ['more', '还有余力'],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => feedback(k)}
                  className="h-8 rounded-full border border-accent/20 bg-surface px-3 text-[13px] text-ink-2 transition-colors hover:border-accent/50 hover:text-ink touch:h-11 touch:px-4"
                >
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="-mr-1 -mt-1 flex shrink-0 items-center">
          {canUndo(task.id) && (
            <button
              onClick={() => {
                undoComplete()
                focusPrimary()
              }}
              className="hit rounded-md px-2 py-1 text-[13px] font-medium text-accent-ink hover:bg-accent-soft"
            >
              撤销
            </button>
          )}
          <IconButton
            label="收起"
            onClick={() => {
              dispatch({ type: 'dismiss_completed' })
              focusPrimary()
            }}
          >
            <X size={16} aria-hidden />
          </IconButton>
        </div>
      </div>
    </section>
  )
}

function AllDone() {
  const { go } = useApp()
  return (
    <section className="card p-8 text-center">
      <CircleCheck size={28} aria-hidden className="mx-auto text-accent" />
      <h2 className="mt-3 text-[18px] font-semibold">当前规划里的行动都完成了</h2>
      <p className="mt-1 text-[14px] text-muted">可以休息一下，或者看看这一路做了什么。</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button variant="secondary" onClick={() => go('progress')}>
          看看做了什么
        </Button>
        <Button variant="ghost" onClick={() => go('plan')}>
          查看规划
        </Button>
      </div>
    </section>
  )
}

/* ---------------- 辅助信息 ---------------- */

function SideInfo({ quiet }: { quiet: boolean }) {
  const { state, openTask } = useApp()
  const [expanded, setExpanded] = useState(false)
  const items = attentionItems(state).slice(0, 2)
  const life =
    state.tasks.find((t) => t.id === 'm-night' && t.bucket === 'maintain') ?? state.tasks.find((t) => t.bucket === 'maintain' && t.rest)

  useEffect(() => setExpanded(false), [quiet])

  const attention = (
    <div className="p-4 sm:p-5">
      <h3 className="mb-1.5 flex items-center gap-2 text-[14px] font-semibold">
        <CalendarClock size={16} aria-hidden className="text-amber-ink" />
        有期限的事
      </h3>
      {items.length === 0 ? (
        <p className="py-2 text-[13px] text-muted">近期没有带期限的事。</p>
      ) : (
        <ul className="-mx-2">
          {items.map((t) => {
            const n = daysFromToday(t.due!)
            return (
              <li key={t.id}>
                <button onClick={() => openTask(t.id)} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-canvas">
                  <span
                    className={cx(
                      'w-[64px] shrink-0 rounded-md px-1.5 py-0.5 text-center text-[12px] font-medium',
                      n <= 3 ? 'bg-amber-soft text-amber-ink' : 'bg-sunken text-ink-2',
                    )}
                  >
                    {dueLabel(t.due!).replace(/（.*）/, '')}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{t.title}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )

  const lifeBlock = life && (
    <div className="p-4 sm:p-5">
      <h3 className="mb-1.5 flex items-center gap-2 text-[14px] font-semibold">
        <Moon size={16} aria-hidden className="text-sky-ink" />
        维持安排
      </h3>
      <button onClick={() => openTask(life.id)} className="-mx-2 flex min-h-11 w-[calc(100%+16px)] flex-col rounded-lg px-2 py-1.5 text-left hover:bg-canvas">
        <span className="text-[14px] text-ink">{life.title}</span>
        <span className="mt-0.5 text-[12px] text-muted">{life.schedule} · 留给休息</span>
      </button>
    </div>
  )

  if (quiet) {
    return (
      <div className="mt-5 space-y-3">
        {lifeBlock && <section className="card">{lifeBlock}</section>}
        {items.length > 0 &&
          (expanded ? (
            <section className="card animate-fade-in">{attention}</section>
          ) : (
            <button onClick={() => setExpanded(true)} className="min-h-11 w-full rounded-xl px-1 text-left text-[13px] text-muted hover:text-ink">
              还有 {items.length} 件有期限的事先收着，不会丢 · <span className="font-medium text-accent">展开看看</span>
            </button>
          ))}
      </div>
    )
  }

  return (
    <section
      aria-label="顺便留意"
      className="card mt-5 grid grid-cols-1 divide-y divide-line sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] sm:divide-x sm:divide-y-0"
    >
      {attention}
      {lifeBlock}
    </section>
  )
}

/* ---------------- 我来做 ---------------- */

function SelfDoView({ task }: { task: Task }) {
  const { state, dispatch, setNowView, setStuckFor, say, completeWithUndo } = useApp()
  const [note, setNote] = useState('')
  const [showNote, setShowNote] = useState(false)
  useBackHandler(true, () => setNowView('home'))
  const stage = state.stages.find((s) => s.id === task.stageId)
  const steps = task.steps ?? ['想清楚这件事要得到什么', '做第一步', '检查一下结果']
  const done = new Set(task.stepsDone ?? [])
  const nextIdx = steps.findIndex((_, i) => !done.has(i))
  const adjust = task.adjust?.reason === 'too_big' ? task.adjust : undefined
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => headingRef.current?.focus({ preventScroll: true }), [])

  const complete = () => {
    const withNote = !!note.trim()
    completeWithUndo({ type: 'complete_task', taskId: task.id, note: withNote ? note : undefined }, task.id)
    setNowView('home')
    say(`记下了：“${task.title}”已完成。${withNote ? '你写的版本存进了进展。' : ''}`)
  }

  return (
    <div className="mx-auto w-full max-w-[640px] animate-fade-in">
      <button onClick={() => setNowView('home')} className="hit mb-5 inline-flex items-center gap-1.5 rounded-lg py-1 text-[13px] text-muted hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> 回到首页
      </button>

      <h1 ref={headingRef} tabIndex={-1} className="text-balance text-[24px] font-semibold leading-snug tracking-tight outline-none">
        {adjust ? adjust.smallTitle : task.title}
      </h1>
      <p className="mt-1 text-[13px] text-muted">
        {stage ? `“${stage.title}”阶段` : '当前行动'}
        {task.estimate ? ` · ${task.estimate}` : ''}
      </p>

      <section className="mt-6" aria-labelledby="steps-title">
        <h2 id="steps-title" className="mb-2 text-[13px] font-medium text-ink-2">
          一步一步来，做完一步点一下
        </h2>
        <ol className="space-y-2">
          {steps.map((s, i) => {
            const isDone = done.has(i)
            const isNext = i === nextIdx
            return (
              <li key={s}>
                <button
                  role="checkbox"
                  aria-checked={isDone}
                  onClick={() => dispatch({ type: 'toggle_step', taskId: task.id, index: i })}
                  className={cx(
                    'flex min-h-14 w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors',
                    isDone ? 'border-line bg-canvas text-muted' : isNext ? 'border-accent/50 bg-surface shadow-[var(--shadow-card)]' : 'border-line bg-surface hover:border-line-strong',
                  )}
                >
                  <span
                    className={cx(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] text-[11px] tabular-nums',
                      isDone ? 'border-accent bg-accent text-white' : isNext ? 'border-accent text-accent' : 'border-control text-muted',
                    )}
                  >
                    {isDone ? <Check size={12} strokeWidth={3} aria-hidden /> : i + 1}
                  </span>
                  <span className={cx('flex-1 text-[15px] leading-relaxed', isDone && 'line-through decoration-ghost')}>{s}</span>
                  {isNext && (
                    <span className="mt-0.5 shrink-0 rounded-full bg-accent-soft px-2 text-[12px] font-medium leading-6 text-accent-ink">
                      {stepTag(i, steps.length)}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ol>
      </section>

      {task.criteria && (
        <p className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-muted">
          <Target size={15} aria-hidden className="mt-0.5 shrink-0" /> 完成标准：{task.criteria}
        </p>
      )}

      <div className="mt-6">
        {showNote ? (
          <div className="animate-rise">
            <label htmlFor="self-note" className="text-[13px] font-medium text-ink-2">
              附上你写的内容（可选，会存进进展）
            </label>
            <textarea
              id="self-note"
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="粘贴你改好的段落"
              className="mt-2 w-full resize-y rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-[15px] outline-none focus:border-accent/60 focus:ring-4 focus:ring-accent/10"
            />
          </div>
        ) : (
          <button onClick={() => setShowNote(true)} className="hit inline-flex items-center gap-1.5 rounded-md py-1 text-[13px] font-medium text-accent hover:underline">
            <PenLine size={14} aria-hidden /> 附上我写的内容（可选）
          </button>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button data-primary-action variant="primary" size="lg" className="w-full sm:w-auto" icon={<Check size={17} aria-hidden />} onClick={complete}>
          完成了
        </Button>
        <Button
          variant="ghost"
          icon={<LifeBuoy size={15} aria-hidden />}
          onClick={() => {
            setNowView('home')
            setStuckFor(task.id)
          }}
        >
          卡住了
        </Button>
      </div>
      <p className="mt-6 text-[12px] text-muted">不计时，按你的节奏来。离开后再回来，勾选的步骤都会保留。</p>
    </div>
  )
}
