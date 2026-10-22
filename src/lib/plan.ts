/**
 * “约个时间”：现在不方便时，先定好什么时候开始。
 *
 * 依据是执行意图（implementation intention，Gollwitzer, 1999）：
 * 把“我要做 X”改成“到了时间 T，我就先做第一步 Y”，执行率明显更高
 * （94 项研究的元分析，Gollwitzer & Sheeran, 2006：效应量 d ≈ 0.65）。
 * 所以这里一定同时写出“什么时候”和“先做哪一步”，而不只是一个提醒时间。
 */
import type { Task } from '../data/types'
import { addDays, minutesOf, restTimeFromText, startOfDay, weekdayLabel } from './dates'

const DAY = 86_400_000

const at = (d: Date, h: number, m = 0) => {
  const x = new Date(d)
  x.setHours(h, m, 0, 0)
  return x
}

/** 以周一为一周的开始 */
function weekStart(d: Date) {
  const x = startOfDay(d)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

function period(h: number) {
  if (h < 5) return '凌晨'
  if (h < 10) return '早上'
  if (h < 12) return '上午'
  if (h < 13) return '中午'
  if (h < 18) return '下午'
  return '晚上'
}

/** 钟点的口语说法：9 点 / 8 点半 / 8:15。凌晨用 0–4 点，避免“凌晨 12 点”这种说不清的写法 */
function clockWord(d: Date) {
  const raw = d.getHours()
  const h = raw < 5 ? raw : raw % 12 || 12
  const m = d.getMinutes()
  if (m === 0) return `${h} 点`
  if (m === 30) return `${h} 点半`
  return `${h}:${String(m).padStart(2, '0')}`
}

/** 口语化的时间：今晚 8 点 / 明早 9 点 / 周六上午 10 点 / 下周二晚上 8 点 */
export function planLabel(when: Date, now = new Date()) {
  const days = Math.round((startOfDay(when).getTime() - startOfDay(now).getTime()) / DAY)
  const p = period(when.getHours())
  const c = clockWord(when)
  if (days === 0) return p === '晚上' ? `今晚 ${c}` : `今天${p} ${c}`
  if (days === 1) return p === '晚上' ? `明晚 ${c}` : p === '早上' ? `明早 ${c}` : `明天${p} ${c}`
  if (days === 2) return `后天${p} ${c}`
  const weeks = Math.round((weekStart(when).getTime() - weekStart(now).getTime()) / (7 * DAY))
  if (days > 0 && weeks === 0) return `${weekdayLabel(when)}${p} ${c}`
  if (days > 0 && weeks === 1) return `下${weekdayLabel(when)}${p} ${c}`
  return `${when.getMonth() + 1}月${when.getDate()}日${p} ${c}`
}

/** 不随日期变化的写法，用在进展时间线里：10月20日（周二）20:00 */
export function planAbsolute(when: Date) {
  const hm = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`
  return `${when.getMonth() + 1}月${when.getDate()}日（${weekdayLabel(when)}）${hm}`
}

/* ---------------- 用户自己定的规矩 ---------------- */

const WEEK: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }

export interface PlanRules {
  /** 不安排任务的日子，例如“周日不安排任务” */
  offDays: { day: number; title: string }[]
  /** 几点以后不处理这类事，例如“晚上 9 点半以后，不再处理求职的事” */
  restAt?: { at: string; title: string }
}

/** 从“维持安排”里读出用户定过的规矩，约时间时绕开它们 */
export function planRulesFor(tasks: Task[], task?: Task): PlanRules {
  const rules: PlanRules = { offDays: [] }
  for (const t of tasks) {
    if (t.bucket !== 'maintain' || !t.rest) continue
    const m = t.title.match(/(?:周|星期|礼拜)([一二三四五六日天])(?:不安排|休息|不做)/)
    if (m) rules.offDays.push({ day: WEEK[m[1]], title: t.title })
    const r = restTimeFromText(t.title) ?? t.restAfter
    // 休息时间只管主线（求职）的事，和首页的休息提醒一致
    if (r && !rules.restAt && task?.category === '求职') rules.restAt = { at: r, title: t.title }
  }
  return rules
}

/** 这个时间和哪条规矩冲突（没有冲突返回 null） */
export function ruleConflict(when: Date, rules: PlanRules) {
  const off = rules.offDays.find((o) => o.day === when.getDay())
  if (off) return off.title
  if (rules.restAt) {
    const mins = when.getHours() * 60 + when.getMinutes()
    if (mins >= minutesOf(rules.restAt.at) || when.getHours() < 5) return rules.restAt.title
  }
  return null
}

/* ---------------- 常用时间 ---------------- */

export type PlanSlot = 'tonight' | 'morning' | 'tomorrow-night' | 'weekend'

export interface PlanOption {
  id: PlanSlot
  label: string
  hint: string
  at: Date
}

/** 凌晨还没睡时，“明早”指的是今天早上 */
const morningDayOf = (now: Date) => (now.getHours() < 5 ? startOfDay(now) : addDays(startOfDay(now), 1))

/** 某个常用时间点具体是哪一刻（不检查规矩，助手里“明晚再做”这类明确说法用它） */
export function planAtFor(slot: PlanSlot, now = new Date(), rules?: PlanRules): Date {
  const today = startOfDay(now)
  if (slot === 'tonight') return at(today, 20)
  if (slot === 'morning') return at(morningDayOf(now), 9)
  if (slot === 'tomorrow-night') return at(addDays(today, 1), 20)
  // 周末上午：“明早”之后的第一个不在休息日里的周六或周日
  let d = addDays(morningDayOf(now), 1)
  for (let i = 0; i < 14; i++, d = addDays(d, 1)) {
    const wd = d.getDay()
    if ((wd === 6 || wd === 0) && !rules?.offDays.some((o) => o.day === wd)) break
  }
  return at(d, 10)
}

/**
 * 三个常用时间点（选项少，选得快：Hick 定律）：
 * 都在 45 分钟以后，绕开用户定的休息日和休息时间，按时间先后排。
 */
export function planOptions(now = new Date(), rules: PlanRules = { offDays: [] }): PlanOption[] {
  const soon = now.getTime() + 45 * 60_000
  const make = (id: PlanSlot, when: Date): PlanOption => ({
    id,
    label: planLabel(when, now),
    hint: `${when.getMonth() + 1}月${when.getDate()}日 ${weekdayLabel(when)}`,
    at: when,
  })
  const okAt = (d: Date) => d.getTime() >= soon && !ruleConflict(d, rules)
  const list: PlanOption[] = []
  const tonight = planAtFor('tonight', now)
  if (okAt(tonight)) list.push(make('tonight', tonight))
  // “明早”：明早不行（比如明天是休息日）就顺延到下一个能安排的早上
  let morning = planAtFor('morning', now)
  for (let i = 0; i < 7 && !okAt(morning); i++) morning = addDays(morning, 1)
  if (okAt(morning)) list.push(make('morning', morning))
  if (!list.some((o) => o.id === 'tonight')) {
    const tn = planAtFor('tomorrow-night', now)
    if (okAt(tn) && tn.getTime() !== morning.getTime()) list.push(make('tomorrow-night', tn))
  }
  const weekend = planAtFor('weekend', now, rules)
  if (okAt(weekend) && !list.some((o) => startOfDay(o.at).getTime() === startOfDay(weekend).getTime())) list.push(make('weekend', weekend))
  return list.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 3)
}

/** 到时候先做的那一步：缩小过就用缩小后的；有草稿就从草稿接着来；否则用第一个没勾的步骤 */
export function firstStepOf(task: Task, resumeWhere?: string) {
  if (task.adjust?.reason === 'too_big') return task.adjust.smallTitle.replace(/^先(只做：)?/, '')
  if (resumeWhere) return `打开草稿，从${resumeWhere}接着改`
  if (task.status === 'draft') return '打开草稿看一遍，改好就采用'
  const steps = task.steps ?? []
  const done = new Set(task.stepsDone ?? [])
  const next = steps.findIndex((_, i) => !done.has(i))
  return steps[next === -1 ? 0 : next] ?? '花 5 分钟看一眼要做什么'
}

/** 'YYYY-MM-DDTHH:mm'，给 <input type="datetime-local"> 用（本地时间） */
export function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/* ---------------- 加到日历：生成 .ics 文件 ---------------- */

const icsTime = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** RFC 5545：每行不超过 75 个字节，超出的部分换行，续行以一个空格开头（中文按 UTF-8 字节算） */
function fold(line: string) {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const out: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const b = enc.encode(ch).length
    const limit = out.length === 0 ? 75 : 74
    if (bytes + b > limit) {
      out.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += b
  }
  out.push(cur)
  return out.join('\r\n ')
}

/** 从“约 20 分钟”这类说明里读出时长，读不出来就按 30 分钟 */
export function minutesFromEstimate(estimate?: string) {
  const m = estimate?.match(/(\d+)\s*分钟/)
  return m ? Math.min(180, Math.max(5, Number(m[1]))) : 30
}

export function planIcs(task: Task, when: Date, resumeWhere?: string) {
  const end = new Date(when.getTime() + minutesFromEstimate(task.estimate) * 60_000)
  const title = `NextStep：${task.title}`
  const detail = `到了就先做这一步：${firstStepOf(task, resumeWhere)}${task.criteria ? `\n完成标准：${task.criteria}` : ''}`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NextStep//Demo//ZH-CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    // 同一件事用同一个 UID、递增的 SEQUENCE：改了时间再导入，支持的日历会更新原来那条，而不是再加一条
    `UID:${task.id}@nextstep.demo`,
    `SEQUENCE:${Math.floor(Date.now() / 1000)}`,
    `DTSTAMP:${icsTime(new Date())}`,
    `DTSTART:${icsTime(when)}`,
    `DTEND:${icsTime(end)}`,
    `SUMMARY:${icsText(title)}`,
    `DESCRIPTION:${icsText(detail)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText(title)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** 在浏览器里生成文件并下载；手机上打开它会直接提示“加到日历” */
export function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
