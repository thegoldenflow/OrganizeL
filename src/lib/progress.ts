/**
 * 进度怎么说，比进度条本身更影响人会不会继续做下去。这里集中放三条有研究支持的规则：
 *
 * 1. 小面积效应（Koo & Fishbach, 2012）
 *    注意力放在“较小的那一块”时最有动力：刚开始时说“已经做了几件”，快完成时说“还差几件”。
 *    0/3 时说“已完成 0 件”只会让人觉得还早；2/3 时说“已完成 2 件”不如“还差 1 件”有拉力。
 *
 * 2. 起点进度效应（Nunes & Drèze, 2006）
 *    洗车集点卡：同样要再盖 8 个章，“共 10 格、已送 2 格”的那组完成率（34%）几乎是“共 8 格”那组（19%）的两倍。
 *    所以新阶段开始时不说“0 件”，而是提醒“上一阶段已经走完了”。
 *
 * 3. 目标梯度效应（Hull, 1932；Kivetz 等, 2006）
 *    离终点越近，人越会加快。最后一步要明确说出来：“最后一步”“再完成这一件就……”。
 */

/** 行动卡上的阶段进度说法 */
export function stageCaption(done: number, total: number, stageIndex: number) {
  const left = total - done
  if (total <= 1) return ''
  if (left <= 0) return '本阶段全部完成'
  if (left === 1) return '再完成这一件，本阶段就完成了'
  if (done === 0) return stageIndex > 0 ? '上一阶段已走完 · 这一段刚开始' : `本阶段共 ${total} 件`
  return done <= left ? `本阶段已完成 ${done} 件` : `本阶段还差 ${left} 件`
}

/** 完成横幅里的进度说法（刚完成一件之后） */
export function afterDoneCaption(done: number, total: number, stageTitle: string) {
  const left = total - done
  if (left <= 0) return `“${stageTitle}”这个阶段全部完成了`
  if (left === 1) return '本阶段只差最后 1 件了'
  return done <= left ? `本阶段已完成 ${done} 件，共 ${total} 件` : `本阶段还差 ${left} 件`
}

/** 整条路线的进度说法（规划页） */
export function routeCaption(done: number, total: number) {
  const left = total - done
  if (total === 0) return ''
  if (left <= 0) return '整条路线都走完了'
  // 新路线刚开始时不说“已完成 0 个”
  if (done === 0) return `整条路线刚开始，一共 ${total} 个行动`
  return done <= left ? `整条路线已完成 ${done} 个行动` : `整条路线还差 ${left} 个行动`
}

/** 步骤提示：最后一步要说出来 */
export const stepTag = (index: number, total: number) => (index === total - 1 && total > 1 ? '最后一步' : '下一步')
