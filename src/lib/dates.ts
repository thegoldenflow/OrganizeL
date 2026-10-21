const WEEK = ['日', '一', '二', '三', '四', '五', '六']

export function startOfDay(d = new Date()) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function isoDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function fromIso(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function daysFromToday(iso: string) {
  const ms = startOfDay(fromIso(iso)).getTime() - startOfDay().getTime()
  return Math.round(ms / 86400000)
}

export function weekdayLabel(d: Date) {
  return `周${WEEK[d.getDay()]}`
}

export function todayLabel() {
  const d = new Date()
  return `${d.getMonth() + 1}月${d.getDate()}日 · ${weekdayLabel(d)}`
}

export function greeting() {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

/** 期限的友好说明：今天 / 明天 / 周五（3 天后）/ 10月28日 */
export function dueLabel(iso: string) {
  const n = daysFromToday(iso)
  const d = fromIso(iso)
  if (n < 0) return `${d.getMonth() + 1}月${d.getDate()}日`
  if (n === 0) return '今天'
  if (n === 1) return '明天'
  if (n === 2) return '后天'
  if (n < 7) return `${weekdayLabel(d)}（${n} 天后）`
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** 时间线用的相对时间 */
export function relativeTime(at: string) {
  const t = new Date(at)
  const diff = Date.now() - t.getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const dayDiff = Math.round((startOfDay().getTime() - startOfDay(t).getTime()) / 86400000)
  const hm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
  if (dayDiff === 0) return `今天 ${hm}`
  if (dayDiff === 1) return `昨天 ${hm}`
  if (dayDiff < 7) return `${dayDiff} 天前`
  return `${t.getMonth() + 1}月${t.getDate()}日`
}

export function dayGroup(at: string) {
  const t = new Date(at)
  const dayDiff = Math.round((startOfDay().getTime() - startOfDay(t).getTime()) / 86400000)
  if (dayDiff <= 0) return '今天'
  if (dayDiff === 1) return '昨天'
  if (dayDiff < 7) return '本周早些时候'
  return '更早'
}

/** 过去某天某时刻（用于生成示例数据） */
export function pastAt(daysAgo: number, hour: number, minute = 0) {
  const d = addDays(startOfDay(), -daysAgo)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

const WEEK_MAP: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 }

/** 从一句话里识别期限：今天/明天/后天/周五/下周一/10月28日/28号 */
export function parseDue(text: string): string | undefined {
  const today = startOfDay()
  if (/今天|今晚/.test(text)) return isoDate(today)
  if (/明天|明晚/.test(text)) return isoDate(addDays(today, 1))
  if (/后天/.test(text)) return isoDate(addDays(today, 2))

  const next = text.match(/下(?:周|星期|礼拜)([一二三四五六日天])/)
  if (next) {
    const target = WEEK_MAP[next[1]]
    const cur = today.getDay()
    const toNextMonday = ((8 - cur) % 7) || 7
    const offset = toNextMonday + ((target + 6) % 7)
    return isoDate(addDays(today, offset))
  }
  const wk = text.match(/(?:周|星期|礼拜)([一二三四五六日天])/)
  if (wk) {
    const target = WEEK_MAP[wk[1]]
    const offset = (target - today.getDay() + 7) % 7
    return isoDate(addDays(today, offset))
  }
  const md = text.match(/(\d{1,2})月(\d{1,2})[日号]?/)
  if (md) {
    const d = new Date(today.getFullYear(), Number(md[1]) - 1, Number(md[2]))
    if (d < today) d.setFullYear(d.getFullYear() + 1)
    return isoDate(d)
  }
  const dd = text.match(/(\d{1,2})[日号]/)
  if (dd) {
    const d = new Date(today.getFullYear(), today.getMonth(), Number(dd[1]))
    if (d < today) d.setMonth(d.getMonth() + 1)
    return isoDate(d)
  }
  return undefined
}

/** 本周内某个星期几（若已过，取下周） */
export function upcomingWeekday(target: number) {
  const today = startOfDay()
  let offset = (target - today.getDay() + 7) % 7
  if (offset === 0) offset = 7
  return isoDate(addDays(today, offset))
}

/** 现在的钟点，例如 21:48 */
export function clockLabel(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 'HH:MM' → 当天的分钟数 */
export function minutesOf(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** 从“晚上 9 点半以后……”这类文字里读出钟点（没有结构化字段时的兜底） */
export function restTimeFromText(text: string): string | undefined {
  const m = text.match(/(晚上|下午)?\s*(\d{1,2})\s*点\s*(半|(\d{1,2})\s*分?)?\s*(以后|之后|后)/)
  if (!m) return undefined
  let h = Number(m[2])
  if ((m[1] === '晚上' || m[1] === '下午') && h < 12) h += 12
  const min = m[3] === '半' ? 30 : m[4] ? Number(m[4]) : 0
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export const todayKey = (d = new Date()) => isoDate(d)
