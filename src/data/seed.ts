import type { AppState, Artifact, ChatMessage, Scenario, Task, TimelineEvent } from './types'
import { addDays, isoDate, pastAt, startOfDay } from '../lib/dates'
import { EXAMPLE_ROLE, PROJECT_BEFORE, PROJECT_PARTIAL, PROJECT_PARTIAL_HEAD } from '../lib/mockAI'

export const STORAGE_KEY = 'nextstep-demo-v1'
export const STATE_VERSION = 5

const inDays = (n: number) => isoDate(addDays(startOfDay(), n))

function baseTasks(): Task[] {
  const created = pastAt(6, 9)
  const t = (x: Partial<Task> & Pick<Task, 'id' | 'title' | 'category' | 'bucket'>): Task => ({
    order: 0,
    status: 'todo',
    createdAt: created,
    ...x,
  })

  return [
    /* 阶段一：澄清目标岗位（已完成） */
    t({
      id: 't-browse',
      title: '浏览 10 个岗位描述，标出共同要求',
      category: '求职',
      bucket: 'plan',
      stageId: 's1',
      order: 1,
      status: 'done',
      doneAt: pastAt(5, 10, 20),
    }),
    t({
      id: 't-roles',
      title: '选出 3 个示例岗位作为参照',
      category: '求职',
      bucket: 'plan',
      stageId: 's1',
      order: 2,
      status: 'done',
      artifactId: 'a-roles',
      doneAt: pastAt(4, 21, 5),
    }),

    /* 阶段二：准备与岗位对应的材料（当前） */
    t({
      id: 't-project',
      title: '为示例岗位改写一段项目经历',
      category: '求职',
      bucket: 'plan',
      stageId: 's2',
      order: 1,
      aiKind: 'project',
      estimate: '约 20 分钟',
      why: '示例岗位看重“把功能真正落地”，你的二手书平台项目最能对上。改好这一段，简历就有了核心内容。',
      criteria: '得到一段可以审阅和修改的项目描述',
      steps: ['打开简历里“校园二手书交易平台”这一段', '对照示例岗位要求，圈出 2 个相关职责', '按“做了什么—怎么做—结果如何”改写成 3 条'],
      reasons: [
        { label: '支持主线', text: '简历是投递的前提，这段项目是简历里最能对上岗位的部分' },
        { label: '临近节点', text: '计划下周开始第一轮投递，材料需要先准备好' },
        { label: '投入可控', text: '约 20 分钟，一次就能做完；AI 可以先写草稿' },
      ],
    }),
    t({
      id: 't-skills',
      title: '调整技能栏的顺序和措辞',
      category: '求职',
      bucket: 'plan',
      stageId: 's2',
      order: 2,
      aiKind: 'skills',
      estimate: '约 15 分钟',
      why: '让招聘方在 10 秒内看到 Python、后端和推荐相关的能力。',
      criteria: '技能栏按岗位相关度重新排序，去掉无关条目',
      steps: ['列出现在简历上的全部技能', '删掉和岗位无关的条目', '按相关度重新排序并分组'],
      reasons: [
        { label: '支持主线', text: '和刚改好的项目经历呼应，简历前半页就能对上岗位' },
        { label: '投入可控', text: '约 15 分钟，改动集中在一处' },
      ],
    }),
    t({
      id: 't-intro',
      title: '准备一段 1 分钟自我介绍',
      category: '求职',
      bucket: 'plan',
      stageId: 's2',
      order: 3,
      aiKind: 'intro',
      estimate: '约 25 分钟',
      why: '面试和内推沟通都会用到，提前准备能少一些临场紧张。',
      criteria: '写出一段能念出来、约 250 字的介绍',
      steps: ['写下你是谁、做过什么', '补一句为什么想做这个岗位', '读一遍，删掉拗口的地方'],
      reasons: [{ label: '支持主线', text: '材料阶段的最后一块，完成后就可以开始投递' }],
    }),

    /* 阶段三：投递并根据反馈调整（之后） */
    t({
      id: 't-pick',
      title: '挑出第一轮要投的 5 个岗位',
      category: '求职',
      bucket: 'plan',
      stageId: 's3',
      order: 1,
      aiKind: 'shortlist',
      estimate: '约 30 分钟',
      why: '集中投一轮，才能从回复里看出材料和方向是否合适。',
      criteria: '有一份 5 个岗位的名单和筛选标准',
      steps: ['确认筛选标准', '从收藏的岗位里挑 5 个', '每个写一句为什么'],
    }),
    t({
      id: 't-apply',
      title: '完成第一轮针对性投递',
      category: '求职',
      bucket: 'plan',
      stageId: 's3',
      order: 2,
      aiKind: 'apply',
      estimate: '分 2–3 次完成',
      why: '投递需要你本人完成；准备清单可以先由 AI 整理。',
      criteria: '5 个岗位都已由你本人投出，并记下日期和渠道',
      steps: ['导出对应版本的简历', '逐个投递并记下日期', '在进展里记一笔'],
    }),
    t({
      id: 't-review',
      title: '两周后回看回复情况，决定是否调整',
      category: '求职',
      bucket: 'plan',
      stageId: 's3',
      order: 3,
      aiKind: 'review',
      estimate: '约 20 分钟',
      criteria: '写下这一轮的结论和下一轮的调整',
      steps: ['数一下投递和回复', '看哪类岗位回复多', '决定下一轮怎么调'],
    }),

    /* 维持安排：休息与基本生活 */
    t({
      id: 'm-night',
      title: '晚上 9 点半以后，不再处理求职的事',
      category: '生活',
      bucket: 'maintain',
      schedule: '每天',
      rest: true,
      restAfter: '21:30',
      note: '上周两次熬夜改简历，第二天状态都不好。',
    }),
    t({ id: 'm-walk', title: '晚饭后散步 30 分钟', category: '生活', bucket: 'maintain', schedule: '每周三、周六', rest: true }),
    t({ id: 'm-sunday', title: '周日不安排任务', category: '生活', bucket: 'maintain', schedule: '每周', rest: true }),
    t({ id: 'm-grocery', title: '去超市补一次货', category: '生活', bucket: 'maintain', schedule: '每周一次，下班顺路' }),

    /* 稍后考虑 */
    t({
      id: 'l-blog',
      title: '给个人博客换一个主题',
      category: '个人项目',
      bucket: 'later',
      suggestion: undefined,
      note: '不影响求职，等这一轮投递结束后再做。',
    }),
    t({
      id: 'l-run',
      title: '看看要不要报名明年春天的半程马拉松',
      category: '生活',
      bucket: 'later',
      note: '需要较长准备，等作息稳定后再决定。',
    }),

    /* 待整理：杂乱输入 */
    t({ id: 'i-lin', title: '问一下小林，他们组最近还招不招人', category: '其他', bucket: 'inbox', captured: true, createdAt: pastAt(1, 22, 14) }),
    t({ id: 'i-bike', title: '自行车后胎又没气了，要么自己补，要么拿去车行', category: '其他', bucket: 'inbox', captured: true, createdAt: pastAt(1, 22, 16) }),
    t({ id: 'i-french', title: '学法语', category: '其他', bucket: 'inbox', captured: true, createdAt: pastAt(1, 22, 17) }),
    t({ id: 'i-ddia', title: '看完《数据密集型应用系统设计》第 5 章', category: '其他', bucket: 'inbox', captured: true, createdAt: pastAt(1, 22, 19) }),
    t({
      id: 'i-app',
      title: '给记账小程序加导出 Excel 的功能，之前答应过朋友',
      category: '其他',
      bucket: 'inbox', captured: true,
      createdAt: pastAt(1, 22, 21),
    }),
    t({
      id: 'i-roleb',
      title: '示例岗位 B 的内推快截止了，还没想好要不要投',
      category: '其他',
      bucket: 'inbox', captured: true,
      due: inDays(6),
      createdAt: pastAt(0, 8, 40),
    }),
    t({ id: 'i-bill', title: '交这个月的电费', category: '其他', bucket: 'inbox', captured: true, due: inDays(3), createdAt: pastAt(0, 8, 42) }),
    t({ id: 'i-desk', title: '整理一下电脑桌面', category: '其他', bucket: 'inbox', captured: true, createdAt: pastAt(0, 8, 45) }),
  ]
}

function baseArtifacts(): Artifact[] {
  return [
    {
      id: 'a-roles',
      taskId: 't-roles',
      title: '目标岗位对比（3 个示例岗位）',
      kind: 'list',
      after:
        '1. AI 应用工程师 · 星河科技 —— 看重推荐或模型功能的落地经验\n2. 后端工程师 · 青禾网络 —— 看重 Python 服务和接口设计\n3. 算法工程化工程师 · 远山数据 —— 看重数据处理和上线流程\n\n共同要求：Python 后端、能独立推进一个功能、有实际上线经历',
      note: '三个岗位均为演示用的虚构岗位。',
      status: 'adopted',
      createdAt: pastAt(4, 20, 40),
      updatedAt: pastAt(4, 21, 5),
    },
  ]
}

function baseEvents(): TimelineEvent[] {
  return [
    { id: 'e1', at: pastAt(5, 10, 20), kind: 'action', title: '浏览 10 个岗位描述，标出共同要求', taskId: 't-browse' },
    { id: 'e2', at: pastAt(4, 21, 5), kind: 'artifact', title: '目标岗位对比（3 个示例岗位）', detail: '已采用', artifactId: 'a-roles', taskId: 't-roles' },
    // 和实际操作一致：采用草稿 = 记一次“成果已采用” + 一次“完成行动”，各页的完成数才对得上
    { id: 'e2b', at: pastAt(4, 21, 5), kind: 'action', title: '选出 3 个示例岗位作为参照', taskId: 't-roles', artifactId: 'a-roles' },
    { id: 'e3', at: pastAt(4, 21, 10), kind: 'adjust', title: '阶段推进：澄清目标岗位 → 准备与岗位对应的材料', detail: '目标岗位已确定，开始准备对应材料' },
    { id: 'e4', at: pastAt(3, 19, 40), kind: 'outcome', title: '学长回复了简历方向的问题', detail: '建议突出项目落地的过程，而不只是列技术栈', outcomeId: 'o1' },
    { id: 'e5', at: pastAt(2, 20, 15), kind: 'adjust', title: '把“给个人博客换主题”放到稍后考虑', detail: '不影响求职，这几周先不占用精力' },
    { id: 'e6', at: pastAt(1, 21, 30), kind: 'adjust', title: '设定休息时间：晚上 9 点半后不处理求职的事', detail: '上周两次熬夜，第二天状态都不好' },
  ]
}

function msg(id: string, role: ChatMessage['role'], text: string, at: string, action?: ChatMessage['action']): ChatMessage {
  return { id, role, text, at, action }
}

function baseState(): AppState {
  return {
    version: STATE_VERSION,
    scenario: 'normal',
    energy: 'normal',
    direction: { title: '找到合适的软件／AI 工程师岗位', horizon: '未来 6–8 周' },
    adjustCondition: '完成一轮针对性投递并收到反馈后，再检查材料和岗位方向。',
    stages: [
      {
        id: 's1',
        title: '澄清目标岗位',
        outcome: '确定两类目标岗位，选出 3 个示例岗位作为参照',
        status: 'done',
      },
      {
        id: 's2',
        title: '准备与岗位对应的材料',
        outcome: '一份对准 AI 应用工程师的简历，加一段 1 分钟自我介绍',
        status: 'current',
      },
      {
        id: 's3',
        title: '投递并根据反馈调整',
        outcome: '完成一轮 5 个岗位的针对性投递，记下收到的反馈',
        status: 'upcoming',
      },
    ],
    focusTaskId: 't-project',
    tasks: baseTasks(),
    artifacts: baseArtifacts(),
    events: baseEvents(),
    outcomes: [
      { id: 'o1', title: '向学长请教简历方向', status: 'positive', result: '建议突出项目落地的过程', at: pastAt(3, 19, 40) },
      { id: 'o2', title: '在技术社区提问：AI 应用岗更看重什么', status: 'waiting', at: pastAt(2, 18, 0) },
    ],
    messages: [
      msg('m1', 'assistant', '昨晚记下的 8 件事还在待整理，不着急。今天先推进一件就好。', pastAt(0, 8, 50)),
      msg('m2', 'user', '今天先做什么？', pastAt(0, 8, 51)),
      msg('m3', 'assistant', '改写简历里的一段项目经历。它最直接支持找工作，约 20 分钟。我可以先写草稿，你再改。', pastAt(0, 8, 51)),
    ],
    resume: null,
    justCompleted: null,
  }
}

export function buildScenario(s: Scenario): AppState {
  const st = baseState()
  st.scenario = s

  if (s === 'low') {
    st.energy = 'low'
    st.messages = [
      msg('m1', 'user', '昨晚没睡好，今天没什么精神。', pastAt(0, 9, 12)),
      msg('m2', 'assistant', '那今天只推进一小步。首页只留了当前这件事，其他的我先收着。', pastAt(0, 9, 12)),
      msg('m3', 'assistant', '做不动的话点“卡住了”，我把它缩到 5 分钟能完成的程度。', pastAt(0, 9, 13)),
    ]
  }

  if (s === 'resume') {
    const task = st.tasks.find((t) => t.id === 't-project')!
    task.status = 'draft'
    task.artifactId = 'a-project'
    task.stepsDone = [0, 1]
    st.artifacts.push({
      id: 'a-project',
      taskId: 't-project',
      title: '项目经历改写：校园二手书交易平台',
      kind: 'rewrite',
      context: `对应岗位：${EXAMPLE_ROLE}`,
      before: PROJECT_BEFORE,
      after: PROJECT_PARTIAL,
      note: '上次你改好了第 1 条，第 2 条写到一半，第 3 条还是原文。',
      status: 'draft',
      createdAt: pastAt(3, 21, 5),
      updatedAt: pastAt(3, 21, 40),
    })
    st.events.push(
      { id: 'e7', at: pastAt(3, 21, 5), kind: 'artifact', title: '项目经历改写', detail: '草稿已准备', artifactId: 'a-project', taskId: 't-project' },
      { id: 'e8', at: pastAt(3, 21, 40), kind: 'progress', title: '项目经历改到第 2 条，暂停', detail: '草稿已自动保存', taskId: 't-project' },
    )
    st.resume = {
      taskId: 't-project',
      artifactId: 'a-project',
      at: pastAt(3, 21, 40),
      where: '第 2 条：推荐功能的落地过程',
      cursor: PROJECT_PARTIAL_HEAD.length,
    }
    st.messages = [
      msg('m1', 'assistant', '欢迎回来。上次项目经历改到第 2 条，草稿都在。', pastAt(0, 9, 0)),
      msg('m2', 'assistant', '不用补记录，也不用重新定目标，从停下的地方接着改就行。', pastAt(0, 9, 0), {
        label: '打开草稿',
        kind: 'artifact',
        target: 'a-project',
      }),
    ]
  }
  return st
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppState
      if (parsed.version === STATE_VERSION) return parsed
    }
  } catch {
    /* 读取失败时回到初始示例 */
  }
  return buildScenario('normal')
}

export function saveState(s: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* 隐私模式等情况下忽略 */
  }
}
