import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import type {
  Adjust,
  AppState,
  Artifact,
  Bucket,
  ChatAction,
  ChatMessage,
  Feedback,
  Outcome,
  Page,
  ResumeInfo,
  Scenario,
  Stage,
  Task,
  TimelineEvent,
} from '../data/types'
import { buildScenario, loadState, saveState, STORAGE_KEY } from '../data/seed'
import { aiHelp, breakdownFor, draftFor, organize, type OrganizeResult, type PlanTemplate } from '../lib/mockAI'
import { daysFromToday, fromIso, parseDue, restTimeFromText, todayKey } from '../lib/dates'
import { firstStepOf, planAbsolute, planLabel } from '../lib/plan'
import { focusPrimary } from '../lib/hooks'

/* ---------------- 工具 ---------------- */

let seq = 0
export const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`
const now = () => new Date().toISOString()

function readLS(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeLS(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* 隐私模式等情况下忽略 */
  }
}

/** 距离上次打开过了几天（模块加载时只算一次；开发模式下组件会重复渲染，放在这里不会算错） */
export const VISIT_GAP_DAYS = (() => {
  const key = `${STORAGE_KEY}-last-visit`
  const prev = readLS(key)
  const today = todayKey()
  writeLS(key, today)
  if (!prev) return 0
  return Math.max(0, Math.round((fromIso(today).getTime() - fromIso(prev).getTime()) / 86400000))
})()

/** 分组名称：全应用只用这一套叫法 */
export const BUCKET_LABEL: Record<Bucket, string> = {
  inbox: '待整理',
  plan: '当前规划',
  maintain: '维持安排',
  later: '稍后考虑',
  archived: '已归档',
}

/** 把事项放进某个分组时的动作说法 */
export const MOVE_VERB: Record<Exclude<Bucket, 'inbox'>, string> = {
  plan: '加入当前规划',
  maintain: '放进维持安排',
  later: '放到稍后考虑',
  archived: '归档',
}

/* ---------------- 选择器 ---------------- */

export const currentStage = (s: AppState) => s.stages.find((x) => x.status === 'current') ?? s.stages[s.stages.length - 1]
export const taskById = (s: AppState, id?: string | null) => (id ? s.tasks.find((t) => t.id === id) : undefined)
export const artifactById = (s: AppState, id?: string | null) => (id ? s.artifacts.find((a) => a.id === id) : undefined)
export const focusTask = (s: AppState) => taskById(s, s.focusTaskId)
export const stageTasks = (s: AppState, stageId: string) =>
  s.tasks.filter((t) => t.bucket === 'plan' && t.stageId === stageId).sort((a, b) => a.order - b.order)

/** 待整理里还没处理的事（做完的不再出现） */
export const inboxItems = (s: AppState) => s.tasks.filter((t) => t.bucket === 'inbox' && t.status !== 'done')

/** 首页“有期限的事”：有期限、未完成、未归档，按期限排序 */
export const attentionItems = (s: AppState) =>
  s.tasks
    .filter((t) => t.due && t.status !== 'done' && t.bucket !== 'archived' && t.id !== s.focusTaskId)
    .sort((a, b) => (a.due! < b.due! ? -1 : 1))

export const nextTaskAfterFocus = (s: AppState) => {
  const f = focusTask(s)
  if (!f?.stageId) return undefined
  return stageTasks(s, f.stageId).find((t) => t.status !== 'done' && t.id !== f.id)
}

/** 用户自己定的休息边界（维持安排里带时间的休息规则） */
export const restRule = (s: AppState) => {
  for (const t of s.tasks) {
    if (t.bucket !== 'maintain' || !t.rest) continue
    const at = restTimeFromText(t.title) ?? t.restAfter
    if (at) return { task: t, at }
  }
  return undefined
}

/* ---------------- Reducer ---------------- */

export type Action =
  | { type: 'load'; state: AppState }
  | { type: 'set_direction'; title: string }
  | { type: 'set_energy'; energy: AppState['energy'] }
  | { type: 'draft_ready'; taskId: string; artifactId: string; draft: ReturnType<typeof draftFor> }
  | { type: 'update_artifact'; id: string; after: string }
  | { type: 'adopt'; artifactId: string }
  | { type: 'complete_task'; taskId: string; note?: string }
  | { type: 'set_adjust'; taskId: string; adjust?: Adjust }
  | { type: 'update_check'; taskId: string; checkId: string; value: string }
  | { type: 'confirm_small'; taskId: string }
  | { type: 'save_example'; taskId: string; text: string }
  | { type: 'toggle_step'; taskId: string; index: number }
  | { type: 'log_progress'; taskId?: string; title: string; detail?: string }
  | { type: 'add_item'; id: string; text: string }
  | { type: 'rename_task'; id: string; title: string }
  | { type: 'set_due'; id: string; due?: string }
  | { type: 'organizing'; ids: string[] }
  | { type: 'organized'; results: Record<string, OrganizeResult> }
  | { type: 'move'; id: string; bucket: Bucket }
  | { type: 'apply_all' }
  | { type: 'unarchive'; id: string }
  | { type: 'restore'; task: Task; focusTaskId: string | null }
  | { type: 'set_focus'; taskId: string }
  | { type: 'reorder'; taskId: string; dir: -1 | 1 }
  | { type: 'add_outcome'; title: string; status: Outcome['status']; result?: string }
  | { type: 'update_outcome'; id: string; status: Outcome['status']; result?: string }
  | { type: 'chat'; messages: ChatMessage[] }
  | { type: 'set_resume'; resume: ResumeInfo | null }
  | { type: 'dismiss_completed' }
  | { type: 'dismiss_resume' }
  | { type: 'feedback'; level: Feedback }
  /** 约个时间：带 at 是约定（或改约）；不带 at 是取消（cancel：撤回这个约定，删掉记录；start：提前开始做了） */
  | { type: 'set_plan'; taskId: string; at?: string; eventId?: string; reason?: 'cancel' | 'start' }
  /** 记下：这个约定已经生成过日历文件 */
  | { type: 'plan_cal'; taskId: string }
  /** 用户改步骤（改名、删、加、调顺序），或者确认了 AI 重新拆的步骤 */
  | { type: 'set_steps'; taskId: string; steps: { text: string; done: boolean }[]; by: 'ai' | 'user' }
  /** 换了近期方向，按系统拟的新路线重新规划阶段 */
  | { type: 'replan'; title: string; plan: PlanTemplate }
  /** 撤销刚才的约定：恢复原来的时间，并删掉那条记录 */
  | { type: 'undo_plan'; taskId: string; prevAt?: string; eventId: string }

function ev(kind: TimelineEvent['kind'], title: string, extra: Partial<TimelineEvent> = {}): TimelineEvent {
  return { id: uid('e'), at: now(), kind, title, ...extra }
}

function patchTask(s: AppState, id: string, patch: Partial<Task> | ((t: Task) => Partial<Task>)): AppState {
  return {
    ...s,
    tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...(typeof patch === 'function' ? patch(t) : patch) } : t)),
  }
}

/** 完成当前行动后，找到下一个行动；本阶段做完则推进到下一阶段 */
function advanceFocus(s: AppState): AppState {
  const stage = currentStage(s)
  const pending = stageTasks(s, stage.id).filter((t) => t.status !== 'done')
  if (pending.length) return { ...s, focusTaskId: pending[0].id }

  const idx = s.stages.findIndex((x) => x.id === stage.id)
  const next = s.stages[idx + 1]
  if (!next) return { ...s, focusTaskId: null }
  const stages = s.stages.map((x) =>
    x.id === stage.id ? { ...x, status: 'done' as const } : x.id === next.id ? { ...x, status: 'current' as const } : x,
  )
  const first = stageTasks({ ...s, stages }, next.id).find((t) => t.status !== 'done')
  return {
    ...s,
    stages,
    focusTaskId: first?.id ?? null,
    events: [...s.events, ev('adjust', `阶段推进：${stage.title} → ${next.title}`, { detail: `阶段成果已完成：${stage.outcome}` })],
  }
}

function finishTask(s: AppState, taskId: string, artifactId?: string): AppState {
  const task = taskById(s, taskId)
  if (!task) return s
  let out = patchTask(s, taskId, { status: 'done', doneAt: now(), adjust: undefined, planAt: undefined, planEventId: undefined, planCal: undefined })
  out.events = [...out.events, ev('action', task.title, { taskId, artifactId })]
  out.resume = out.resume?.taskId === taskId ? null : out.resume
  if (s.focusTaskId === taskId) {
    out = advanceFocus(out)
    out.justCompleted = { taskId, artifactId }
  }
  return out
}

/** 系统拆的步骤：标成“AI 拆的”，用户随时可以改；完成标准和投入时间没有的话一并补上 */
function aiStepsPatch(t: Task): Partial<Task> {
  const b = breakdownFor(t)
  return { steps: b.steps, stepsDone: [], stepsBy: 'ai', estimate: t.estimate ?? b.estimate, criteria: t.criteria ?? b.criteria }
}

/** 加入当前规划时的提示：没有步骤的事，系统会先拆好（提示里说出来，用户知道可以去改） */
export const planAddNote = (t: Task) => (t.steps?.length ? '' : `，AI 先拆成了 ${breakdownFor(t).steps.length} 步`)

/** 把“1. xxx”“· xxx”这类一行一步的文字读成步骤 */
export function parseSteps(text: string) {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:\d+\s*[.、)）]|[（(]\d+[)）]|[·•\-*])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 8)
}

/** 用到时再拆：哪件事成了“当前行动”却还没有步骤，就先由系统拆好 */
function withFocusSteps(s: AppState): AppState {
  const f = focusTask(s)
  if (!f || f.status === 'done' || f.steps?.length) return s
  return patchTask(s, f.id, aiStepsPatch(f))
}

function reducer(s: AppState, a: Action): AppState {
  return withFocusSteps(baseReducer(s, a))
}

function baseReducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'load':
      return a.state

    case 'set_direction':
      return {
        ...s,
        direction: { ...s.direction, title: a.title },
        events: [...s.events, ev('adjust', `近期方向更新为“${a.title}”`)],
      }

    case 'set_energy':
      return { ...s, energy: a.energy }

    case 'draft_ready': {
      const task = taskById(s, a.taskId)
      if (!task) return s
      const existing = artifactById(s, task.artifactId)
      if (existing) {
        const artifacts = s.artifacts.map((x) =>
          x.id === existing.id ? { ...x, ...a.draft, status: 'draft' as const, updatedAt: now() } : x,
        )
        return { ...patchTask(s, a.taskId, { status: 'draft' }), artifacts, resume: s.resume?.taskId === a.taskId ? null : s.resume }
      }
      const art: Artifact = { id: a.artifactId, taskId: a.taskId, status: 'draft', createdAt: now(), updatedAt: now(), ...a.draft }
      const out = patchTask(s, a.taskId, { status: 'draft', artifactId: art.id, adjust: undefined })
      return {
        ...out,
        artifacts: [...s.artifacts, art],
        events: [...s.events, ev('artifact', art.title, { detail: '草稿已准备', artifactId: art.id, taskId: a.taskId })],
      }
    }

    case 'update_artifact':
      return { ...s, artifacts: s.artifacts.map((x) => (x.id === a.id ? { ...x, after: a.after, updatedAt: now() } : x)) }

    case 'adopt': {
      const art = artifactById(s, a.artifactId)
      // 已经采用过的不再重复记（比如连点了两下）
      if (!art || art.status === 'adopted') return s
      const task = taskById(s, art.taskId)
      const artifacts = s.artifacts.map((x) => (x.id === art.id ? { ...x, status: 'adopted' as const, updatedAt: now() } : x))
      // 以前存下来的“拆解”草稿没有 use 字段，按标题认出来
      const use = art.use ?? (art.title.startsWith('拆解：') ? 'steps' : 'result')
      if (use === 'steps' && task) {
        // 采用拆解 = 把这几步写进这件事；事情本身还没做，不算完成
        const steps = parseSteps(art.after)
        if (!steps.length) return s
        const out = patchTask({ ...s, artifacts }, task.id, { steps, stepsDone: [], stepsBy: 'user', status: task.status === 'draft' ? 'todo' : task.status })
        return {
          ...out,
          events: [...out.events, ev('adjust', `把“${task.title}”拆成了 ${steps.length} 步`, { taskId: task.id, artifactId: art.id, detail: `第一步：${steps[0]}` })],
        }
      }
      if (use === 'step' && task) {
        // 写好消息只是其中一步：勾掉“写消息”那一步，发出去之后才算完成
        const idx = (task.steps ?? []).findIndex((x) => /写|起草|草稿/.test(x))
        const done = new Set(task.stepsDone ?? [])
        if (idx >= 0) done.add(idx)
        const out = patchTask({ ...s, artifacts }, task.id, {
          stepsDone: [...done].sort((x, y) => x - y),
          status: task.status === 'draft' ? 'todo' : task.status,
        })
        return {
          ...out,
          events: [...out.events, ev('progress', `${task.title}：消息写好了`, { taskId: task.id, artifactId: art.id, detail: '还需要你自己发出去' })],
        }
      }
      const out: AppState = {
        ...s,
        artifacts,
        events: [...s.events, ev('artifact', art.title, { detail: '已采用', artifactId: art.id, taskId: art.taskId })],
      }
      // 行动已由用户自己完成时，只记录成果被采用
      if (taskById(s, art.taskId)?.status === 'done') return out
      return finishTask(out, art.taskId, art.id)
    }

    case 'complete_task': {
      const task = taskById(s, a.taskId)
      if (!task) return s
      // 维持安排里的周期事项：只记一次，不标记结束
      if (task.bucket === 'maintain' && task.schedule) {
        return { ...s, events: [...s.events, ev('progress', `${task.title}（这次已做）`, { taskId: task.id })] }
      }
      let out = s
      let artifactId: string | undefined
      if (a.note?.trim()) {
        const art: Artifact = {
          id: uid('a'),
          taskId: task.id,
          title: `${task.title}（你写的版本）`,
          kind: 'text',
          after: a.note.trim(),
          note: '由你本人完成并保存。',
          status: 'adopted',
          createdAt: now(),
          updatedAt: now(),
        }
        artifactId = art.id
        out = {
          ...out,
          artifacts: [...out.artifacts, art],
          events: [...out.events, ev('artifact', art.title, { detail: '已保存', artifactId: art.id, taskId: task.id })],
        }
        out = patchTask(out, task.id, { artifactId: art.id })
      }
      return finishTask(out, task.id, artifactId)
    }

    case 'set_adjust': {
      const task = taskById(s, a.taskId)
      if (!task) return s
      // 卡住了也是“现在在做”：之前约的时间作废
      const out = patchTask(s, a.taskId, a.adjust ? { adjust: a.adjust, planAt: undefined, planEventId: undefined, planCal: undefined } : { adjust: undefined })
      if (!a.adjust || a.adjust.reason === 'distracted') return out
      const title =
        a.adjust.reason === 'too_big'
          ? `当前行动缩小为：${a.adjust.smallTitle}`
          : `为“${task.title}”给出第一段示例`
      return { ...out, events: [...out.events, ev('adjust', title, { taskId: task.id, detail: a.adjust.reason === 'too_big' ? '原因：这一步太大' : '原因：不知道怎么做' })] }
    }

    case 'update_check':
      return patchTask(s, a.taskId, (t) =>
        t.adjust?.reason === 'too_big'
          ? { adjust: { ...t.adjust, checks: t.adjust.checks.map((c) => (c.id === a.checkId ? { ...c, value: a.value } : c)) } }
          : {},
      )

    case 'confirm_small': {
      const task = taskById(s, a.taskId)
      if (!task || task.adjust?.reason !== 'too_big') return s
      const adj = task.adjust
      const label = task.aiKind === 'project' ? '已确认项目基本信息' : `已完成：${adj.smallTitle.replace(/^先(只做：)?/, '')}`
      // 缩小后的这一步就是原来的某一步：直接把那一步勾掉（进度条和“下一步”跟着走），不再另加一个标签
      const out = patchTask(s, a.taskId, (t) =>
        adj.stepIndex !== undefined
          ? { adjust: undefined, stepsDone: [...new Set([...(t.stepsDone ?? []), adj.stepIndex])].sort((x, y) => x - y) }
          : { adjust: undefined, progress: [...(t.progress ?? []), label] },
      )
      return {
        ...out,
        events: [
          ...out.events,
          ev('progress', `完成一小步：${adj.smallTitle.replace(/^先/, '')}`, {
            taskId: task.id,
            detail: adj.checks.map((c) => `${c.label}：${c.value}`).join(' · '),
          }),
        ],
      }
    }

    case 'save_example': {
      const task = taskById(s, a.taskId)
      if (!task) return s
      const label = task.aiKind === 'project' ? '第 1 条已写好' : '开头已写好'
      const out = patchTask(s, a.taskId, (t) => ({ adjust: undefined, note: a.text, progress: [...(t.progress ?? []), label] }))
      return {
        ...out,
        events: [...out.events, ev('progress', `${task.title}：${label}`, { taskId: task.id, detail: a.text.slice(0, 60) })],
      }
    }

    case 'toggle_step':
      return patchTask(s, a.taskId, (t) => {
        const done = new Set(t.stepsDone ?? [])
        if (done.has(a.index)) done.delete(a.index)
        else done.add(a.index)
        return { stepsDone: [...done].sort() }
      })

    case 'log_progress':
      return { ...s, events: [...s.events, ev('progress', a.title, { taskId: a.taskId, detail: a.detail })] }

    case 'add_item': {
      const task: Task = {
        id: a.id,
        title: a.text.trim(),
        category: '其他',
        bucket: 'inbox',
        order: 0,
        status: 'todo',
        due: parseDue(a.text),
        captured: true,
        createdAt: now(),
      }
      return { ...s, tasks: [...s.tasks, task] }
    }

    case 'rename_task':
      return a.title.trim()
        ? patchTask(s, a.id, (t) => ({ title: a.title.trim(), restAfter: t.restAfter ? restTimeFromText(a.title) : t.restAfter }))
        : s

    case 'set_due':
      return patchTask(s, a.id, { due: a.due || undefined })

    case 'organizing':
      return { ...s, tasks: s.tasks.map((t) => (a.ids.includes(t.id) ? { ...t, organizing: true } : t)) }

    case 'organized':
      return {
        ...s,
        tasks: s.tasks.map((t) => {
          const r = a.results[t.id]
          if (!r) return t
          return { ...t, organizing: false, category: r.category, due: r.due ?? t.due, suggestion: { bucket: r.bucket, reason: r.reason } }
        }),
      }

    case 'move':
      return moveTask(s, a.id, a.bucket, true)

    case 'apply_all': {
      const pending = s.tasks.filter((t) => t.bucket === 'inbox' && t.suggestion && t.status !== 'done')
      if (!pending.length) return s
      let out = s
      const count: Partial<Record<Bucket, number>> = {}
      for (const t of pending) {
        out = moveTask(out, t.id, t.suggestion!.bucket, false)
        count[t.suggestion!.bucket] = (count[t.suggestion!.bucket] ?? 0) + 1
      }
      const parts = (['plan', 'maintain', 'later', 'archived'] as const)
        .filter((b) => count[b])
        .map((b) => `${count[b]} 件${MOVE_VERB[b]}`)
      return { ...out, events: [...out.events, ev('adjust', `整理了 ${pending.length} 件待整理事项`, { detail: parts.join('，') })] }
    }

    case 'unarchive': {
      const t = taskById(s, a.id)
      if (!t) return s
      return patchTask(s, a.id, { bucket: t.prevBucket && t.prevBucket !== 'archived' ? t.prevBucket : 'inbox' })
    }

    case 'restore':
      return { ...s, tasks: s.tasks.map((t) => (t.id === a.task.id ? a.task : t)), focusTaskId: a.focusTaskId }

    case 'set_focus': {
      let out = s
      const t = taskById(s, a.taskId)
      if (!t || t.status === 'done') return s
      if (t.bucket !== 'plan') {
        // 主线以外的事（生活、学习等）可以临时设为当前行动，但不塞进求职的阶段里
        out =
          t.category === '求职'
            ? moveTask(out, t.id, 'plan', false)
            : patchTask(out, t.id, { bucket: 'plan', prevBucket: t.bucket, stageId: undefined, suggestion: undefined, organizing: false })
      }
      // 约定只跟着“当前行动”：换成别的事，原来的约定就不再成立；设为当前行动的这件也是“现在就做”
      const prev = focusTask(s)
      if (prev && prev.id !== t.id && prev.planAt) out = patchTask(out, prev.id, { planAt: undefined, planEventId: undefined, planCal: undefined })
      out = patchTask(out, t.id, { planAt: undefined, planEventId: undefined, planCal: undefined })
      return {
        ...out,
        focusTaskId: t.id,
        justCompleted: null,
        events: [...out.events, ev('adjust', `把“${t.title}”设为当前行动`, { taskId: t.id })],
      }
    }

    case 'reorder': {
      const t = taskById(s, a.taskId)
      if (!t?.stageId) return s
      const list = stageTasks(s, t.stageId).filter((x) => x.status !== 'done')
      const i = list.findIndex((x) => x.id === t.id)
      const j = i + a.dir
      if (j < 0 || j >= list.length) return s
      const other = list[j]
      let out = patchTask(s, t.id, { order: other.order })
      out = patchTask(out, other.id, { order: t.order })
      const f = focusTask(out)
      // 当前行动已经约好了时间，就不因为调顺序把它换掉
      const booked = !!f?.planAt && new Date(f.planAt).getTime() > Date.now()
      if (f && !booked && f.stageId === t.stageId && f.status === 'todo') {
        const first = stageTasks(out, t.stageId).find((x) => x.status !== 'done')
        if (first && first.id !== f.id) out = { ...out, focusTaskId: first.id }
      }
      return {
        ...out,
        events: [...out.events, ev('adjust', `调整顺序：“${t.title}”${a.dir < 0 ? '提前' : '推后'}`, { taskId: t.id })],
      }
    }

    case 'add_outcome': {
      const o: Outcome = { id: uid('o'), title: a.title, status: a.status, result: a.result, at: now() }
      return {
        ...s,
        outcomes: [...s.outcomes, o],
        events: [...s.events, ev('outcome', a.title, { outcomeId: o.id, detail: a.result ?? (a.status === 'waiting' ? '等待回复' : undefined) })],
      }
    }

    case 'update_outcome': {
      const o = s.outcomes.find((x) => x.id === a.id)
      if (!o) return s
      return {
        ...s,
        outcomes: s.outcomes.map((x) => (x.id === a.id ? { ...x, status: a.status, result: a.result, at: now() } : x)),
        events: [...s.events, ev('outcome', `${o.title}：收到回复`, { outcomeId: o.id, detail: a.result })],
      }
    }

    case 'chat':
      return { ...s, messages: [...s.messages, ...a.messages] }

    case 'set_resume':
      return { ...s, resume: a.resume }

    case 'dismiss_completed':
      return { ...s, justCompleted: null }

    case 'dismiss_resume':
      return { ...s, resume: null }

    case 'feedback': {
      if (!s.justCompleted) return s
      const out: AppState = { ...s, justCompleted: { ...s.justCompleted, feedback: a.level } }
      if (a.level !== 'hard') return out
      const f = focusTask(s)
      if (!f) return out
      // 不删步骤（完成标准依赖它们），只把“今天先做到哪”说清楚
      const patched = patchTask(out, f.id, { estimate: '先做前两步也行，约 10 分钟' })
      return {
        ...patched,
        events: [...patched.events, ev('adjust', `根据反馈，“${f.title}”今天先做前两步`, { taskId: f.id, detail: '上一件感觉有点吃力' })],
      }
    }

    case 'set_plan': {
      const task = taskById(s, a.taskId)
      if (!task) return s
      if (!a.at) {
        const out = patchTask(s, a.taskId, { planAt: undefined, planEventId: undefined, planCal: undefined })
        const eid = task.planEventId
        if (!eid || !a.reason) return out
        // 撤回约定：那条记录也删掉。没到点就开始了：保留记录，补一句“提前开始了”；到点后开始的，记录本身就对
        if (a.reason === 'cancel') return { ...out, events: out.events.filter((e) => e.id !== eid) }
        const early = !!task.planAt && new Date(task.planAt).getTime() > Date.now()
        if (!early) return out
        return {
          ...out,
          events: out.events.map((e) => (e.id === eid ? { ...e, detail: `${e.detail ? `${e.detail} · ` : ''}后来提前开始了` } : e)),
        }
      }
      const rebook = !!task.planAt && new Date(task.planAt).getTime() > Date.now()
      const when = planAbsolute(new Date(a.at))
      const id = a.eventId ?? uid('e')
      const where = s.resume?.taskId === task.id ? s.resume.where : undefined
      const out = patchTask(s, a.taskId, { planAt: a.at, planEventId: id })
      return {
        ...out,
        events: [
          ...out.events,
          ev('adjust', rebook ? `改约到 ${when} 做“${task.title}”` : `约好 ${when} 做“${task.title}”`, {
            id,
            taskId: task.id,
            detail: `到时候先做：${firstStepOf(task, where)}`,
          }),
        ],
      }
    }

    case 'set_steps': {
      const task = taskById(s, a.taskId)
      if (!task) return s
      const list = a.steps.map((x) => ({ ...x, text: x.text.trim() })).filter((x) => x.text).slice(0, 8)
      if (!list.length) return s
      const out = patchTask(s, a.taskId, {
        steps: list.map((x) => x.text),
        stepsDone: list.flatMap((x, i) => (x.done ? [i] : [])),
        stepsBy: a.by,
      })
      return {
        ...out,
        events: [...out.events, ev('adjust', `调整了“${task.title}”的步骤`, { taskId: task.id, detail: `现在是 ${list.length} 步，第一步：${list[0].text}` })],
      }
    }

    case 'replan': {
      // 新路线：第一阶段是当前阶段。行动先只有标题，哪件成了当前行动再拆步骤（用到时再拆）
      const stages: Stage[] = a.plan.stages.map((st, i) => ({ id: uid('s'), title: st.title, outcome: st.outcome, status: i === 0 ? 'current' : 'upcoming' }))
      const pending = new Set(s.tasks.filter((t) => t.bucket === 'plan' && t.status !== 'done').map((t) => t.id))
      const tasks = s.tasks.map((t): Task => {
        // 原来没做完的放到“稍后考虑”，随时能拿回来
        if (pending.has(t.id)) return { ...t, bucket: 'later', prevBucket: 'plan', stageId: undefined, planAt: undefined, planEventId: undefined, planCal: undefined }
        // 做完的记录都留着，只是不再挂在新路线的阶段下
        if (t.bucket === 'plan' && t.stageId) return { ...t, stageId: undefined }
        return t
      })
      const fresh: Task[] = a.plan.stages.flatMap((st, i) =>
        st.tasks.map((x, j) => ({
          id: uid('t'),
          title: x.title,
          category: a.plan.category,
          bucket: 'plan' as const,
          stageId: stages[i].id,
          order: j + 1,
          status: 'todo' as const,
          why: x.why,
          estimate: x.estimate,
          criteria: x.criteria,
          aiKind: x.aiKind,
          createdAt: now(),
        })),
      )
      return {
        ...s,
        direction: { title: a.title, horizon: a.plan.horizon },
        adjustCondition: a.plan.adjustCondition,
        planKind: a.plan.kind,
        stages,
        tasks: [...tasks, ...fresh],
        focusTaskId: fresh[0]?.id ?? null,
        resume: null,
        justCompleted: null,
        events: [
          ...s.events,
          ev('adjust', `按新方向重新规划：${a.title}`, {
            detail: `${stages.length} 个阶段${pending.size ? `；原来没做完的 ${pending.size} 件放到了稍后考虑` : ''}`,
          }),
        ],
      }
    }

    case 'plan_cal':
      return patchTask(s, a.taskId, (t) => ({ planCal: t.planAt }))

    case 'undo_plan': {
      // 恢复原来的时间；原来那条约定的记录还在，找回它的 id
      const prevEvent = a.prevAt ? [...s.events].reverse().find((e) => e.taskId === a.taskId && e.id !== a.eventId && /^(约好|改约到) /.test(e.title)) : undefined
      return {
        ...patchTask(s, a.taskId, { planAt: a.prevAt, planEventId: prevEvent?.id }),
        events: s.events.filter((e) => e.id !== a.eventId),
      }
    }
  }
}

function moveTask(s: AppState, id: string, bucket: Bucket, log: boolean): AppState {
  const t = taskById(s, id)
  if (!t || t.bucket === bucket) return s
  const stage = currentStage(s)
  const patch: Partial<Task> = { bucket, prevBucket: t.bucket, suggestion: undefined, organizing: false }
  // 放到稍后、维持安排或归档，就不再是要去做的事，约好的时间一并取消
  if (bucket !== 'plan') Object.assign(patch, { planAt: undefined, planEventId: undefined, planCal: undefined })
  if (bucket === 'plan') {
    patch.stageId = stage.id
    patch.order = Math.max(0, ...stageTasks(s, stage.id).map((x) => x.order)) + 1
    // 新事加入规划：系统先拆成几步（标成“AI 拆的”，用户可以改）
    if (!t.steps?.length) Object.assign(patch, aiStepsPatch(t))
  } else {
    patch.stageId = t.bucket === 'plan' ? undefined : t.stageId
  }
  let out = patchTask(s, id, patch)
  if (s.focusTaskId === id && bucket !== 'plan') out = advanceFocus(out)
  if (log && !(t.bucket === 'inbox' && bucket !== 'plan')) {
    const verb = bucket === 'inbox' ? '移回待整理' : MOVE_VERB[bucket]
    out = { ...out, events: [...out.events, ev('adjust', `把“${t.title}”${verb}`, { taskId: id })] }
  }
  return out
}

/* ---------------- Context：数据 + 界面状态 ---------------- */

export type DrawerTarget = { type: 'task'; id: string; editSteps?: boolean } | { type: 'artifact'; id: string; cursor?: number }

interface Toast {
  id: number
  text: string
  undo?: () => void
}

type RestDecision = 'stop' | 'continue' | null

const STEP_LABELS: Record<string, string[]> = {
  project: ['读取示例材料', '整理与岗位相关的经历', '生成草稿'],
  skills: ['读取当前技能栏', '对照岗位要求排序', '生成草稿'],
  intro: ['读取已有材料', '组织三段结构', '生成草稿'],
}
export const stepsFor = (t?: Task) => {
  if (t?.aiKind && STEP_LABELS[t.aiKind]) return STEP_LABELS[t.aiKind]
  const help = t ? aiHelp(t) : null
  if (help === 'message') return ['读取事项', '想好要说的话', '写出消息草稿']
  if (help === 'judge') return ['读取岗位信息', '对照你的材料', '写出判断']
  return ['读取事项', '拆成可执行的小步', '生成草稿']
}

/** 撤销时不需要清掉快照的动作（只是对话或界面提示） */
const UNDO_SAFE = new Set<Action['type']>(['chat', 'dismiss_completed', 'feedback'])

interface AppContextValue {
  state: AppState
  dispatch: (a: Action) => void
  page: Page
  go: (p: Page) => void
  drawer: DrawerTarget | null
  /** 打开事项详情；editSteps 为 true 时直接进入“改步骤” */
  openTask: (id: string, opts?: { editSteps?: boolean }) => void
  openArtifact: (id: string, cursor?: number) => void
  closeDrawer: () => void
  assistantOpen: boolean
  setAssistantOpen: (v: boolean) => void
  wide: boolean
  processing: { taskId: string; step: number } | null
  runAI: (taskId: string) => void
  organizingAll: boolean
  runOrganize: () => void
  nowView: 'home' | 'self'
  setNowView: (v: 'home' | 'self') => void
  focusMode: boolean
  setFocusMode: (v: boolean) => void
  stuckFor: string | null
  setStuckFor: (id: string | null) => void
  /** 正在为哪件事“约个时间”（首页卡片里展开时间选项） */
  planFor: string | null
  setPlanFor: (id: string | null) => void
  /** 约定开始时间：记到进展，可撤销。从助手里约时不移动焦点（refocus: false） */
  bookPlan: (taskId: string, at: Date, opts?: { refocus?: boolean }) => boolean
  /** 不按约定来了：start 是现在就做，cancel 是撤回约定 */
  cancelPlan: (taskId: string, reason: 'start' | 'cancel') => void
  /** 新手引导：first 是第一次打开时自动出现，manual 是从菜单里主动打开 */
  onboarding: false | 'first' | 'manual'
  setOnboarding: (v: false | 'first' | 'manual') => void
  toast: Toast | null
  showToast: (text: string, undo?: () => void) => void
  hideToast: () => void
  /** 只给读屏软件听的提示（例如“完成了：……”） */
  announcement: string
  announce: (text: string) => void
  say: (text: string, action?: ChatAction) => void
  loadScenario: (s: Scenario) => void
  resetDemo: () => void
  /** 完成类操作：派发后保留一份快照，横幅里可以“撤销” */
  completeWithUndo: (a: Action, taskId: string) => void
  canUndo: (taskId: string) => boolean
  undoComplete: () => void
  restDecision: RestDecision
  decideRest: (d: RestDecision) => void
  registerBack: (fn: () => void) => () => void
}

const Ctx = createContext<AppContextValue | null>(null)

const pageFromHash = (): Page => {
  const h = location.hash.replace('#', '')
  return (['now', 'plan', 'inbox', 'progress'] as Page[]).includes(h as Page) ? (h as Page) : 'now'
}

const VIEW_KEY = `${STORAGE_KEY}-view`
const ONBOARD_KEY = `${STORAGE_KEY}-onboarded`
let reloadCleaned = false
/** “今天到这里”的有效期：到第二天早上 5 点为止 */
const restKey = () => {
  const d = new Date()
  if (d.getHours() < 5) d.setDate(d.getDate() - 1)
  return `${STORAGE_KEY}-rest-${todayKey(d)}`
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, () => withFocusSteps(loadState()))
  const [page, setPage] = useState<Page>(pageFromHash)
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null)
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1280px)').matches)
  const [assistantOpen, setAssistantOpenRaw] = useState<boolean>(() => {
    // 窄屏上助手是浮层，进入时默认收起
    if (window.innerWidth < 1280) return false
    const v = readLS(`${STORAGE_KEY}-assistant`)
    if (v !== null) return v === '1'
    return window.innerWidth >= 1360
  })
  const [processing, setProcessing] = useState<{ taskId: string; step: number } | null>(null)
  const [organizingAll, setOrganizingAll] = useState(false)
  const [nowView, setNowViewRaw] = useState<'home' | 'self'>(() => (readLS(VIEW_KEY) === 'self' ? 'self' : 'home'))
  const [focusMode, setFocusMode] = useState(false)
  const [stuckFor, setStuckForRaw] = useState<string | null>(null)
  const [planFor, setPlanFor] = useState<string | null>(null)
  const [onboarding, setOnboardingRaw] = useState<false | 'first' | 'manual'>(() => (readLS(ONBOARD_KEY) === '1' ? false : 'first'))
  const [toast, setToast] = useState<Toast | null>(null)
  const [restDecision, setRestDecision] = useState<RestDecision>(() => readLS(restKey()) as RestDecision)
  const timers = useRef<number[]>([])
  const stateRef = useRef(state)
  stateRef.current = state
  const undoRef = useRef<{ snap: AppState; taskId: string } | null>(null)

  useEffect(() => saveState(state), [state])

  useEffect(() => {
    const m = window.matchMedia('(min-width: 1280px)')
    const h = () => setWide(m.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [])

  /** 任何会改数据的操作都会让“撤销完成”失效，避免撤销时连带丢掉之后的改动 */
  const dispatch = useCallback((a: Action) => {
    if (undoRef.current && !UNDO_SAFE.has(a.type)) undoRef.current = null
    rawDispatch(a)
  }, [])

  /** 开始做某件事（AI 帮做、我来做、卡住了）时，为它约的时间就用不上了（不管到没到点） */
  const startNow = useCallback(
    (taskId?: string | null) => {
      const t = taskById(stateRef.current, taskId)
      if (t?.planAt) dispatch({ type: 'set_plan', taskId: t.id, reason: 'start' })
    },
    [dispatch],
  )

  const setNowView = useCallback(
    (v: 'home' | 'self') => {
      if (v === 'self') startNow(stateRef.current.focusTaskId)
      setNowViewRaw(v)
      writeLS(VIEW_KEY, v === 'self' ? 'self' : null)
    },
    [startNow],
  )

  const setStuckFor = useCallback(
    (id: string | null) => {
      if (id) {
        startNow(id)
        setPlanFor(null)
      }
      setStuckForRaw(id)
    },
    [startNow],
  )

  const setOnboarding = useCallback((v: false | 'first' | 'manual') => {
    setOnboardingRaw(v)
    writeLS(ONBOARD_KEY, v ? null : '1')
  }, [])

  /* -------- 浏览器返回键：先关掉浮层，再在页面之间后退 -------- */

  const backStack = useRef<(() => void)[]>([])
  const [overlayCount, setOverlayCount] = useState(0)
  const overlayEntry = useRef(false)
  const ignorePop = useRef(false)

  const registerBack = useCallback((fn: () => void) => {
    backStack.current.push(fn)
    setOverlayCount((c) => c + 1)
    return () => {
      const i = backStack.current.lastIndexOf(fn)
      if (i >= 0) backStack.current.splice(i, 1)
      setOverlayCount((c) => c - 1)
    }
  }, [])

  useEffect(() => {
    // 刷新时可能停在一个“浮层”历史记录上：退回上一条（同一页），避免返回键空按一次
    if (history.state?.nsOverlay && !reloadCleaned) {
      reloadCleaned = true
      ignorePop.current = true
      history.back()
    }
  }, [])

  useEffect(() => {
    const open = overlayCount > 0
    if (open && !overlayEntry.current) {
      history.pushState({ nsOverlay: true }, '')
      overlayEntry.current = true
    } else if (!open && overlayEntry.current) {
      overlayEntry.current = false
      if (history.state?.nsOverlay) {
        ignorePop.current = true
        history.back()
      }
    }
  }, [overlayCount])

  useEffect(() => {
    const onPop = () => {
      if (ignorePop.current) {
        ignorePop.current = false
        return
      }
      if (backStack.current.length) {
        overlayEntry.current = false
        backStack.current[backStack.current.length - 1]()
        return
      }
      setPage(pageFromHash())
      setNowViewRaw('home')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const go = useCallback((p: Page) => {
    setPage(p)
    if (history.state?.nsOverlay) {
      overlayEntry.current = false
      if (location.hash === `#${p}` || (!location.hash && p === 'now')) {
        // 跳到的就是当前页：把浮层那条记录退掉
        ignorePop.current = true
        history.back()
      } else {
        // 跳到别的页：用新页替换浮层那条记录
        history.replaceState(null, '', `#${p}`)
      }
    } else if (location.hash !== `#${p}`) {
      history.pushState(null, '', `#${p}`)
    }
    setNowViewRaw('home')
    writeLS(VIEW_KEY, null)
    window.scrollTo({ top: 0 })
  }, [])

  const setAssistantOpen = useCallback((v: boolean) => {
    setAssistantOpenRaw(v)
    writeLS(`${STORAGE_KEY}-assistant`, v ? '1' : '0')
  }, [])

  const say = useCallback((text: string, action?: ChatAction) => {
    rawDispatch({ type: 'chat', messages: [{ id: uid('m'), role: 'assistant', text, at: now(), action }] })
  }, [])

  const showToast = useCallback((text: string, undo?: () => void) => {
    setToast({ id: Date.now(), text, undo })
  }, [])
  const hideToast = useCallback(() => setToast(null), [])
  const [announcement, setAnnouncement] = useState('')
  const announce = useCallback((text: string) => {
    setAnnouncement('')
    window.setTimeout(() => setAnnouncement(text), 60)
  }, [])

  const completeWithUndo = useCallback(
    (a: Action, taskId: string) => {
      const snap = stateRef.current
      rawDispatch(a)
      undoRef.current = { snap, taskId }
      const t = taskById(snap, taskId)
      if (t) announce(`完成了：${t.title}。已记到进展，可以撤销。`)
      // 走完一次主流程，就不需要新手引导了
      setOnboarding(false)
    },
    [announce, setOnboarding],
  )

  const canUndo = useCallback((taskId: string) => undoRef.current?.taskId === taskId, [])

  const undoComplete = useCallback(() => {
    const u = undoRef.current
    if (!u) return
    undoRef.current = null
    setDrawer(null)
    rawDispatch({ type: 'load', state: { ...u.snap, justCompleted: null } })
    showToast('已撤销，回到完成之前的状态')
  }, [showToast])

  const decideRest = useCallback((d: RestDecision) => {
    setRestDecision(d)
    writeLS(restKey(), d)
  }, [])

  const bookPlan = useCallback(
    (taskId: string, at: Date, opts: { refocus?: boolean } = {}) => {
      const refocus = opts.refocus ?? true
      const cur = stateRef.current
      const task = taskById(cur, taskId)
      if (!task) return false
      const label = planLabel(at)
      // 选项是打开面板时算的，隔了很久才点，时间可能已经过了
      if (at.getTime() <= Date.now() + 60_000) {
        showToast('这个时间已经过了，换一个吧')
        return false
      }
      const prevAt = task.planAt && new Date(task.planAt).getTime() > Date.now() ? task.planAt : undefined
      setPlanFor(null)
      setStuckForRaw(null)
      if (prevAt && new Date(prevAt).getTime() === at.getTime()) {
        showToast(`时间没变，还是${label}`)
        if (refocus) focusPrimary()
        return true
      }
      const eventId = uid('e')
      dispatch({ type: 'set_plan', taskId, at: at.toISOString(), eventId })
      showToast(`${prevAt ? '改到了' : '约好了'}：${label}`, () => {
        rawDispatch({ type: 'undo_plan', taskId, prevAt, eventId })
        showToast(prevAt ? '已撤销，恢复原来约的时间' : '已撤销，没有约时间')
        focusPrimary()
      })
      const where = cur.resume?.taskId === taskId ? cur.resume.where : undefined
      say(`好，${prevAt ? '改到' : '约在'}${label}。到时候先做这一步：${firstStepOf(task, where)}。可以加到日历，到点由日历提醒你。`)
      if (refocus) focusPrimary()
      return true
    },
    [dispatch, showToast, say],
  )

  const cancelPlan = useCallback(
    (taskId: string, reason: 'start' | 'cancel') => {
      const task = taskById(stateRef.current, taskId)
      dispatch({ type: 'set_plan', taskId, reason })
      if (task?.planCal) showToast('约定取消了。日历里那条提醒需要你自己删掉')
      else if (reason === 'cancel') showToast('已取消约好的时间')
      focusPrimary()
    },
    [dispatch, showToast],
  )

  const runAI = useCallback(
    (taskId: string) => {
      if (processing) return
      const task = taskById(stateRef.current, taskId)
      if (!task) return
      // 只有示例里的主线成果支持“补完”；消息、判断这类草稿已经写好了，直接打开，不覆盖你改过的内容
      const existingDraft = artifactById(stateRef.current, task.artifactId)
      if (existingDraft?.status === 'draft' && !task.aiKind) {
        setDrawer({ type: 'artifact', id: existingDraft.id })
        say('草稿在这里，你改过的内容都在。')
        return
      }
      setStuckFor(null)
      setPlanFor(null)
      startNow(taskId)
      if (stateRef.current.justCompleted) rawDispatch({ type: 'dismiss_completed' })
      setProcessing({ taskId, step: 0 })
      const t1 = window.setTimeout(() => setProcessing({ taskId, step: 1 }), 380)
      const t2 = window.setTimeout(() => setProcessing({ taskId, step: 2 }), 760)
      const t3 = window.setTimeout(() => {
        const cur = stateRef.current
        const t = taskById(cur, taskId)!
        const existing = artifactById(cur, t.artifactId)
        const reworking = existing?.status === 'draft'
        const draft = draftFor(t, reworking ? existing : undefined)
        const artifactId = existing?.id ?? uid('a')
        dispatch({ type: 'draft_ready', taskId, artifactId, draft })
        setProcessing(null)
        setDrawer({ type: 'artifact', id: artifactId })
        if (reworking) {
          showToast('AI 补完了草稿，你改过的部分都保留了', () => {
            rawDispatch({ type: 'load', state: cur })
            showToast('已撤销，草稿回到补完之前')
          })
        }
        say(
          reworking
            ? `“${t.title}”的草稿补完了，你改过的部分都保留了。采用之后才算完成。`
            : draft.use === 'step'
              ? `消息草稿写好了。改好后点“复制并用这版”，自己发出去，发完回来点“完成了”。`
              : draft.use === 'steps'
                ? `“${t.title}”拆好了几步，改好后点“用这几步”。`
                : `“${t.title}”的草稿准备好了。你可以直接改，采用之后才算完成。`,
        )
      }, 1150)
      timers.current.push(t1, t2, t3)
    },
    [processing, dispatch, say, showToast, setStuckFor, startNow],
  )

  const runOrganize = useCallback(() => {
    const items = inboxItems(stateRef.current).filter((t) => !t.suggestion)
    if (!items.length) {
      showToast('待整理里的事都已经有建议了')
      return
    }
    setOrganizingAll(true)
    dispatch({ type: 'organizing', ids: items.map((t) => t.id) })
    const timer = window.setTimeout(() => {
      const results: Record<string, OrganizeResult> = {}
      for (const t of items) results[t.id] = organize(t.title, t.due)
      dispatch({ type: 'organized', results })
      setOrganizingAll(false)
      const toPlan = Object.values(results).filter((r) => r.bucket === 'plan').length
      const dated = Object.values(results).filter((r) => r.due && daysFromToday(r.due) <= 7).length
      const rest = items.length - toPlan
      const parts = [
        toPlan ? `${toPlan} 件和找工作直接相关，建议加入规划` : '',
        dated ? `${dated} 件有近期期限，首页“有期限的事”里能看到` : '',
        rest ? `${toPlan ? '其余 ' : ''}${rest} 件建议放进维持安排、稍后考虑或归档` : '',
      ].filter(Boolean)
      showToast(`整理好了：${items.length} 件都有了建议，确认后才会移动`)
      say(`看完了 ${items.length} 件事：${parts.join('；')}。每条都附了理由，你确认后才会移动。`, {
        label: '查看整理结果',
        kind: 'page',
        target: 'inbox',
      })
    }, 950)
    timers.current.push(timer)
  }, [showToast, dispatch, say])

  const clearTransient = useCallback(() => {
    timers.current.forEach((t) => clearTimeout(t))
    timers.current = []
    undoRef.current = null
    setProcessing(null)
    setOrganizingAll(false)
    setDrawer(null)
    setStuckFor(null)
    setPlanFor(null)
    setFocusMode(false)
    setNowView('home')
    setRestDecision(null)
    writeLS(restKey(), null)
  }, [setNowView, setStuckFor])

  const loadScenario = useCallback(
    (s: Scenario) => {
      clearTransient()
      rawDispatch({ type: 'load', state: buildScenario(s) })
      go('now')
      const label = { normal: '普通启动', low: '低精力', resume: '中断后回来' }[s]
      showToast(`已切换到演示场景：${label}`)
    },
    [clearTransient, go, showToast],
  )

  const resetDemo = useCallback(() => {
    clearTransient()
    writeLS(STORAGE_KEY, null)
    // 恢复成第一次打开的样子，引导也回来
    setOnboarding('first')
    rawDispatch({ type: 'load', state: buildScenario('normal') })
    go('now')
    showToast('演示已重置为初始示例')
  }, [clearTransient, go, showToast, setOnboarding])

  const value = useMemo<AppContextValue>(
    () => ({
      state,
      dispatch,
      page,
      go,
      drawer,
      openTask: (id, opts) => setDrawer({ type: 'task', id, editSteps: opts?.editSteps }),
      openArtifact: (id, cursor) => setDrawer({ type: 'artifact', id, cursor }),
      closeDrawer: () => setDrawer(null),
      assistantOpen,
      setAssistantOpen,
      wide,
      processing,
      runAI,
      organizingAll,
      runOrganize,
      nowView,
      setNowView,
      focusMode,
      setFocusMode,
      stuckFor,
      setStuckFor,
      planFor,
      setPlanFor,
      bookPlan,
      cancelPlan,
      onboarding,
      setOnboarding,
      toast,
      showToast,
      hideToast,
      announcement,
      announce,
      say,
      loadScenario,
      resetDemo,
      completeWithUndo,
      canUndo,
      undoComplete,
      restDecision,
      decideRest,
      registerBack,
    }),
    [state, dispatch, page, go, drawer, assistantOpen, setAssistantOpen, wide, processing, runAI, organizingAll, runOrganize, nowView, setNowView, focusMode, stuckFor, setStuckFor, planFor, bookPlan, cancelPlan, onboarding, setOnboarding, toast, showToast, hideToast, announcement, announce, say, loadScenario, resetDemo, completeWithUndo, canUndo, undoComplete, restDecision, decideRest, registerBack],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp must be used inside AppProvider')
  return v
}

/** 浮层打开时登记一个“返回键处理”：手机上按返回，先关掉这个浮层 */
export function useBackHandler(open: boolean, onBack: () => void) {
  const { registerBack } = useApp()
  const ref = useRef(onBack)
  ref.current = onBack
  useEffect(() => {
    if (!open) return
    return registerBack(() => ref.current())
  }, [open, registerBack])
}
