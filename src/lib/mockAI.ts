/**
 * 模拟 AI：全部是本地规则，没有调用任何模型。
 * - draftFor：为某个行动生成可查看的成果草稿
 * - organize：给待整理事项归类、建议去处和一句理由
 * - stuckAdjust：根据“卡在哪里”调整当前行动
 * - matchIntent：助手自由输入的关键词匹配
 */
import type { Adjust, Artifact, Bucket, Category, StuckReason, Task } from '../data/types'
import { parseDue } from './dates'

export const EXAMPLE_ROLE = 'AI 应用工程师 · 星河科技（示例岗位，虚构）'

export const PROJECT_BEFORE = `校园二手书交易平台（2024.03 – 2024.06）
负责后端开发，用 Python 和 Flask 写了接口，做了搜索功能，还接入了一个推荐功能。和三个同学一起完成，项目最后上线了。`

export const PROJECT_LINE_1 = '· 使用 Python / Flask 设计并实现商品、订单与搜索相关接口，负责后端数据模型与接口文档。'
const PROJECT_LINE_2 = '· 基于用户的浏览与收藏记录搭建相似书目推荐，完成从数据整理、规则设计到上线接入的完整流程。'
const PROJECT_LINE_3 = '· 项目在校内上线试运行；负责部署与日常问题排查，并根据同学反馈调整了搜索排序。'
const PROJECT_HEAD = '校园二手书交易平台 · 后端与推荐模块（4 人团队，2024.03 – 2024.06）'

/** “中断后回来”场景里，上次停下时的草稿 */
export const PROJECT_PARTIAL_HEAD = `${PROJECT_HEAD}
${PROJECT_LINE_1}
· 基于用户的浏览与收藏记录搭建相似书目推荐，`
export const PROJECT_PARTIAL = `${PROJECT_PARTIAL_HEAD}
· 项目最后上线了。`

type Draft = Pick<Artifact, 'title' | 'kind' | 'context' | 'before' | 'after' | 'note'>

export function draftFor(task: Task, existing?: Artifact): Draft {
  switch (task.aiKind) {
    case 'project': {
      const first = task.note?.trim() ? normalizeBullet(task.note) : PROJECT_LINE_1
      const ideal = [PROJECT_HEAD, first, PROJECT_LINE_2, PROJECT_LINE_3]
      return {
        title: '项目经历改写：校园二手书交易平台',
        kind: 'rewrite',
        context: `对应岗位：${EXAMPLE_ROLE}`,
        before: PROJECT_BEFORE,
        after: existing ? mergeKeepingEdits(existing.after, ideal) : ideal.join('\n'),
        note:
          existing
            ? '保留了你已经改好的部分，补完了第 2、3 条。没有加入原文没有的数字；如果记得真实的用户量或订单量，可以补在第 3 条。'
            : '示例岗位看重“把功能真正落地”，所以把一句“接入推荐功能”展开成完整过程，并写清你负责的范围。没有加入原文没有的数字；如果记得真实的用户量或订单量，可以补在第 3 条。',
      }
    }
    case 'skills':
      return {
        title: '技能栏调整',
        kind: 'rewrite',
        context: `对应岗位：${EXAMPLE_ROLE}`,
        before: '技能：Java、C++、HTML、CSS、Python、MySQL、Flask、Git、Photoshop、Office',
        after: task.note?.trim()
          ? `${task.note.trim()}\n后端与工程：Flask、MySQL、REST 接口设计、Git\nAI 相关：推荐规则设计与数据整理（见项目经历）`
          : '编程语言：Python（主力）、Java、SQL\n后端与工程：Flask、MySQL、REST 接口设计、Git\nAI 相关：推荐规则设计与数据整理（见项目经历）',
        note: '按岗位相关度排序，Python 和后端放在最前；Photoshop、Office 和岗位关系不大，先拿掉。“AI 相关”一行只写了项目里真实做过的事。',
      }
    case 'intro':
      return {
        title: '1 分钟自我介绍',
        kind: 'text',
        context: `对应岗位：${EXAMPLE_ROLE}`,
        after:
          '你好，我是［你的名字］，计算机专业应届毕业。过去一年我主要写 Python 后端，在校园二手书交易平台里负责接口和推荐模块，从整理数据、设计规则到上线都参与了。\n\n这个过程让我对“把算法真正用进产品”很感兴趣，这也是我申请 AI 应用工程师的原因。\n\n我希望加入一个落地节奏快的团队，在工程和 AI 应用之间多做实际的事情。',
        note: '按“我是谁—做过什么—为什么是这个岗位”三段组织，念出来约 1 分钟。名字留给你来填。',
      }
    case 'shortlist':
      return {
        title: '第一轮候选岗位',
        kind: 'list',
        after:
          '筛选标准：Python 后端为主 · 有 AI 或推荐相关业务 · 接受应届\n\n1. AI 应用工程师 · 星河科技 —— 匹配度高，已有对应简历\n2. 后端工程师（推荐方向）· 青禾网络\n3. 算法工程化工程师 · 远山数据\n4. Python 开发工程师 · 拾光教育\n5. 后端工程师 · 木棉出行',
        note: '以上都是演示用的虚构岗位。实际使用时，会根据你收藏的岗位来筛。',
      }
    case 'apply':
      return {
        title: '投递准备清单',
        kind: 'list',
        after:
          '· 简历：使用“AI 应用工程师”版本，导出 PDF\n· 每个岗位附一句为什么感兴趣（前 2 个已写好草稿）\n· 投递记录：岗位 / 日期 / 渠道 / 状态',
        note: '投递需要你本人完成，NextStep 不会替你发送。投完后在“进展”里记一笔，方便之后回看。',
      }
    case 'review':
      return {
        title: '投递回看要点',
        kind: 'list',
        after: '· 投了几个，收到几个回复\n· 哪类岗位回复更多\n· 面试里最常被问到简历的哪一部分\n· 下一轮要不要调整岗位方向或材料',
        note: '两周后对照这几条回看，再决定下一轮怎么投。',
      }
  }
  return genericDraft(task)
}

/** 补完草稿时保留用户已经写好的行：只替换没写完（以逗号结尾）或还是原文占位的行 */
const UNFINISHED = /[，,、：:]\s*$/
function mergeKeepingEdits(current: string, ideal: string[]) {
  const lines = current.split('\n')
  const out = ideal.map((line, i) => {
    const mine = lines[i]?.trim()
    if (!mine) return line
    const placeholder = mine === '· 项目最后上线了。'
    return UNFINISHED.test(mine) || placeholder ? line : lines[i]
  })
  // 用户自己多写的行原样留在后面
  return [...out, ...lines.slice(ideal.length).filter((l) => l.trim())].join('\n')
}

function normalizeBullet(text: string) {
  const t = text.trim().replace(/^[·•\-\s]+/, '')
  return `· ${t}`
}

function genericDraft(task: Task): Draft {
  const t = task.title
  if (/问(一下|问)?|联系|请教|打听/.test(t)) {
    const who = t.match(/问(?:一下)?([一-龥]{1,3}?)(?:，|,|他|她|最近|有没有|还|$)/)?.[1] ?? '对方'
    return {
      title: `消息草稿：${t}`,
      kind: 'text',
      after: `${who}，最近还好吗？想问下你们组最近有没有招人的计划？我在看 AI 应用和后端方向的岗位，如果方便的话，想请你帮我看看大概要求。不方便也完全没关系～`,
      note: '只是草稿，不会替你发送。改好后复制，自己发出去就行。',
    }
  }
  if (/内推|岗位|投/.test(t)) {
    return {
      title: `10 分钟判断：${t}`,
      kind: 'list',
      after:
        '和你方向一致的地方：Python 后端、接受应届\n不太确定的地方：岗位偏数据平台，和推荐方向关系一般\n建议：如果本周材料能准备好就投；来不及也不必勉强，它不在第一轮核心名单里。',
      note: '基于示例数据的判断，实际要不要投由你决定。',
    }
  }
  const byCat: Record<Category, string> = {
    求职: '1. 写下这件事要得到什么结果\n2. 准备需要的材料或信息\n3. 用 15 分钟完成第一版',
    生活: '1. 确认需要什么：时间、地点或物品\n2. 定一个具体时间，比如周末上午\n3. 做完回来点一下“完成”',
    学习: '1. 只定今天的量：读 10 页或学 20 分钟\n2. 记下一句收获\n3. 下次从这里接着开始',
    个人项目: '1. 写下最小可用的版本是什么\n2. 先做这一个功能点\n3. 给关心这件事的人一个大概时间',
    其他: '1. 先花 5 分钟确认需要什么\n2. 做最小的一步\n3. 做完回来点一下“完成”',
  }
  return {
    title: `拆解：${t}`,
    kind: 'list',
    after: byCat[task.category],
    note: '先把它拆成三步，第一步控制在 15 分钟以内。',
  }
}

/* ---------------- 待整理：归类与建议 ---------------- */

export interface OrganizeResult {
  category: Category
  bucket: Exclude<Bucket, 'inbox'>
  reason: string
  due?: string
}

export function organize(text: string, existingDue?: string): OrganizeResult {
  const due = existingDue ?? parseDue(text)
  const has = (re: RegExp) => re.test(text)

  if (has(/简历|岗位|面试|投递|内推|招人|招聘|求职|offer|自我介绍|作品集|笔试/i)) {
    return {
      category: '求职',
      bucket: 'plan',
      reason: due ? '属于找工作这条主线，并且有截止时间，先花 10 分钟判断' : '和当前方向直接相关，只需一个小动作，放进当前规划',
      due,
    }
  }
  if (has(/问(一下)?|联系|请教/) && has(/组|公司|团队|招/)) {
    return { category: '求职', bucket: 'plan', reason: '能直接拿到岗位信息，和当前方向一致', due }
  }
  if (has(/电费|水费|燃气|房租|房东|物业|热水器|空调|交费|缴费|修|自行车|超市|买|体检|医院|快递|洗衣|打扫|做饭|理发|证件|续费/)) {
    return {
      category: '生活',
      bucket: 'maintain',
      reason: due ? '基本生活事务，有截止时间，首页“有期限的事”里能看到' : '基本生活事务，找个固定时间做掉，不占用主线',
      due,
    }
  }
  if (has(/小程序|博客|项目|代码|功能|网站|app|插件|开源/i)) {
    const promised = has(/答应|朋友|别人/)
    return {
      category: '个人项目',
      bucket: 'later',
      reason: promised ? '答应过别人：建议先回个消息说明大概时间，再放到稍后' : '不影响当前方向，求职告一段落后再做',
      due,
    }
  }
  if (has(/数据密集|算法|系统设计|刷题|leetcode|面经/i)) {
    return { category: '学习', bucket: 'later', reason: '对面试有帮助，但不是当前阶段的关键；材料准备好后再排', due }
  }
  if (has(/学|读|看完|课程|法语|英语|日语|书|练习/)) {
    return { category: '学习', bucket: 'later', reason: '和当前方向关系不大，先放着也不会有损失', due }
  }
  if (has(/整理|桌面|相册|收拾/)) {
    return { category: '其他', bucket: 'archived', reason: '不影响任何安排，想做时随手做就好，先归档', due }
  }
  return {
    category: '其他',
    bucket: due ? 'maintain' : 'later',
    reason: due ? '有明确时间，先放进维持安排' : '暂时看不出紧急程度，先放稍后，随时能拿回来',
    due,
  }
}

/* ---------------- 卡住了：调整当前行动 ---------------- */

export function stuckAdjust(task: Task, reason: StuckReason): Adjust {
  if (reason === 'distracted') return { reason: 'distracted' }

  if (task.aiKind === 'project') {
    if (reason === 'unknown') {
      return {
        reason: 'unknown',
        hint: '照着这句改成你的说法就行，不用一次写完：',
        example: PROJECT_LINE_1,
      }
    }
    return {
      reason: 'too_big',
      smallTitle: '先确认一段已有经历',
      source: PROJECT_BEFORE,
      checks: [
        { id: 'time', label: '项目时间', value: '2024.03 – 2024.06' },
        { id: 'role', label: '你的角色', value: '后端开发，兼做推荐功能' },
        { id: 'team', label: '团队规模', value: '4 人（你和三个同学）' },
      ],
    }
  }
  if (task.aiKind === 'skills') {
    if (reason === 'unknown') {
      return { reason: 'unknown', hint: '先写第一行，按岗位最看重的能力开头：', example: '编程语言：Python（主力）、Java、SQL' }
    }
    return {
      reason: 'too_big',
      smallTitle: '先删掉和岗位无关的技能',
      checks: [
        { id: 'ps', label: 'Photoshop', value: '和岗位无关，可以删' },
        { id: 'office', label: 'Office', value: '默认技能，可以删' },
        { id: 'cpp', label: 'C++', value: '课程里用过，放到最后' },
      ],
    }
  }
  if (reason === 'unknown') {
    return {
      reason: 'unknown',
      hint: '先从这一句开始，改成你自己的情况：',
      example: task.steps?.[0] ? `第一步：${task.steps[0]}` : `我要完成的是：${task.title}。第一步先……`,
    }
  }
  return {
    reason: 'too_big',
    smallTitle: `先只做：${task.steps?.[0] ?? '花 5 分钟列出需要的东西'}`,
    checks: [{ id: 'one', label: '这一小步', value: task.steps?.[0] ?? '列出需要的东西，不用开始做' }],
  }
}

/* ---------------- 助手：关键词意图 ---------------- */

export type Intent =
  | { kind: 'continue' }
  | { kind: 'stuck'; reason?: StuckReason }
  | { kind: 'organize' }
  | { kind: 'show_artifact' }
  | { kind: 'goto'; page: 'plan' | 'progress' | 'inbox' | 'now' }
  | { kind: 'low_energy' }
  | { kind: 'done' }
  | { kind: 'capture'; text: string }

export function matchIntent(raw: string): Intent {
  const text = raw.trim()
  if (/^(继续|接着|下一步|开始|go)/i.test(text) || /接着做|继续做|往下/.test(text)) return { kind: 'continue' }
  if (/卡住|卡了|做不下去|不会|不知道怎么|太大|太多|太难|分心|走神|专注不了/.test(text)) {
    let reason: StuckReason | undefined
    if (/不知道怎么|不会|没思路/.test(text)) reason = 'unknown'
    else if (/太大|太多|太难|一大堆/.test(text)) reason = 'too_big'
    else if (/分心|走神|专注|刷手机/.test(text)) reason = 'distracted'
    return { kind: 'stuck', reason }
  }
  if (/帮我整理|^整理(一下)?$|整理待整理/.test(text)) return { kind: 'organize' }
  if (/草稿|成果|看看.*(写|改)|简历/.test(text) && text.length < 16) return { kind: 'show_artifact' }
  if (/规划|计划|阶段|路线|方向/.test(text) && text.length < 14) return { kind: 'goto', page: 'plan' }
  if (/进展|做了什么|完成了哪些|回顾/.test(text) && text.length < 14) return { kind: 'goto', page: 'progress' }
  if (/累|没精神|没精力|状态不好|好困|不想动|休息/.test(text) && text.length < 20) return { kind: 'low_energy' }
  if (/^(做完了|完成了|搞定)/.test(text)) return { kind: 'done' }
  return { kind: 'capture', text }
}
