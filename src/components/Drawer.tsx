import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlarmClock,
  Archive,
  ArrowDown,
  ArrowUp,
  Ellipsis,
  Plus,
  Trash2,
  CalendarClock,
  Check,
  ChevronDown,
  CircleCheck,
  Copy,
  FileText,
  Footprints,
  Info,
  ListChecks,
  Pencil,
  Repeat,
  Sparkles,
  Target,
  X,
} from 'lucide-react'
import type { Bucket, Task } from '../data/types'
import { BUCKET_LABEL, MOVE_VERB, artifactById, focusTask, parseSteps, planAddNote, stageTasks, taskById, uid, useApp, useBackHandler } from '../state/store'
import { adoptLabel, breakdownFor, withStarter } from '../lib/mockAI'
import { dueLabel, relativeTime } from '../lib/dates'
import { planLabel } from '../lib/plan'
import { compareDraft } from '../lib/diff'
import { useDialog, useMedia, useMenu, useSheetDrag } from '../lib/hooks'
import { Button, CategoryTag, IconButton, Pill, cx, menuItem, menuPanel } from './ui'

type Drag = ReturnType<typeof useSheetDrag>

export function Drawer() {
  const { drawer, closeDrawer } = useApp()
  const ref = useRef<HTMLDivElement>(null)
  const mobile = useMedia('(max-width: 639px)')
  const open = !!drawer
  useDialog(
    ref,
    open,
    closeDrawer,
    () => ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current?.querySelector<HTMLElement>('#drawer-title'),
  )
  useBackHandler(open, closeDrawer)
  const drag = useSheetDrag(closeDrawer, mobile)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!drawer) return null
  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 animate-fade-in bg-ink/30" onClick={closeDrawer} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className={cx(
          'absolute flex flex-col bg-surface outline-none',
          'inset-x-0 bottom-0 top-[max(24px,6dvh)] animate-sheet rounded-t-2xl shadow-[var(--shadow-raised)]',
          'sm:inset-y-0 sm:left-auto sm:right-0 sm:top-0 sm:w-[540px] sm:animate-drawer sm:rounded-none sm:shadow-[var(--shadow-drawer)]',
          !drag.dragging && 'transition-transform duration-200',
        )}
        style={drag.dy ? { transform: `translateY(${drag.dy}px)` } : undefined}
      >
        {drawer.type === 'artifact' ? (
          <ArtifactView key={drawer.id} id={drawer.id} cursor={drawer.cursor} drag={drag} />
        ) : (
          <TaskView key={`${drawer.id}${drawer.editSteps ? '-edit' : ''}`} id={drawer.id} editSteps={!!drawer.editSteps} drag={drag} />
        )}
      </div>
    </div>
  )
}

function DrawerHeader({ icon, label, onClose, drag }: { icon: ReactNode; label: ReactNode; onClose: () => void; drag: Drag }) {
  return (
    <div {...drag.handlers} className="touch-none select-none sm:touch-auto sm:select-auto">
      <div className="flex justify-center pb-1 pt-2 sm:hidden" aria-hidden>
        <span className="h-1 w-10 rounded-full bg-line-strong" />
      </div>
      <div className="flex items-center gap-2 border-b border-line px-5 py-2 sm:px-6 sm:py-3">
        <span className="text-muted">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{label}</span>
        <IconButton label="关闭" onClick={onClose}>
          <X size={18} aria-hidden />
        </IconButton>
      </div>
    </div>
  )
}

/* ---------------- 成果查看与编辑 ---------------- */

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

/** 光标所在位置的说法：“第 2 条”或“第 3 行” */
function whereLabel(text: string, pos: number) {
  const all = text.split('\n')
  const lineIdx = text.slice(0, pos).split('\n').length - 1
  const isBullet = (l = '') => /^\s*[·•-]/.test(l)
  if (isBullet(all[lineIdx])) return `第 ${all.slice(0, lineIdx + 1).filter((l) => isBullet(l)).length} 条`
  return `第 ${lineIdx + 1} 行`
}

function ArtifactView({ id, cursor, drag }: { id: string; cursor?: number; drag: Drag }) {
  const { state, dispatch, closeDrawer, showToast, say, go, completeWithUndo } = useApp()
  const art = artifactById(state, id)
  const ta = useRef<HTMLTextAreaElement>(null)
  const [copied, setCopied] = useState(false)
  const [showBefore, setShowBefore] = useState(() => !window.matchMedia('(max-width: 639px)').matches)
  // 有原文的改写类成果，可以切到“看改动”，逐处看 AI 改了什么
  const [view, setView] = useState<'edit' | 'diff'>('edit')
  const caret = useRef<number | null>(cursor ?? null)
  const dirty = useRef(false)
  const adopted = useRef(false)
  const latest = useRef({ art, focusId: state.focusTaskId })
  latest.current = { art, focusId: state.focusTaskId }

  const autosize = () => {
    const el = ta.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }
  useLayoutEffect(autosize, [art?.after, view])

  useEffect(() => {
    if (cursor === undefined || !ta.current) return
    const el = ta.current
    const t = window.setTimeout(() => {
      el.focus()
      el.setSelectionRange(cursor, cursor)
    }, 320)
    return () => clearTimeout(t)
  }, [cursor])

  // 改过草稿就记住停在哪里（边改边记、切走页面时也记），回到首页会显示“接上次”
  const saveTimer = useRef<number | undefined>(undefined)
  const saveResume = useCallback(() => {
    window.clearTimeout(saveTimer.current)
    const { art: a, focusId } = latest.current
    if (!a || adopted.current || !dirty.current || a.status !== 'draft' || a.taskId !== focusId) return
    const pos = caret.current ?? a.after.length
    dispatch({
      type: 'set_resume',
      resume: { taskId: a.taskId, artifactId: a.id, at: new Date().toISOString(), where: whereLabel(a.after, pos), cursor: pos },
    })
  }, [dispatch])
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && saveResume()
    window.addEventListener('pagehide', saveResume)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', saveResume)
      document.removeEventListener('visibilitychange', onHide)
      saveResume()
    }
  }, [saveResume])

  if (!art) return null
  const task = taskById(state, art.taskId)
  const draft = art.status === 'draft'
  // 采用之后算什么：成果 = 完成；拆解 = 写进步骤；消息 = 完成“写消息”这一步
  const use = art.use ?? (art.title.startsWith('拆解：') ? 'steps' : 'result')

  const adoptPart = async () => {
    if (adopted.current) return
    adopted.current = true
    window.clearTimeout(saveTimer.current)
    const snap = state
    const undo = () => {
      dispatch({ type: 'load', state: snap })
      showToast('已撤销')
    }
    if (use === 'step') {
      // 消息还要用户自己发：顺手复制好，少一步操作
      const ok = await copyText(art.after)
      dispatch({ type: 'adopt', artifactId: art.id })
      closeDrawer()
      go('now')
      showToast(ok ? '消息已复制。发出去之后，回来点“完成了”' : '记下了：消息写好了。发出去之后，回来点“完成了”', undo)
      say('消息写好了，记成完成了一步。复制后自己发出去，发完回来点“完成了”。')
      return
    }
    const steps = parseSteps(art.after)
    dispatch({ type: 'adopt', artifactId: art.id })
    closeDrawer()
    go('now')
    showToast(`已写进步骤：一共 ${steps.length} 步`, undo)
    say(`好，“${task?.title ?? art.title}”拆成了 ${steps.length} 步。第一步：${steps[0] ?? ''}。这还不算完成，做完回来点“完成了”。`)
  }

  const adopt = () => {
    if (use !== 'result') return void adoptPart()
    adopted.current = true
    window.clearTimeout(saveTimer.current)
    const f = focusTask(state)
    const wasFocus = f?.id === art.taskId
    let next: Task | undefined
    if (wasFocus && task?.stageId) {
      next = stageTasks(state, task.stageId).find((t) => t.status !== 'done' && t.id !== task.id)
      if (!next) {
        const idx = state.stages.findIndex((s) => s.id === task.stageId)
        const ns = state.stages[idx + 1]
        if (ns) next = stageTasks(state, ns.id).find((t) => t.status !== 'done')
      }
    }
    completeWithUndo({ type: 'adopt', artifactId: art.id }, art.taskId)
    closeDrawer()
    go('now')
    say(`已采用这版，“${task?.title ?? art.title}”完成了，成果存进了进展。${next ? `下一步：“${next.title}”。` : ''}`, {
      label: '查看成果',
      kind: 'artifact',
      target: art.id,
    })
  }

  return (
    <>
      <DrawerHeader icon={<FileText size={16} aria-hidden />} label={draft ? 'AI 草稿' : '成果'} onClose={closeDrawer} drag={drag} />
      <div className="scroll-thin flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          {draft ? (
            <Pill tone="sky" icon={<FileText size={12} aria-hidden />}>
              {use === 'steps' ? '拆解建议 · 用了会写进步骤' : use === 'step' ? '消息草稿 · 不会替你发送' : '草稿 · 采用后才算完成'}
            </Pill>
          ) : (
            <Pill tone="accent" icon={<CircleCheck size={12} aria-hidden />}>
              已采用 · {relativeTime(art.updatedAt)}
            </Pill>
          )}
        </div>
        <h2 id="drawer-title" tabIndex={-1} className="wrap-anywhere mt-3 text-[19px] font-semibold leading-snug outline-none">
          {art.title}
        </h2>
        {art.context && <p className="mt-1 text-[13px] text-muted">{art.context}</p>}

        {art.before && (
          <section className="mt-5">
            <button
              onClick={() => setShowBefore((v) => !v)}
              aria-expanded={showBefore}
              className="hit inline-flex items-center gap-1 rounded-md py-0.5 text-[12px] font-medium text-muted hover:text-ink"
            >
              改写前的原文
              <ChevronDown size={14} aria-hidden className={cx('transition-transform', showBefore && 'rotate-180')} />
            </button>
            {showBefore && (
              <div className="mt-1.5 animate-fade-in whitespace-pre-wrap rounded-xl bg-sunken/70 px-4 py-3 text-[14px] leading-relaxed text-ink-2">{art.before}</div>
            )}
          </section>
        )}

        <section className="mt-5">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            {view === 'edit' ? (
              <label htmlFor="artifact-text" className="text-[12px] font-medium text-muted">
                {art.before ? '改写后' : use === 'steps' ? '一行一步' : '内容'}
                <span className="ml-1.5 font-normal">· 可以直接改，自动保存</span>
              </label>
            ) : (
              <p className="text-[12px] font-medium text-muted">
                和改写前对比
                <span className="ml-1.5 font-normal">· 只看不改，回到“编辑”可以改</span>
              </p>
            )}
            {cursor !== undefined && draft && view === 'edit' && <span className="text-[12px] text-accent-ink">光标已放在上次停下的位置</span>}
            {art.before && (
              <div role="group" aria-label="查看方式" className="ml-auto inline-flex rounded-lg bg-sunken p-0.5">
                {(
                  [
                    ['edit', '编辑'],
                    ['diff', '看改动'],
                  ] as const
                ).map(([v, l]) => (
                  <button
                    key={v}
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                    className={cx(
                      'hit h-7 rounded-md px-2.5 text-[12px] font-medium transition-colors touch:h-8',
                      view === v ? 'bg-surface text-ink shadow-[var(--shadow-card)]' : 'text-muted hover:text-ink',
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>
          {view === 'diff' && art.before ? (
            <DraftDiff before={art.before} after={art.after} />
          ) : (
          <textarea
            id="artifact-text"
            ref={ta}
            value={art.after}
            onChange={(e) => {
              dirty.current = true
              caret.current = e.currentTarget.selectionStart
              dispatch({ type: 'update_artifact', id: art.id, after: e.target.value })
              autosize()
              window.clearTimeout(saveTimer.current)
              saveTimer.current = window.setTimeout(saveResume, 800)
            }}
            onSelect={(e) => {
              caret.current = e.currentTarget.selectionStart
            }}
            spellCheck={false}
            className="block min-h-[160px] w-full resize-none rounded-xl border border-line-strong bg-surface px-4 py-3 text-[15px] leading-[1.75] text-ink outline-none transition-[border-color,box-shadow] focus:border-accent/60 focus:ring-4 focus:ring-accent/10"
          />
          )}
          {/* 新出现的数字在两种视图里都提示：很多人不会切到“看改动”就直接采用 */}
          {art.before && <NewNumbers before={art.before} after={art.after} draft={draft} />}
        </section>

        <section className="mt-4 flex items-start gap-2.5 rounded-xl bg-canvas px-4 py-3">
          <Info size={16} aria-hidden className="mt-0.5 shrink-0 text-muted" />
          <p className="text-[13px] leading-relaxed text-ink-2">
            <span className="font-medium text-ink">修改说明　</span>
            {art.note}
          </p>
        </section>
      </div>

      <div className="pb-safe flex items-center gap-2 border-t border-line bg-surface px-5 py-3 sm:px-6">
        <Button
          variant="secondary"
          icon={copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
          onClick={async () => {
            const ok = await copyText(art.after)
            setCopied(ok)
            showToast(ok ? '已复制到剪贴板' : '复制失败，请手动选择文本')
            window.setTimeout(() => setCopied(false), 1600)
          }}
        >
          {copied ? '已复制' : '复制文本'}
        </Button>
        {draft ? (
          <Button variant="primary" icon={<Check size={16} aria-hidden />} onClick={adopt} className="ml-auto flex-1 sm:flex-none">
            {adoptLabel(art)}
          </Button>
        ) : (
          <span className="ml-auto text-right text-[12px] leading-snug text-muted">只保存在本地，不会发送给任何人</span>
        )}
      </div>
    </>
  )
}

/**
 * 看改动：新增的部分用绿色底标出，删掉的部分加删除线。
 * 人容易直接相信 AI 给的结果（自动化偏差），把改动摊开，采用前才好核对有没有编出来的内容。
 */
function DraftDiff({ before, after }: { before: string; after: string }) {
  const r = useMemo(() => compareDraft(before, after), [before, after])
  const ins = (text: string, key: number) => (
    <ins key={key} className="rounded-[3px] bg-accent-soft px-0.5 text-accent-ink no-underline">
      <span className="sr-only">（新增：</span>
      {text}
      <span className="sr-only">）</span>
    </ins>
  )
  const del = (text: string, key: number) => (
    <del key={key} className="text-muted decoration-ghost">
      <span className="sr-only">（删掉：</span>
      {text}
      <span className="sr-only">）</span>
    </del>
  )
  return (
    <div className="animate-fade-in">
      <div className="wrap-anywhere whitespace-pre-wrap rounded-xl border border-line bg-surface px-4 py-3 text-[15px] leading-[1.75] text-ink">
        {r.mode === 'inline'
          ? r.ops.map((o, i) => (o.op === 0 ? <span key={i}>{o.text}</span> : o.op === 1 ? ins(o.text, i) : del(o.text, i)))
          : r.parts.map((p, i) => (p.added ? ins(p.text, i) : <span key={i}>{p.text}</span>))}
      </div>
      {r.mode === 'items' && r.removedItems.length > 0 && (
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          拿掉的：
          {r.removedItems.map((t, i) => (
            <span key={t}>
              {i > 0 && '、'}
              {del(t, i)}
            </span>
          ))}
        </p>
      )}
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-3 rounded-[3px] bg-accent-soft" />
          新增 {r.added} 处
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="relative h-3 w-4">
            <span className="absolute inset-x-0 top-1/2 h-px bg-muted" />
          </span>
          删掉 {r.removed} 处
        </span>
      </p>
    </div>
  )
}

/** 改写后出现、原文里没有的数字：AI 最容易在这里“编”，采用前提醒核对 */
function NewNumbers({ before, after, draft }: { before: string; after: string; draft: boolean }) {
  const numbers = useMemo(() => compareDraft(before, after).numbers, [before, after])
  if (!numbers.length) return null
  return (
    <p className="mt-2 rounded-lg bg-amber-soft/70 px-3 py-2 text-[13px] leading-relaxed text-amber-ink">
      新出现的数字：{numbers.join('、')}。原文里没有，{draft ? '采用前' : ''}请确认和实际一致。
    </p>
  )
}

/* ---------------- 事项详情 ---------------- */

const MOVE_OPTIONS: Exclude<Bucket, 'inbox'>[] = ['plan', 'maintain', 'later', 'archived']

function TaskView({ id, editSteps, drag }: { id: string; editSteps: boolean; drag: Drag }) {
  const { state, dispatch, closeDrawer, openArtifact, go, showToast, say, cancelPlan } = useApp()
  const task = taskById(state, id)
  const [editing, setEditing] = useState(editSteps)
  // 从首页“改步骤”打开时，焦点直接落在第一步；之后在抽屉里再点“改步骤”，由编辑器自己放焦点
  const firstEdit = useRef(editSteps)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(task?.title ?? '')
  const [editingDue, setEditingDue] = useState(false)
  if (!task) return null
  const stage = state.stages.find((s) => s.id === task.stageId)
  const art = artifactById(state, task.artifactId)
  const isFocus = state.focusTaskId === task.id
  const done = task.status === 'done'
  const recurring = task.bucket === 'maintain' && !!task.schedule

  const move = (b: Exclude<Bucket, 'inbox'>) => {
    const snap = state
    dispatch({ type: 'move', id: task.id, bucket: b })
    showToast(b === 'archived' ? `已归档“${task.title}”` : `已${MOVE_VERB[b]}${b === 'plan' ? planAddNote(task) : ''}`, () => {
      dispatch({ type: 'load', state: snap })
      showToast('已撤销')
    })
    if (b === 'archived') closeDrawer()
  }

  const saveTitle = () => {
    setEditingTitle(false)
    requestAnimationFrame(() => document.getElementById('rename-btn')?.focus())
    if (titleDraft.trim() && titleDraft.trim() !== task.title) {
      dispatch({ type: 'rename_task', id: task.id, title: titleDraft })
      showToast('名称已更新')
    } else setTitleDraft(task.title)
  }

  const setFocus = () => {
    // 原来的当前行动如果约了时间，换掉它，约定也就不成立了：说清楚
    const prev = focusTask(state)
    const prevBooked = !!prev && prev.id !== task.id && !!prev.planAt && new Date(prev.planAt).getTime() > Date.now()
    dispatch({ type: 'set_focus', taskId: task.id })
    closeDrawer()
    go('now')
    showToast(prevBooked ? '首页已换成这件事，原来约的时间取消了' : '首页已换成这件事')
    say(
      `好，把“${task.title}”设为当前行动。原来的行动保留在规划里${prevBooked ? `，给它约的时间取消了${prev!.planCal ? '；日历里那条提醒需要你自己删掉' : ''}` : ''}。`,
    )
  }
  const markDone = () => {
    const snap = state
    dispatch({ type: 'complete_task', taskId: task.id })
    showToast(recurring ? '记下了这一次' : '已标记完成', () => {
      dispatch({ type: 'load', state: snap })
      showToast('已撤销')
    })
    if (!recurring) closeDrawer()
  }

  // 主按钮跟着事项类型走：主线上的事“设为当前行动”，生活杂事“标记完成”，休息规则不需要按钮
  const primary: 'go' | 'focus' | 'done' | 'later' | null = done || task.bucket === 'archived' || task.rest
    ? null
    : isFocus
      ? 'go'
      : task.bucket === 'plan'
        ? 'focus'
        : task.bucket === 'later'
          ? 'later'
          : 'done'

  return (
    <>
      <DrawerHeader
        icon={<ListChecks size={16} aria-hidden />}
        label={
          <span className="inline-flex items-center gap-2">
            事项详情
            <span aria-hidden>·</span>
            {stage ? stage.title : BUCKET_LABEL[task.bucket]}
          </span>
        }
        onClose={closeDrawer}
        drag={drag}
      />
      <div className="scroll-thin flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          {task.bucket === 'inbox' && !task.suggestion ? <Pill tone="neutral">待整理</Pill> : <CategoryTag category={task.category} />}
          {isFocus && <Pill tone="accent">当前行动</Pill>}
          {done && (
            <Pill tone="accent" icon={<CircleCheck size={12} aria-hidden />}>
              已完成{task.doneAt ? ` · ${relativeTime(task.doneAt)}` : ''}
            </Pill>
          )}
          {task.status === 'draft' && <Pill tone="sky">草稿已准备</Pill>}
          {task.rest && <Pill tone="sky">休息</Pill>}
        </div>

        <h2 id="drawer-title" tabIndex={-1} className={cx('wrap-anywhere mt-3 text-[20px] font-semibold leading-snug outline-none', editingTitle && 'sr-only')}>
          {task.title}
        </h2>
        {editingTitle ? (
          <form
            className="mt-3 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              saveTitle()
            }}
          >
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  setEditingTitle(false)
                  setTitleDraft(task.title)
                  requestAnimationFrame(() => document.getElementById('rename-btn')?.focus())
                }
              }}
              aria-label="事项名称"
              className="h-11 min-w-0 flex-1 rounded-lg border border-accent/50 bg-surface px-3 text-[17px] font-semibold outline-none ring-4 ring-accent/10"
            />
            <Button type="submit" size="sm" variant="primary">
              保存
            </Button>
          </form>
        ) : (
          !done && (
            <button
              id="rename-btn"
              onClick={() => {
                setTitleDraft(task.title)
                setEditingTitle(true)
              }}
              className="hit mt-1 inline-flex items-center gap-1 rounded-md py-0.5 text-[12px] text-muted hover:text-ink"
            >
              <Pencil size={12} aria-hidden /> 改名称
            </button>
          )
        )}

        <dl className="mt-4 space-y-2.5 text-[14px]">
          {!done && !task.rest && (
            <Row icon={<CalendarClock size={15} aria-hidden />} label="期限">
              {editingDue ? (
                <span className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    autoFocus
                    value={task.due ?? ''}
                    onChange={(e) => dispatch({ type: 'set_due', id: task.id, due: e.target.value })}
                    aria-label="期限"
                    className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-[14px] outline-none focus:border-accent/60 touch:h-11"
                  />
                  {task.due && (
                    <button onClick={() => dispatch({ type: 'set_due', id: task.id, due: undefined })} className="hit text-[13px] text-muted hover:text-ink">
                      清除
                    </button>
                  )}
                  <button onClick={() => setEditingDue(false)} className="hit text-[13px] font-medium text-accent">
                    好了
                  </button>
                </span>
              ) : (
                <span className="flex flex-wrap items-center gap-x-3">
                  <span className={task.due ? 'text-ink' : 'text-muted'}>{task.due ? dueLabel(task.due) : '没有期限'}</span>
                  <button onClick={() => setEditingDue(true)} className="hit text-[13px] text-accent hover:underline">
                    {task.due ? '改' : '加一个'}
                  </button>
                </span>
              )}
            </Row>
          )}
          {done && task.due && (
            <Row icon={<CalendarClock size={15} aria-hidden />} label="期限">
              {dueLabel(task.due)}
            </Row>
          )}
          {!done && task.planAt && new Date(task.planAt).getTime() > Date.now() && (
            <Row icon={<AlarmClock size={15} aria-hidden />} label="约在">
              <span className="flex flex-wrap items-center gap-x-3">
                <span className="text-ink">{planLabel(new Date(task.planAt))}</span>
                <button onClick={() => cancelPlan(task.id, 'cancel')} className="hit text-[13px] text-muted hover:text-ink">
                  取消
                </button>
              </span>
            </Row>
          )}
          {task.schedule && (
            <Row icon={<Repeat size={15} aria-hidden />} label="安排">
              {task.schedule}
            </Row>
          )}
          {task.estimate && !done && (
            <Row icon={<Footprints size={15} aria-hidden />} label="投入">
              {task.estimate}
            </Row>
          )}
          {task.criteria && (
            <Row icon={<Target size={15} aria-hidden />} label="完成标准">
              {task.criteria}
            </Row>
          )}
        </dl>

        {task.why && <p className="mt-4 text-[14px] leading-relaxed text-ink-2">{task.why}</p>}
        {task.note && task.bucket !== 'plan' && <p className="mt-4 text-[14px] leading-relaxed text-ink-2">{task.note}</p>}

        {task.suggestion && (
          <div className="mt-4 rounded-xl bg-accent-softer px-4 py-3 text-[13px] leading-relaxed">
            <span className="inline-flex items-center gap-1 font-medium text-accent-ink">
              <Sparkles size={13} aria-hidden /> 建议{MOVE_VERB[task.suggestion.bucket]}
            </span>
            <p className="mt-0.5 text-accent-ink-2">{task.suggestion.reason}</p>
          </div>
        )}

        {task.adjust && task.adjust.reason === 'too_big' && (
          <div className="mt-4 rounded-xl bg-amber-soft px-4 py-3 text-[13px] text-amber-ink">今天先做的一小步：{task.adjust.smallTitle}</div>
        )}

        {(task.steps?.length || (!done && task.bucket === 'plan')) && (
          <section className="mt-5" aria-labelledby="task-steps">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <h3 id="task-steps" tabIndex={-1} className="text-[13px] font-medium text-ink-2 outline-none">
                具体步骤
                {task.stepsBy === 'ai' && !editing && <span className="ml-1.5 font-normal text-muted">· AI 拆的，可以改</span>}
              </h3>
              {!done && !editing && (
                <button onClick={() => setEditing(true)} className="hit inline-flex items-center gap-1 rounded-md py-0.5 text-[13px] font-medium text-accent hover:underline">
                  <Pencil size={12} aria-hidden /> {task.steps?.length ? '改步骤' : '拆成几步'}
                </button>
              )}
            </div>
            {editing ? (
              <StepsEditor
                task={task}
                autofocus={firstEdit.current}
                onDone={() => {
                  firstEdit.current = false
                  setEditing(false)
                  requestAnimationFrame(() => document.getElementById('task-steps')?.focus())
                }}
              />
            ) : (
              <ol className="space-y-1.5">
                {(task.steps ?? []).map((s, i) => {
                  const d = done || task.stepsDone?.includes(i)
                  return (
                    <li key={`${i}-${s}`} className={cx('flex items-start gap-2.5 text-[14px]', d ? 'text-muted line-through decoration-ghost' : 'text-ink-2')}>
                      <span
                        className={cx(
                          'mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] tabular-nums',
                          d ? 'border-accent bg-accent text-white' : 'border-control',
                        )}
                      >
                        {d ? <Check size={10} strokeWidth={3} aria-hidden /> : i + 1}
                      </span>
                      {s}
                      {d && <span className="sr-only">（已完成）</span>}
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
        )}

        {task.progress && task.progress.length > 0 && (
          <section className="mt-5" aria-labelledby="task-progress">
            <h3 id="task-progress" className="mb-2 text-[13px] font-medium text-ink-2">
              已有推进
            </h3>
            <div className="flex flex-wrap gap-2">
              {task.progress.map((p) => (
                <Pill key={p} tone="outline" icon={<Check size={12} aria-hidden className="text-accent" />}>
                  {p}
                </Pill>
              ))}
            </div>
          </section>
        )}

        {art && (
          <button
            onClick={() => openArtifact(art.id)}
            className="mt-5 flex w-full items-center gap-3 rounded-xl border border-line px-4 py-3 text-left transition-colors hover:border-line-strong hover:bg-canvas"
          >
            <FileText size={18} aria-hidden className="text-sky-ink" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium">{art.title}</span>
              <span className="block text-[12px] text-muted">{art.status === 'draft' ? '草稿' : '已采用'} · 点击查看</span>
            </span>
          </button>
        )}

        {!done && (
          <section className="mt-6" aria-labelledby="task-where">
            <h3 id="task-where" className="mb-2 text-[13px] font-medium text-ink-2">
              放在哪里
            </h3>
            <div role="radiogroup" aria-labelledby="task-where" className="flex flex-wrap gap-1.5">
              {MOVE_OPTIONS.map((b) => {
                const active = task.bucket === b
                return (
                  <button
                    key={b}
                    role="radio"
                    aria-checked={active}
                    onClick={() => !active && move(b)}
                    className={cx(
                      'inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-[13px] transition-colors touch:h-11',
                      active ? 'border-accent/40 bg-accent-soft font-medium text-accent-ink' : 'border-line bg-surface text-ink-2 hover:border-line-strong',
                    )}
                  >
                    {b === 'archived' && <Archive size={13} aria-hidden />}
                    {active && b !== 'archived' && <Check size={13} aria-hidden />}
                    {b === 'archived' ? '归档' : BUCKET_LABEL[b]}
                  </button>
                )
              })}
            </div>
            {task.bucket === 'archived' && (
              <button onClick={() => dispatch({ type: 'unarchive', id: task.id })} className="hit mt-2 text-[13px] text-accent hover:underline">
                恢复到原来的位置
              </button>
            )}
          </section>
        )}
      </div>

      {/* 改步骤的时候先收起底部按钮：一屏只有一个主按钮（保存） */}
      {primary && !editing && (
        <div className="pb-safe flex flex-wrap items-center gap-2 border-t border-line px-5 py-3 sm:px-6">
          {primary === 'go' && (
            <Button
              variant="primary"
              className="flex-1 sm:flex-none"
              iconRight={<Footprints size={15} aria-hidden />}
              onClick={() => {
                closeDrawer()
                go('now')
              }}
            >
              去处理
            </Button>
          )}
          {primary === 'focus' && (
            <>
              <Button variant="primary" className="flex-1 sm:flex-none" onClick={setFocus}>
                设为当前行动
              </Button>
              <Button variant="ghost" onClick={markDone}>
                标记完成
              </Button>
            </>
          )}
          {primary === 'later' && (
            <>
              <Button variant="primary" className="flex-1 sm:flex-none" onClick={() => move('plan')}>
                加入当前规划
              </Button>
              <Button variant="ghost" onClick={markDone}>
                标记完成
              </Button>
            </>
          )}
          {primary === 'done' && (
            <>
              <Button variant="primary" className="flex-1 sm:flex-none" icon={<Check size={15} aria-hidden />} onClick={markDone}>
                {recurring ? '这次做完了' : '标记完成'}
              </Button>
              {!recurring && (
                <Button variant="ghost" onClick={setFocus}>
                  现在就做这件
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}

/* ---------------- 改步骤 ---------------- */

type EditStep = { key: string; text: string; done: boolean }

/**
 * 系统先拆，用户能改（人机交互里叫“混合主导”）：改说法、删掉、加一步、调顺序；
 * 也可以让 AI 重新拆，或者在最前面加一个 2 分钟就能开始的起步动作（拆得更细）。
 * 回车加下一步；空着的那一步按退格就删掉，和常见的清单 App 一样。
 */
function StepsEditor({ task, autofocus, onDone }: { task: Task; autofocus: boolean; onDone: () => void }) {
  const { state, dispatch, showToast } = useApp()
  const [initial] = useState<EditStep[]>(() =>
    (task.steps?.length ? task.steps : breakdownFor(task).steps).map((text, i) => ({ key: uid('k'), text, done: !!task.steps?.length && !!task.stepsDone?.includes(i) })),
  )
  const [items, setItems] = useState<EditStep[]>(initial)
  // 一直没手动改过，就仍然算“AI 拆的”
  const [byAI, setByAI] = useState(task.stepsBy === 'ai' || !task.steps?.length)
  const [error, setError] = useState('')
  const listRef = useRef<HTMLOListElement>(null)
  const focusAt = (i: number) => requestAnimationFrame(() => listRef.current?.querySelectorAll<HTMLTextAreaElement>('textarea')[i]?.focus())
  useEffect(() => {
    if (!autofocus) focusAt(0)
  }, [autofocus])

  const clean = (xs: EditStep[]) => xs.map((x) => ({ text: x.text.trim(), done: x.done })).filter((x) => x.text)
  const sameAsBefore = (xs: EditStep[]) => JSON.stringify(clean(xs)) === JSON.stringify(clean(initial)) && !!task.steps?.length

  // 保存一次；撤销就回到保存之前（只撤这一次改动）
  const latest = useRef({ items, byAI, state })
  latest.current = { items, byAI, state }
  const finished = useRef(false)
  const commit = (xs: EditStep[], ai: boolean, message: string) => {
    const snap = latest.current.state
    dispatch({ type: 'set_steps', taskId: task.id, steps: clean(xs), by: ai ? 'ai' : 'user' })
    showToast(message, () => {
      dispatch({ type: 'load', state: snap })
      showToast('已撤销，步骤回到改之前')
    })
  }
  // 改了一半就关掉抽屉（点叉、点外面、下拉、返回键）：帮你存下来，不会白改
  useEffect(
    () => () => {
      const { items: xs, byAI: ai } = latest.current
      if (finished.current || sameAsBefore(xs) || !clean(xs).length) return
      commit(xs, ai, '改过的步骤已保存')
    },
    // 只在卸载时执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const edit = (fn: (xs: EditStep[]) => EditStep[], manual = true) => {
    setItems(fn)
    if (manual) setByAI(false)
    setError('')
  }
  const add = (at: number, texts: string[] = ['']) => {
    if (items.length + texts.length > 8) return setError('最多 8 步。步子太多，反而不知道从哪开始')
    edit((xs) => [...xs.slice(0, at), ...texts.map((text) => ({ key: uid('k'), text, done: false })), ...xs.slice(at)])
    focusAt(at + texts.length - 1)
  }
  const remove = (i: number) => {
    edit((xs) => xs.filter((_, j) => j !== i))
    focusAt(Math.max(0, i - 1))
  }
  const move = (i: number, d: -1 | 1) => {
    edit((xs) => {
      const n = [...xs]
      ;[n[i], n[i + d]] = [n[i + d], n[i]]
      return n
    })
    focusAt(i + d)
  }
  const cancel = () => {
    finished.current = true
    onDone()
  }
  const save = () => {
    if (!clean(items).length) return setError('至少留一步')
    finished.current = true
    // 没改任何东西，就不记一笔“调整了步骤”
    if (!sameAsBefore(items)) commit(items, byAI, '步骤已更新')
    onDone()
  }

  return (
    <div className="rounded-xl border border-line bg-canvas/60 p-3">
      <ol ref={listRef} className="space-y-1.5">
        {items.map((x, i) => (
          <StepRow
            key={x.key}
            step={x}
            index={i}
            count={items.length}
            autofocus={autofocus && i === 0}
            onText={(text) => edit((xs) => xs.map((y, j) => (j === i ? { ...y, text } : y)))}
            onPasteLines={(lines) => {
              // 粘贴一段多行清单：每行一步
              const [first, ...rest] = lines
              edit((xs) => xs.map((y, j) => (j === i ? { ...y, text: y.text ? `${y.text}${first}` : first } : y)))
              if (rest.length) add(i + 1, rest)
            }}
            onEnter={() => add(i + 1)}
            onBackspaceEmpty={() => items.length > 1 && remove(i)}
            onCancel={cancel}
            onMove={(d) => move(i, d)}
            onRemove={() => remove(i)}
          />
        ))}
      </ol>
      <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1">
        <Button size="sm" variant="ghost" icon={<Plus size={14} aria-hidden />} onClick={() => add(items.length)}>
          加一步
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Sparkles size={14} aria-hidden />}
          onClick={() => {
            // 和原来一样的那几步，勾选状态保留
            const doneTexts = new Set(initial.filter((x) => x.done).map((x) => x.text.trim()))
            edit(() => breakdownFor(task).steps.map((text) => ({ key: uid('k'), text, done: doneTexts.has(text) })), false)
            setByAI(true)
            focusAt(0)
          }}
        >
          AI 重新拆
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const texts = withStarter(
              items.map((x) => x.text),
              task,
            )
            if (texts.length === items.length) return setError('第一步已经是 2 分钟的起步动作了')
            // 这是 AI 加的一步，不算你改过
            edit((xs) => [{ key: uid('k'), text: texts[0], done: false }, ...xs], false)
            focusAt(0)
          }}
        >
          拆得更细
        </Button>
      </div>
      <p className={cx('mt-1 px-1 text-[12px] leading-relaxed', error ? 'text-amber-ink' : 'text-muted')} aria-live="polite">
        {error || '每一步用动词开头；第一步最好 10–15 分钟能做完。'}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" variant="primary" onClick={save}>
          保存
        </Button>
        <Button size="sm" variant="ghost" onClick={cancel}>
          取消
        </Button>
      </div>
    </div>
  )
}

function StepRow({
  step,
  index,
  count,
  autofocus,
  onText,
  onPasteLines,
  onEnter,
  onBackspaceEmpty,
  onCancel,
  onMove,
  onRemove,
}: {
  step: EditStep
  index: number
  count: number
  autofocus: boolean
  onText: (t: string) => void
  onPasteLines: (lines: string[]) => void
  onEnter: () => void
  onBackspaceEmpty: () => void
  onCancel: () => void
  onMove: (d: -1 | 1) => void
  onRemove: () => void
}) {
  const m = useMenu()
  const ref = useRef<HTMLTextAreaElement>(null)
  // 文字多就自动变高，长句子也看得全
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [step.text])
  const n = index + 1
  return (
    <li className="flex items-start gap-1.5">
      <span
        aria-hidden
        className={cx(
          'mt-[9px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] tabular-nums touch:mt-[11px]',
          step.done ? 'bg-accent text-white' : 'border border-control text-muted',
        )}
      >
        {step.done ? <Check size={11} strokeWidth={3} /> : n}
      </span>
      <textarea
        ref={ref}
        rows={1}
        value={step.text}
        data-autofocus={autofocus || undefined}
        onChange={(e) => onText(e.target.value.replace(/\n/g, ''))}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text')
          if (!/\n/.test(text.trim())) return
          e.preventDefault()
          const lines = parseSteps(text)
          if (lines.length) onPasteLines(lines)
        }}
        onKeyDown={(e) => {
          // 中文输入法选字时的回车不算（Safari 上 isComposing 不可靠，再看 keyCode 229）
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            e.preventDefault()
            onEnter()
          } else if (e.key === 'Backspace' && !step.text) {
            e.preventDefault()
            onBackspaceEmpty()
          } else if (e.key === 'Escape') {
            e.stopPropagation()
            onCancel()
          }
        }}
        aria-label={`第 ${n} 步${step.done ? '（已完成）' : ''}`}
        placeholder="用动词开头，比如“打开……”"
        className="min-h-9 min-w-0 flex-1 resize-none rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-[14px] leading-snug text-ink outline-none transition-[border-color,box-shadow] focus:border-accent/60 focus:ring-4 focus:ring-accent/10 touch:min-h-11 touch:py-2.5"
      />
      <div className={cx('relative', m.open && 'z-40')} ref={m.rootRef}>
        <button
          {...m.triggerProps}
          aria-label={`调整第 ${n} 步`}
          className={cx(
            'flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink touch:h-11 touch:w-11',
            m.open && 'bg-sunken text-ink',
          )}
        >
          <Ellipsis size={16} aria-hidden />
        </button>
        {m.open && (
          <div {...m.listProps} aria-label={`调整第 ${n} 步`} className={cx(menuPanel, 'right-0 top-[calc(100%+4px)] w-[160px] origin-top-right p-1')}>
            {(
              [
                ['上移', <ArrowUp key="u" size={14} aria-hidden />, () => onMove(-1), index === 0],
                ['下移', <ArrowDown key="d" size={14} aria-hidden />, () => onMove(1), index === count - 1],
                ['删掉这一步', <Trash2 key="r" size={14} aria-hidden />, onRemove, count <= 1],
              ] as const
            ).map(([label, icon, fn, disabled]) => (
              <button
                key={label}
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
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <dt className="flex min-h-6 w-[84px] shrink-0 items-center gap-1.5 text-muted">
        {icon}
        {label}
      </dt>
      <dd className="min-h-6 min-w-0 text-ink">{children}</dd>
    </div>
  )
}
