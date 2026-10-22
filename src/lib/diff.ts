/**
 * 草稿“看改动”：比较改写前后的文字，标出新增和删掉的部分。
 *
 * 中文按字、英文和数字按词切分，先求最长公共子序列（LCS），
 * 再把夹在改动之间的零碎相同片段并进改动里（思路同 diff-match-patch 的 semantic cleanup），
 * 读起来是“这一句改了”，而不是满屏的单字高亮。
 */
export type DiffOp = { op: 0 | 1 | -1; text: string }

const len = (s: string) => [...s].length
const WORD_CHAR = /^[A-Za-z0-9_.+#%]$/
const SPACE = /^\s+$/

// 按“用户看到的一个字”切分：组合 emoji、国旗不会被拆成两半
const graphemes: (s: string) => string[] =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? (() => {
        const seg = new Intl.Segmenter('zh', { granularity: 'grapheme' })
        return (s: string) => Array.from(seg.segment(s), (x) => x.segment)
      })()
    : (s: string) => [...s]

/** 中文按字，英文、数字连成词，连续空白合成一段 */
function tokenize(s: string) {
  const out: string[] = []
  let word = ''
  for (const g of graphemes(s)) {
    if (WORD_CHAR.test(g)) {
      word += g
      continue
    }
    if (word) {
      out.push(word)
      word = ''
    }
    const last = out[out.length - 1]
    if (SPACE.test(g) && last !== undefined && SPACE.test(last)) out[out.length - 1] = last + g
    else out.push(g)
  }
  if (word) out.push(word)
  return out
}

function lcsDiff(a: string[], b: string[]): DiffOp[] {
  // 先去掉相同的开头和结尾，DP 只算中间
  let pre = 0
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++
  let ea = a.length
  let eb = b.length
  while (ea > pre && eb > pre && a[ea - 1] === b[eb - 1]) {
    ea--
    eb--
  }
  const A = a.slice(pre, ea)
  const B = b.slice(pre, eb)
  const n = A.length
  const m = B.length
  const ops: DiffOp[] = []
  const push = (op: DiffOp['op'], text: string) => {
    if (!text) return
    const last = ops[ops.length - 1]
    if (last && last.op === op) last.text += text
    else ops.push({ op, text })
  }

  push(0, a.slice(0, pre).join(''))
  if (n * m > 2_000_000) {
    // 太长就不逐字比了，整段算作改写
    push(-1, A.join(''))
    push(1, B.join(''))
  } else {
    const w = m + 1
    const dp = new Uint16Array((n + 1) * w)
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * w + j] = A[i] === B[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < n && j < m) {
      if (A[i] === B[j]) {
        push(0, A[i])
        i++
        j++
      } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) push(-1, A[i++])
      else push(1, B[j++])
    }
    while (i < n) push(-1, A[i++])
    while (j < m) push(1, B[j++])
  }
  push(0, a.slice(ea).join(''))
  return ops
}

/** 把连续的改动合成“先删后加”各一段，相邻的相同片段合并 */
function normalize(ops: DiffOp[]): DiffOp[] {
  const out: DiffOp[] = []
  let del = ''
  let ins = ''
  const flush = () => {
    if (del) out.push({ op: -1, text: del })
    if (ins) out.push({ op: 1, text: ins })
    del = ''
    ins = ''
  }
  for (const o of ops) {
    if (!o.text) continue
    if (o.op === -1) del += o.text
    else if (o.op === 1) ins += o.text
    else {
      flush()
      const last = out[out.length - 1]
      if (last && last.op === 0) last.text += o.text
      else out.push({ op: 0, text: o.text })
    }
  }
  flush()
  return out
}

function editRun(ops: DiffOp[], from: number, dir: 1 | -1) {
  let del = 0
  let ins = 0
  for (let k = from; k >= 0 && k < ops.length && ops[k].op !== 0; k += dir) {
    if (ops[k].op === -1) del += len(ops[k].text)
    else ins += len(ops[k].text)
  }
  return del || ins ? { del, ins } : null
}

/** 夹在两处改动之间、又不比两边改动长的相同片段，并进改动里 */
function cleanupSemantic(input: DiffOp[]): DiffOp[] {
  let ops = normalize(input)
  for (let guard = 0; guard < 1000; guard++) {
    let changed = false
    for (let k = 1; k < ops.length - 1; k++) {
      if (ops[k].op !== 0) continue
      const before = editRun(ops, k - 1, -1)
      const after = editRun(ops, k + 1, 1)
      if (!before || !after) continue
      const l = len(ops[k].text)
      if (l <= Math.max(before.del, before.ins) && l <= Math.max(after.del, after.ins)) {
        const t = ops[k].text
        ops = normalize([...ops.slice(0, k), { op: -1, text: t }, { op: 1, text: t }, ...ops.slice(k + 1)])
        changed = true
        break
      }
    }
    if (!changed) break
  }
  return ops
}

export function diffText(before: string, after: string): DiffOp[] {
  return cleanupSemantic(lcsDiff(tokenize(before), tokenize(after)))
}

/** 新增内容里出现、原文里没有的数字：AI 改写最容易在这里“编”，采用前值得核对 */
export function newNumbers(ops: DiffOp[], before: string) {
  const NUM = /\d+(?:\.\d+)?/g
  const seen = new Set(before.match(NUM) ?? [])
  const found = new Set<string>()
  for (const o of ops) {
    if (o.op !== 1) continue
    for (const n of o.text.match(NUM) ?? []) if (!seen.has(n)) found.add(n)
  }
  return [...found]
}

/* ---------------- 列表式内容：按条目比较 ---------------- */

/**
 * 技能栏这类“、”分隔的列表，改写时经常整体重排、分组，逐字对比会变成一整块“全删全加”。
 * 这种情况改成按条目比较：哪些条目是新加的，哪些被拿掉了。
 */
const SEP = /([、，,；;\n：:])/
const normItem = (s: string) =>
  s
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/^[\s·•-]+/, '')
    .trim()
    .toLowerCase()

function splitItems(text: string) {
  const parts = text.split(SEP)
  return parts.map((p, i) => {
    const sep = i % 2 === 1
    const next = parts[i + 1]
    return { text: p, sep, label: !sep && (next === '：' || next === ':') }
  })
}

export type Compare =
  | { mode: 'inline'; ops: DiffOp[]; added: number; removed: number; numbers: string[] }
  | { mode: 'items'; parts: { text: string; added: boolean }[]; removedItems: string[]; added: number; removed: number; numbers: string[] }

export function compareDraft(before: string, after: string): Compare {
  const ops = diffText(before, after)
  const equal = ops.filter((o) => o.op === 0).reduce((n, o) => n + len(o.text), 0)
  const listy = (before.match(/、/g)?.length ?? 0) >= 4
  if (!listy || equal / Math.max(1, len(after)) >= 0.5) {
    return {
      mode: 'inline',
      ops,
      added: ops.filter((o) => o.op === 1).length,
      removed: ops.filter((o) => o.op === -1).length,
      numbers: newNumbers(ops, before),
    }
  }
  const b = splitItems(before)
  const a = splitItems(after)
  const isItem = (p: { text: string; sep: boolean; label: boolean }) => !p.sep && !p.label && normItem(p.text) !== ''
  const beforeSet = new Set(b.filter(isItem).map((p) => normItem(p.text)))
  const afterSet = new Set(a.filter(isItem).map((p) => normItem(p.text)))
  const parts = a.map((p) => ({ text: p.text, added: isItem(p) && !beforeSet.has(normItem(p.text)) }))
  const removedItems = b.filter((p) => isItem(p) && !afterSet.has(normItem(p.text))).map((p) => p.text.trim())
  const addedText = parts.filter((p) => p.added).map((p) => p.text)
  return {
    mode: 'items',
    parts,
    removedItems,
    added: addedText.length,
    removed: removedItems.length,
    numbers: newNumbers(addedText.map((text) => ({ op: 1 as const, text })), before),
  }
}
