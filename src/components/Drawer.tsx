import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  Archive,
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
import { BUCKET_LABEL, MOVE_VERB, artifactById, focusTask, stageTasks, taskById, useApp, useBackHandler } from '../state/store'
import { dueLabel, relativeTime } from '../lib/dates'
import { useDialog, useMedia, useSheetDrag } from '../lib/hooks'
import { Button, CategoryTag, IconButton, Pill, cx } from './ui'

type Drag = ReturnType<typeof useSheetDrag>

export function Drawer() {
  const { drawer, closeDrawer } = useApp()
  const ref = useRef<HTMLDivElement>(null)
  const mobile = useMedia('(max-width: 639px)')
  const open = !!drawer
  useDialog(ref, open, closeDrawer, () => ref.current?.querySelector<HTMLElement>('#drawer-title'))
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
          <TaskView key={drawer.id} id={drawer.id} drag={drag} />
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
  useLayoutEffect(autosize, [art?.after])

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

  const adopt = () => {
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
              草稿 · 采用后才算完成
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
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3">
            <label htmlFor="artifact-text" className="text-[12px] font-medium text-muted">
              {art.before ? '改写后' : '内容'}
              <span className="ml-1.5 font-normal">· 可以直接改，自动保存</span>
            </label>
            {cursor !== undefined && draft && <span className="text-[12px] text-accent-ink">光标已放在上次停下的位置</span>}
          </div>
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
            采用这版
          </Button>
        ) : (
          <span className="ml-auto text-right text-[12px] leading-snug text-muted">只保存在本地，不会发送给任何人</span>
        )}
      </div>
    </>
  )
}

/* ---------------- 事项详情 ---------------- */

const MOVE_OPTIONS: Exclude<Bucket, 'inbox'>[] = ['plan', 'maintain', 'later', 'archived']

function TaskView({ id, drag }: { id: string; drag: Drag }) {
  const { state, dispatch, closeDrawer, openArtifact, go, showToast, say } = useApp()
  const task = taskById(state, id)
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
    showToast(b === 'archived' ? `已归档“${task.title}”` : `已${MOVE_VERB[b]}`, () => {
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
    dispatch({ type: 'set_focus', taskId: task.id })
    closeDrawer()
    go('now')
    showToast('首页已换成这件事')
    say(`好，把“${task.title}”设为当前行动。原来的行动保留在规划里。`)
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

        {task.steps && (
          <section className="mt-5" aria-labelledby="task-steps">
            <h3 id="task-steps" className="mb-2 text-[13px] font-medium text-ink-2">
              具体步骤
            </h3>
            <ol className="space-y-1.5">
              {task.steps.map((s, i) => {
                const d = done || task.stepsDone?.includes(i)
                return (
                  <li key={s} className={cx('flex items-start gap-2.5 text-[14px]', d ? 'text-muted line-through decoration-ghost' : 'text-ink-2')}>
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

      {primary && (
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
