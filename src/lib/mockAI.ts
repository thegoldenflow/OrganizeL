/**
 * 模拟 AI：全部是本地规则，没有调用任何模型。
 * - draftFor：为某个行动生成可查看的成果草稿
 * - breakdownFor / aiHelp：把一件事拆成几步；判断 AI 在这件事上能直接做出什么
 * - planDirection：换了近期方向时，拟一条新的阶段路线
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

type Draft = Pick<Artifact, 'title' | 'kind' | 'context' | 'before' | 'after' | 'note' | 'use'>

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
            ? '保留了你已经改好的部分，补完了第 2、3 条。除了团队人数（按原文“和三个同学一起完成”写成 4 人），没有加入原文没有的数字；如果记得真实的用户量或订单量，可以补在第 3 条。'
            : '示例岗位看重“把功能真正落地”，所以把一句“接入推荐功能”展开成完整过程，并写清你负责的范围。团队人数按原文“和三个同学一起完成”写成 4 人；除此之外没有加入原文没有的数字。如果记得真实的用户量或订单量，可以补在第 3 条。',
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
        note: '按岗位相关度排序，Python 和后端放在最前。Photoshop、Office 和岗位关系不大，C++、HTML、CSS 也不是这个岗位的重点，先拿掉了，需要可以加回来。SQL 是从 MySQL 的经验里单列出来的；“AI 相关”一行只写了项目里真实做过的事。',
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
  const help = aiHelp(task)
  if (help === 'message') {
    const w = who(t)
    const job = /招|组|岗位|内推|工作|面试/.test(t)
    return {
      title: `消息草稿：${t}`,
      kind: 'text',
      after: job
        ? `${w}，最近还好吗？想问下你们组最近有没有招人的计划？我在看 AI 应用和后端方向的岗位，如果方便的话，想请你帮我看看大概要求。不方便也完全没关系～`
        : `${w}，你好！想跟你说一下：［写上要说的事］。方便的时候回我一下就好，谢谢！`,
      note: job ? '只是草稿，不会替你发送。改好后复制，自己发出去；发完回来点“完成了”。' : '方括号里的部分换成你要说的事。不会替你发送，发完回来点“完成了”。',
      // 写好消息只是第一步，发出去才算做完
      use: 'step',
    }
  }
  if (help === 'judge') {
    return {
      title: `10 分钟判断：${t}`,
      kind: 'list',
      after:
        '和你方向一致的地方：Python 后端、接受应届\n不太确定的地方：岗位偏数据平台，和推荐方向关系一般\n建议：如果本周材料能准备好就投；来不及也不必勉强，它不在第一轮核心名单里。',
      note: '基于示例数据的判断，实际要不要投由你决定。',
    }
  }
  // AI 做不出成果的事，最多帮你拆步骤：采用后写进步骤，不算完成
  const b = breakdownFor(task)
  return {
    title: `拆解：${t}`,
    kind: 'list',
    after: b.steps.map((x, i) => `${i + 1}. ${x}`).join('\n'),
    note: '一行一步，第一步控制在 15 分钟以内。可以直接改，点“用这几步”会写进这件事的步骤。',
    use: 'steps',
  }
}

/** 草稿的“采用”按钮叫什么：采用之后算什么，按钮就说什么 */
export function adoptLabel(art: Pick<Artifact, 'use' | 'title'>) {
  const use = art.use ?? (art.title.startsWith('拆解：') ? 'steps' : 'result')
  return use === 'steps' ? '用这几步' : use === 'step' ? '复制并用这版' : '采用这版'
}

/* ---------------- 拆解：把一件事拆成几步 ---------------- */

/**
 * 拆步骤的规矩，最要紧的是第一步：
 * - 每一步用动词开头，写清具体对象。写“打开缴费 App，找到电费账单”，不写“准备一下”。
 * - 第一步 10–15 分钟能做完。“拆得更细”时，再在最前面加一个 2 分钟就能开始的起步动作。
 * - 一般拆 3 步：看得清路径，又不会长到让人发怵。
 */
export interface Breakdown {
  steps: string[]
  /** 2 分钟就能开始的起步动作，拆得更细时放在最前面 */
  starter: string
  estimate?: string
  criteria?: string
}

const MESSAGE_RE = /问(一下)?|联系|请教|打听|回[一-龥]{0,4}消息|回复|打(个|一)?电话/
/** 看着像“问、联系、回复”，其实不是要找人说话的词 */
const NOT_MESSAGE = /问题|问卷|访问|顾问|疑问|学问|联系方式|联系电话|回复情况|回复率/g
const looksLikeMessage = (t: string) => MESSAGE_RE.test(t.replace(NOT_MESSAGE, ''))
/** 只有真的要做决定（投不投）才算“判断”，提到“岗位”不算 */
const JUDGE_RE = /要不要投|该不该投|值不值得投|投不投|要不要申请|值不值得申请/

/** 从“问一下小林……”“回房东消息”里找出对象；认不出是人，就说“对方”，不硬凑 */
const PERSON = /^(?:小[一-龥]|老[一-龥]|阿[一-龥]|[一-龥]{0,2}(?:哥|姐|总|老师|同学|学长|学姐|师兄|师姐|经理|主管|领导)|妈妈?|爸爸?|房东|客户|朋友|同事|室友|导师|HR|hr|面试官|家人)/
function who(t: string) {
  const cand = t.replace(NOT_MESSAGE, '').match(/(?:问(?:一下)?|联系|请教|打听|回复?|给|和)([一-龥A-Za-z]{1,4}?)(?:，|,|他|她|最近|有没有|还|发|打|回|问|说|消息|电话|$)/)?.[1]
  return cand?.match(PERSON)?.[0] ?? '对方'
}

/** AI 在这件事上能直接做出什么：成果 / 消息草稿 / 判断。做不出东西就返回 null，首页就不显示“AI 先帮我做” */
export function aiHelp(task: Pick<Task, 'title' | 'aiKind'>): 'result' | 'message' | 'judge' | null {
  if (task.aiKind) return 'result'
  // 规划模板里排好的行动：要么带着 aiKind，要么就是你自己动手的事，不靠关键词猜
  if (TEMPLATE_STEPS.has(task.title)) return null
  if (/电话/.test(task.title)) return null
  if (looksLikeMessage(task.title)) return 'message'
  if (JUDGE_RE.test(task.title)) return 'judge'
  return null
}

/** 示例里那几件主线行动的标准步骤（示例数据和“AI 重新拆”共用同一份） */
export const AI_KIND_STEPS: Record<string, Breakdown> = {
  project: {
    starter: '打开简历文件',
    steps: ['打开简历里“校园二手书交易平台”这一段', '对照示例岗位要求，圈出 2 个相关职责', '按“做了什么—怎么做—结果如何”改写成 3 条'],
  },
  skills: { starter: '打开简历，翻到技能栏', steps: ['列出现在简历上的全部技能', '删掉和岗位无关的条目', '按相关度重新排序并分组'] },
  intro: { starter: '新建一个空白文档', steps: ['写下你是谁、做过什么', '补一句为什么想做这个岗位', '读一遍，删掉拗口的地方'] },
  shortlist: { starter: '打开收藏的岗位列表', steps: ['确认筛选标准', '从收藏的岗位里挑 5 个', '每个写一句为什么'] },
  apply: { starter: '打开简历，准备导出 PDF', steps: ['导出对应版本的简历', '逐个投递并记下日期', '在进展里记一笔'] },
  review: { starter: '打开投递记录', steps: ['数一下投递和回复', '看哪类岗位回复多', '决定下一轮怎么调'] },
}

export function breakdownFor(task: Pick<Task, 'title' | 'category'> & { aiKind?: string }): Breakdown {
  const t = task.title.replace(/\s+/g, ' ').trim()
  const kind = task.aiKind ? AI_KIND_STEPS[task.aiKind] : undefined
  if (kind) return kind
  const fixed = TEMPLATE_STEPS.get(t)
  if (fixed) return fixed

  if (looksLikeMessage(t)) {
    const w = who(t)
    if (/电话/.test(t)) {
      return {
        starter: `打开通讯录，找到${w}`,
        steps: ['想好要说的一两件事，写在手机备忘录里', `打给${w}`, '挂了电话，把要跟进的事记一笔'],
        estimate: '约 15 分钟',
        criteria: `和${w}通过电话`,
      }
    }
    return {
      starter: `打开和${w}的对话框`,
      steps: ['写好要发的消息（两三句就够，AI 可以先写一版）', `把消息发给${w}`, '收到回复后，在这里记一笔'],
      estimate: '约 10 分钟',
      criteria: `消息已经发给${w}`,
    }
  }
  if (JUDGE_RE.test(t)) {
    return {
      starter: '打开这个岗位的描述页面',
      steps: ['读岗位描述，圈出 3 个最重要的要求', '对照简历，看能对上几条', '能对上 2 条以上就投，记下日期；来不及就放下'],
      estimate: '约 20 分钟',
      criteria: '决定投还是不投，并记下来',
    }
  }
  if (/自行车|车胎|轮胎|单车/.test(t)) {
    return {
      starter: '把车推到能打气的地方',
      steps: ['先把胎打满气，过半天看还漏不漏', '还漏就二选一：买补胎工具自己补，或者送车行', '补好后骑一小圈确认'],
      estimate: '约 15 分钟（不含等待）',
      criteria: '车胎不再漏气',
    }
  }
  // “修改、修订、修复”不是修东西
  const fix = t.match(/修(?!改|订|复|正|饰|养|炼)(?:理|一下|好)?([一-龥A-Za-z]{1,6})/)?.[1]
  if (fix) {
    return {
      starter: `给坏掉的${fix}拍张照片`,
      steps: [`看清${fix}哪里坏了，拍张照片`, `找一家能修${fix}的店，确认营业时间或约上门`, '修好后试一下，记下花了多少钱'],
      estimate: '约 15 分钟（不含维修）',
      criteria: `${fix}修好了，能正常用`,
    }
  }
  if (/交|缴|付/.test(t) && /费|房租|账单/.test(t)) {
    const what = t.match(/(?:交|缴|付)(?:一下)?(?:这个月的?|本月的?|上个月的?)?([一-龥]{0,4}(?:费|房租|账单))/)?.[1] ?? '账单'
    return {
      starter: '打开手机上的缴费 App',
      steps: [`打开缴费 App，找到${/费$/.test(what) ? `${what}账单` : what}`, '核对金额后付款', '截图保存缴费记录'],
      estimate: '约 10 分钟',
      criteria: `${what}已经交了`,
    }
  }
  if (/体检|医院|看牙|牙医|挂号|预约/.test(t)) {
    return {
      starter: '打开预约用的 App 或网站',
      steps: ['查清预约方式和要带的证件', '选一个时间预约', '把预约时间加到日历'],
      estimate: '约 15 分钟',
      criteria: '时间约好了',
    }
  }
  if (/桌面|文件夹|下载/.test(t) && /整理|清理|收拾/.test(t)) {
    return {
      starter: '在桌面上新建一个“待整理”文件夹',
      steps: ['把桌面上的文件全部拖进“待整理”', '只把这周要用的拿回桌面', '“待整理”里的东西，有空时再看'],
      estimate: '约 10 分钟',
      criteria: '桌面上只剩这周要用的东西',
    }
  }
  const tidy = t.match(/(?:整理|收拾|打扫)(?:一下)?([一-龥]{1,6})/)?.[1]
  if (tidy && /房间|衣柜|厨房|书桌|抽屉|冰箱|阳台|桌子|柜子|客厅|卫生间|浴室|家里|屋子|宿舍|鞋柜|书架/.test(t)) {
    return {
      starter: '定一个 15 分钟的计时',
      steps: [`只整理${tidy}里的一小块，定 15 分钟`, '要扔的东西放进一个袋子', '剩下的放回固定的位置'],
      estimate: '约 15 分钟',
    }
  }
  if (tidy) {
    // 笔记、资料、思路这类不是实物：先归拢，再分类
    return {
      starter: `把要整理的${tidy}都打开`,
      steps: [`把要整理的${tidy}集中到一个地方`, '先粗分成 3 类', '每类留下最有用的，其余放进“以后再看”'],
      estimate: '约 20 分钟',
    }
  }
  const book = t.match(/《([^》]+)》/)?.[1]
  if (book || /^(读|看完)/.test(t)) {
    const ch = t.match(/第\s*([0-9一二三四五六七八九十]+)\s*章/)?.[1]
    const name = book ? `《${book}》` : '这本书'
    return {
      starter: `把${name}拿到手边${ch ? `，翻到第 ${ch} 章` : ''}`,
      steps: [ch ? `翻到第 ${ch} 章，先看小标题和章末总结` : `翻到${name}上次停下的地方`, '读一节，大约 10 页', '写下一句收获，记下下次从哪接着读'],
      estimate: '约 30 分钟',
      criteria: ch ? `读完第 ${ch} 章` : undefined,
    }
  }
  const learn = t.match(/学(?:习|一下|点|会)?([一-龥A-Za-z]{1,8})/)?.[1]
  if (learn && !/学校|学生|数学|学期|学费|同学|学长|学姐|大学|放学|开学|学历/.test(t)) {
    return {
      starter: `下载或打开一个${learn}入门 App`,
      steps: [`选一份${learn}入门材料，只选一个`, '今天先学 20 分钟：第一课', '定下每周固定的学习时间'],
      estimate: '约 30 分钟',
      criteria: `开始学${learn}，定好了每周的时间`,
    }
  }
  if (/小程序|博客|网站|app|插件|开源|功能|代码|项目/i.test(t)) {
    const promised = /答应|朋友|别人/.test(t)
    return {
      starter: '打开项目文件夹和编辑器',
      steps: promised
        ? ['先回朋友一句，说清大概什么时候能做好', '用一句话写下这个功能最小要做到什么', '只做这一个功能点，先做 25 分钟']
        : ['用一句话写下这次最小要做到什么', '只做这一个功能点，先做 25 分钟', '记下做到哪了，下次从这里接着'],
      estimate: '约 40 分钟',
      criteria: promised ? '朋友知道了大概什么时候能用上' : '第一个功能点能用了',
    }
  }
  const buy = t.match(/买(?:一下|个|些|点)?([一-龥A-Za-z]{1,8})/)?.[1]
  if (buy) {
    return {
      starter: '打开购物 App 或手机备忘录',
      steps: [`写下要买的${buy}和数量`, '比较两家，选一家', '下单，或者出门顺路买回来'],
      estimate: '约 20 分钟',
      criteria: `${buy}买到了`,
    }
  }
  // 按分类兜底：第一步仍然写成一个具体的动作
  const byCat: Record<Category, Breakdown> = {
    求职: { starter: '打开和这件事有关的网页或文件', steps: ['花 5 分钟写下这件事做完是什么样', '先做最关键的一部分，计时 20 分钟', '检查一遍，记下还差什么'], estimate: '约 30 分钟' },
    生活: { starter: '打开手机备忘录', steps: ['写下需要什么：时间、地点或东西', '定一个具体时间，比如周末上午', '到时间做完，回来点一下“完成了”'], estimate: '约 15 分钟' },
    学习: { starter: '把学习材料打开，放在手边', steps: ['只定今天的量：读 10 页或学 20 分钟', '计时开始，做完今天的量', '写下一句收获和下次从哪接着'], estimate: '约 25 分钟' },
    个人项目: { starter: '打开项目文件夹', steps: ['用一句话写下这次最小要做到什么', '只做第一个小功能点，先做 25 分钟', '记下做到哪了，下次从这里接着'], estimate: '约 30 分钟' },
    其他: { starter: '把需要的东西打开或拿到手边', steps: ['花 5 分钟写下这件事做完是什么样', '做最小的一步，计时 15 分钟', '回来记一笔，决定下一步'], estimate: '约 20 分钟' },
  }
  return byCat[task.category]
}

/** 拆得更细：在最前面加一个 2 分钟就能开始的起步动作（已经有了就不重复加） */
export function withStarter(steps: string[], task: Pick<Task, 'title' | 'category'>) {
  const starter = `先花 2 分钟：${breakdownFor(task).starter}`
  return steps[0]?.startsWith('先花 2 分钟') ? steps : [starter, ...steps]
}

/* ---------------- 换了方向：拟一条新的阶段路线 ---------------- */

type TplTask = { title: string; why?: string; aiKind?: string } & Breakdown
export interface PlanTemplate {
  kind: 'job' | 'learn' | 'fitness' | 'project' | 'general'
  horizon: string
  adjustCondition: string
  category: Category
  stages: { title: string; outcome: string; tasks: TplTask[] }[]
}

const T = (title: string, steps: string[], estimate: string, extra: Partial<TplTask> = {}): TplTask => ({
  title,
  steps,
  estimate,
  starter: extra.starter ?? '把需要的东西打开或拿到手边',
  ...extra,
})

const TEMPLATES: Record<PlanTemplate['kind'], Omit<PlanTemplate, 'kind'>> = {
  job: {
    horizon: '未来 6–8 周',
    adjustCondition: '完成一轮投递并收到反馈后，再检查材料和岗位方向。',
    category: '求职',
    stages: [
      {
        title: '澄清目标岗位',
        outcome: '确定 1–2 类目标岗位，选出 3 个示例岗位作为参照',
        tasks: [
          T('浏览 10 个岗位描述，标出共同要求', ['打开招聘网站，搜目标岗位的名称', '读 10 个岗位描述，把反复出现的要求记下来', '圈出你已经具备的和还缺的'], '约 40 分钟', {
            why: '先看清市场要什么，后面改材料才有方向。',
            criteria: '有一份共同要求的清单',
            starter: '打开招聘网站',
          }),
          T('选出 3 个示例岗位作为参照', ['从刚才看的岗位里挑出最想去的 5 个', '对照你的经历，留下最能对上的 3 个', '把这 3 个的链接存在一个地方'], '约 20 分钟', { criteria: '有 3 个示例岗位' }),
        ],
      },
      {
        title: '准备对应的材料',
        outcome: '一份对准目标岗位的简历，加一段 1 分钟自我介绍',
        tasks: [
          T('按目标岗位改写简历里最相关的一段经历', ['打开简历，找到和岗位最相关的那段经历', '对照岗位要求，圈出 2 个能对上的职责', '按“做了什么—怎么做—结果如何”改写成 3 条'], '约 30 分钟', { aiKind: 'project' }),
          T('调整技能栏的顺序和措辞', ['列出简历上现有的全部技能', '删掉和岗位无关的', '按相关度重新排序并分组'], '约 15 分钟', { aiKind: 'skills' }),
          T('准备一段 1 分钟自我介绍', ['写下你是谁、做过什么', '补一句为什么想做这个岗位', '读出来计时，删掉拗口的地方'], '约 25 分钟', { aiKind: 'intro' }),
        ],
      },
      {
        title: '投递并根据反馈调整',
        outcome: '完成第一轮投递，根据回复决定要不要调整',
        tasks: [
          T('挑出第一轮要投的 5 个岗位', ['定下筛选标准，写成一句话', '从收藏的岗位里挑 5 个', '每个写一句为什么投它'], '约 30 分钟', { aiKind: 'shortlist' }),
          T('完成第一轮投递', ['导出对应版本的简历', '逐个投递，记下日期和渠道', '在进展里记一笔'], '分 2–3 次完成', { aiKind: 'apply' }),
          T('两周后回看投递结果', ['数一数投了几个、收到几个回复', '看哪类岗位回复更多', '决定下一轮要不要调整方向或材料'], '约 20 分钟', { aiKind: 'review' }),
        ],
      },
    ],
  },
  learn: {
    horizon: '未来 8–12 周',
    adjustCondition: '做完第一次模拟测试后，再看要不要换材料或调整节奏。',
    category: '学习',
    stages: [
      {
        title: '定目标和材料',
        outcome: '写清楚学到什么程度算达标，选定一套主材料',
        tasks: [
          T('写下学到什么程度算达标', ['用一句话写下学成后能做到什么', '定一个检验方式，比如一次模拟测试', '写下大概的截止日期'], '约 15 分钟', {
            why: '目标说得清，才知道每次练习是不是在往前走。',
            criteria: '有一句话的目标和检验方式',
            starter: '打开手机备忘录，新建一条笔记',
          }),
          T('选定一套主材料', ['列出手头已有的材料', '只选一套做主材料，其他的先放一边', '把主材料的第一课打开，放在手边'], '约 20 分钟'),
        ],
      },
      {
        title: '固定节奏练习',
        outcome: '每周练 3 次，累计练满 12 次',
        tasks: [
          T('定下每周 3 个固定的学习时间', ['看一眼这周的日程，找出 3 个空档', '把这 3 个时间加到日历', '每次只定 25 分钟'], '约 10 分钟'),
          T('完成前 4 次练习', ['第 1 次：从第一课开始，学 25 分钟', '每次结束时写下卡住的地方', '下一次先花 5 分钟复习卡住的地方'], '每次约 25 分钟'),
        ],
      },
      {
        title: '检验并调整',
        outcome: '做一次模拟测试，按结果调整方法',
        tasks: [
          T('做一次模拟测试或找人对练', ['找一套模拟题，或一个能对练的人', '按正式要求完整做一次', '记下最弱的两项'], '约 60 分钟'),
          T('根据结果调整材料或节奏', ['估一下最弱的两项各要多少时间补', '决定换材料还是加练习', '更新每周的学习时间'], '约 20 分钟'),
        ],
      },
    ],
  },
  fitness: {
    horizon: '未来 6 周',
    adjustCondition: '累计完成 12 次之后，再决定要不要加量。',
    category: '生活',
    stages: [
      {
        title: '找到起点',
        outcome: '知道自己现在能做到什么程度，定好起步量',
        tasks: [
          T('记下现在的起点', ['选一个简单的测试，比如能连续跑多久', '今天做一次，记下结果', '定一个轻松就能完成的起步量'], '约 30 分钟', {
            why: '从现在能做到的量开始，才坚持得下去。',
            criteria: '记下了起点和起步量',
            starter: '换上运动鞋',
          }),
          T('准备好装备和时间', ['检查鞋和衣服能不能用', '找出每周 3 个固定时间', '把这 3 个时间加到日历'], '约 15 分钟'),
        ],
      },
      {
        title: '固定下来',
        outcome: '每周 3 次，累计完成 12 次',
        tasks: [
          T('完成前 4 次', ['按起步量做第 1 次', '每次做完记一笔', '觉得太累就把量减半，但不要停'], '每次约 30 分钟'),
          T('再完成 8 次', ['保持起步量，按固定时间做', '错过一次就往后顺延，不用补练', '记下哪次感觉最好'], '每次约 30 分钟'),
        ],
      },
      {
        title: '回看并加量',
        outcome: '和起点对比，决定下一阶段的量',
        tasks: [
          T('和起点对比一次', ['用第一次的测试再测一次', '和起点的结果对比', '记下变化'], '约 30 分钟'),
          T('决定下一阶段的量', ['觉得轻松：加 10% 的量', '觉得吃力：保持不变', '把新的安排写进日历'], '约 10 分钟'),
        ],
      },
    ],
  },
  project: {
    horizon: '未来 4–6 周',
    adjustCondition: '至少 3 个人试用之后，再决定下一步做什么。',
    category: '个人项目',
    stages: [
      {
        title: '定最小版本',
        outcome: '用一页纸写清楚最小能用的版本',
        tasks: [
          T('写下这个项目给谁用、解决什么', ['用一句话写下给谁用', '再用一句话写下帮他解决什么麻烦', '写下他现在是怎么凑合的'], '约 20 分钟', {
            why: '先说清楚给谁用，后面砍功能才有依据。',
            criteria: '三句话写清楚了',
            starter: '新建一个空白文档',
          }),
          T('列出最小版本只做的 3 个功能', ['把想到的功能全部列出来', '只留下没有就不能用的 3 个', '其余的放进“以后再说”'], '约 20 分钟'),
        ],
      },
      {
        title: '做出第一版',
        outcome: '最小版本能从头到尾跑通',
        tasks: [
          T('做第一个功能', ['打开项目，建好需要的文件', '先做 25 分钟，只做最简单的版本', '自己试一遍，记下问题'], '约 1 小时'),
          T('做完剩下两个功能', ['做第二个功能', '做第三个功能', '从头到尾自己用一遍'], '分 2–3 次完成'),
        ],
      },
      {
        title: '给人试用并改',
        outcome: '至少 3 个人试用过，收集到反馈',
        tasks: [
          T('找 3 个人试用', ['想 3 个可能会用的人', '给每人发一句邀请和链接', '记下他们卡住的地方'], '约 30 分钟'),
          T('按反馈改最重要的一处', ['把反馈按出现次数排序', '只改排第一的那一处', '改完告诉提出的人'], '约 1 小时'),
        ],
      },
    ],
  },
  general: {
    horizon: '未来 4–8 周',
    adjustCondition: '完成第一块之后，再检查方向对不对。',
    category: '其他',
    stages: [
      {
        title: '弄清楚要什么',
        outcome: '写清楚做到什么样算达成',
        tasks: [
          T('写下做到什么样算达成', ['用一句话写下最后想看到的样子', '写下一个能检查的标准', '写下大概的截止时间'], '约 15 分钟', {
            why: '先说清楚终点，后面每一步才知道往哪走。',
            criteria: '写清楚了目标和检查标准',
            starter: '打开手机备忘录，新建一条笔记',
          }),
          T('列出需要的东西和要问的人', ['列出需要的东西', '列出可以问的人', '圈出最先要弄到的一样'], '约 15 分钟'),
        ],
      },
      {
        title: '分块推进',
        outcome: '最重要的一块先完成',
        tasks: [
          T('挑出最重要的一块', ['把要做的事分成 3 块', '挑出最重要的一块', '写下这一块的第一步'], '约 15 分钟'),
          T('完成这一块的第一版', ['按第一步开始，做 25 分钟', '做完这一块的第一版', '记下还差什么'], '分 2–3 次完成'),
        ],
      },
      {
        title: '回头检查',
        outcome: '对照目标检查一次，决定下一步',
        tasks: [
          T('对照目标检查一次', ['拿出第一阶段写的标准', '逐条对照现在的情况', '记下差距'], '约 20 分钟'),
          T('决定继续、调整还是放下', ['差距小：继续下一块', '差距大：换个做法', '已经不重要了：放下也没关系'], '约 10 分钟'),
        ],
      },
    ],
  },
}

/** 模板里每个行动的步骤：行动变成“当前行动”时才拿出来用（用到时再拆） */
const TEMPLATE_STEPS = new Map<string, Breakdown>(
  Object.values(TEMPLATES).flatMap((tpl) => tpl.stages.flatMap((st) => st.tasks.map((x) => [x.title, x] as const))),
)

export function directionKind(title: string): PlanTemplate['kind'] {
  if (/工作|岗位|求职|面试|offer|实习|跳槽|转行|工程师|简历/i.test(title)) return 'job'
  // “学”要排除学校、学生这类词；“考”只认考试、考证、考研，“考虑、思考”不算
  if (/学(?!校|生|期|费|长|姐|历)|考试|考证|考研|雅思|托福|证书|课程|英语|法语|日语|德语|韩语|语言/.test(title)) return 'learn'
  if (/跑|健身|运动|锻炼|减脂|减重|体重|马拉松|半马|游泳|瑜伽|体能/.test(title)) return 'fitness'
  if (/小程序|app|网站|产品|项目|开发|上线|创业|开源|做一个|做个/i.test(title)) return 'project'
  return 'general'
}

export function planDirection(title: string): PlanTemplate {
  const kind = directionKind(title)
  return { kind, ...TEMPLATES[kind] }
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
  // 已经勾掉的步骤不再拿出来：从第一个还没做的那一步开始
  const steps = task.steps ?? []
  const done = new Set(task.stepsDone ?? [])
  const i = steps.findIndex((_, k) => !done.has(k))
  const step = i >= 0 ? steps[i] : undefined
  if (reason === 'unknown') {
    return {
      reason: 'unknown',
      hint: '先从这一句开始，改成你自己的情况：',
      example: step ? `第 ${i + 1} 步：${step}` : `我要完成的是：${task.title}。第一步先……`,
    }
  }
  return {
    reason: 'too_big',
    smallTitle: `先只做：${step ?? '花 5 分钟列出需要的东西'}`,
    stepIndex: step ? i : undefined,
    checks: [{ id: 'one', label: '这一小步', value: step ?? '列出需要的东西，不用开始做' }],
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
  | { kind: 'schedule'; when?: 'tonight' | 'morning' | 'tomorrow-night' | 'weekend' }

export function matchIntent(raw: string): Intent {
  const text = raw.trim()
  // “晚点再做 / 明天再说 / 约个时间”：把当前这件事约到之后。整句都是这个意思才算，
  // “交电费明天再说吧”“和房东约个时间看房”这类带着别的事的话，仍然记到待整理
  const later = text.replace(/^(现在不方便|现在没空)[，,、\s]*/, '')
  if (
    /^(先|那)?(约个?时间|现在不方便|现在没空)(吧|呢|了)?[。！!~～]*$/.test(text) ||
    /^(那|这个|这件事|这件)?(就)?(先)?(晚点|待会|等会|一会儿?|今晚|晚上|明天|明早|明晚|周末|改天|回头|下次)(再|才)(做|弄|写|改|说|来|开始|看)?(吧|了|呢)?[。！!~～]*$/.test(later)
  ) {
    const when = /明晚/.test(text)
      ? ('tomorrow-night' as const)
      : /明早|明天/.test(text)
        ? ('morning' as const)
        : /今晚|晚上/.test(text)
          ? ('tonight' as const)
          : /周末/.test(text)
            ? ('weekend' as const)
            : undefined
    return { kind: 'schedule', when }
  }
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
