export type Category = '求职' | '学习' | '个人项目' | '生活' | '其他'

/** 事项所在的位置：待整理 / 当前规划 / 维持安排 / 稍后考虑 / 已归档 */
export type Bucket = 'inbox' | 'plan' | 'maintain' | 'later' | 'archived'

export type TaskStatus = 'todo' | 'draft' | 'done'

export type StuckReason = 'unknown' | 'too_big' | 'distracted'

export type Adjust =
  | { reason: 'unknown'; example: string; hint: string }
  | {
      reason: 'too_big'
      smallTitle: string
      source?: string
      checks: { id: string; label: string; value: string }[]
    }
  | { reason: 'distracted' }

export interface Suggestion {
  bucket: Exclude<Bucket, 'inbox'>
  reason: string
}

export interface Task {
  id: string
  title: string
  category: Category
  bucket: Bucket
  prevBucket?: Bucket
  stageId?: string
  order: number
  status: TaskStatus
  why?: string
  criteria?: string
  steps?: string[]
  stepsDone?: number[]
  reasons?: { label: string; text: string }[]
  estimate?: string
  /** ISO 日期（yyyy-mm-dd） */
  due?: string
  /** 维持安排的时间说明，如“每周三、六 晚饭后” */
  schedule?: string
  rest?: boolean
  /** 休息边界：这个时间（HH:MM）以后不再推进主线，例如 '21:30' */
  restAfter?: string
  aiKind?: string
  artifactId?: string
  suggestion?: Suggestion
  organizing?: boolean
  adjust?: Adjust
  progress?: string[]
  note?: string
  /** 来自“待整理”的随手记录 */
  captured?: boolean
  createdAt: string
  doneAt?: string
}

export interface Stage {
  id: string
  title: string
  outcome: string
  status: 'done' | 'current' | 'upcoming'
  summary?: string
}

export interface Artifact {
  id: string
  taskId: string
  title: string
  kind: 'rewrite' | 'text' | 'list'
  context?: string
  before?: string
  after: string
  note: string
  status: 'draft' | 'adopted'
  createdAt: string
  updatedAt: string
}

export type EventKind = 'action' | 'artifact' | 'outcome' | 'adjust' | 'progress'

export interface TimelineEvent {
  id: string
  at: string
  kind: EventKind
  title: string
  detail?: string
  taskId?: string
  artifactId?: string
  outcomeId?: string
}

export interface Outcome {
  id: string
  title: string
  status: 'waiting' | 'positive' | 'neutral' | 'negative'
  result?: string
  at: string
}

export interface ChatAction {
  label: string
  kind: 'artifact' | 'page' | 'task'
  target: string
}

export interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  text: string
  at: string
  action?: ChatAction
}

export interface ResumeInfo {
  taskId: string
  artifactId: string
  at: string
  where: string
  /** 草稿中上次停下的位置（字符索引） */
  cursor: number
}

export type Scenario = 'normal' | 'low' | 'resume'

export interface AppState {
  version: number
  scenario: Scenario
  energy: 'normal' | 'low'
  direction: { title: string; horizon: string }
  adjustCondition: string
  stages: Stage[]
  focusTaskId: string | null
  tasks: Task[]
  artifacts: Artifact[]
  events: TimelineEvent[]
  outcomes: Outcome[]
  messages: ChatMessage[]
  resume: ResumeInfo | null
  justCompleted: { taskId: string; artifactId?: string; feedback?: Feedback } | null
}

export type Page = 'now' | 'plan' | 'inbox' | 'progress'

/** 完成一件事后，用户对难度的反馈 */
export type Feedback = 'ok' | 'hard' | 'more'
