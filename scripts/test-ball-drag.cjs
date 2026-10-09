// 悬浮球几何回归测试(纯 Node,不需要 Electron):
//   node scripts/test-ball-drag.cjs
//
// 覆盖三类问题,全部发生在「窗口/球的位置怎么算」上:
//   ① 钳制后丢失的位移被补回 —— 累加式实现在球贴边后反向拖动会突然弹开;
//   ② 每帧取整的截断误差沿拖拽方向累积 —— 长距离拖拽后球明显偏离光标;
//   ③ **钳制对象错了** —— 旧实现把整个窗口(展开态 340×400)夹进工作区,
//      而球贴窗口底边,于是球心被限制在 [wa.y+356, wa.y+H-44]:实测只能在下半屏活动,
//      且球靠近顶部时一开面板就被强制下移(用户报的「长按不动它自己会移动」)。
// 现在一律先按**球心**做钳制,再由球心反推窗口原点;窗口允许伸出屏幕外。
const assert = require('node:assert')
const {
  BALL_SIZE,
  ballWindowSize,
  ballAnchorY,
  windowOriginForBallCenter,
  ballCenterForWindowOrigin,
  clampBallCenter,
  shouldPlacePanelBelow,
} = require('../electron/ballGeometry.cjs')

const WORK_AREA = { x: 0, y: 0, width: 1920, height: 1020 }
const HALF = BALL_SIZE / 2 // 32

let passed = 0
function check(name, actual, expected) {
  assert.deepStrictEqual(actual, expected, `${name}: 期望 ${JSON.stringify(expected)},实际 ${JSON.stringify(actual)}`)
  passed++
  console.log(`  PASS ${name}`)
}
function ok(name, cond, detail) {
  assert.ok(cond, `${name}${detail ? ': ' + detail : ''}`)
  passed++
  console.log(`  PASS ${name}`)
}

console.log('悬浮球几何:')

// ── 1. 跟手:窗口原点由「球心 − 窗口内锚点偏移」反推 ──
// 收起态窗口 88×88,球心距右/下缘 44 → 球心 (800,500) 时窗口原点 (756,456)
check('抓球心拖到屏幕中部', windowOriginForBallCenter({ x: 800, y: 500 }, false, false), { x: 756, y: 456 })
// 抓在球体左上角 = 光标比球心偏 (-32,-32) → 球心比光标偏 +32 → 原点只需再内缩 12
check('抓球体左上角', windowOriginForBallCenter({ x: 800 + HALF, y: 500 + HALF }, false, false), { x: 788, y: 488 })

// ── 2. 钳制对象是球心,不是窗口 ──
check('拖到左上角越界时球心被钳在(32,32)', clampBallCenter({ x: -500, y: -500 }, WORK_AREA), { x: HALF, y: HALF })
check(
  '拖到右下角越界时球心被钳在(W-32,H-32)',
  clampBallCenter({ x: 5000, y: 5000 }, WORK_AREA),
  { x: WORK_AREA.width - HALF, y: WORK_AREA.height - HALF },
)

// ── 3. 回归核心:球心必须能覆盖整个工作区 ──
// 旧实现把展开窗口(340×400)整体夹进工作区,球贴窗口底边,于是球心最低只能到:
//   x = 340-44 = 296, y = 400-44 = 356  → 屏幕上表现为「只能在下半屏活动」
{
  const topLeft = clampBallCenter({ x: -500, y: -500 }, WORK_AREA)
  ok('拖到屏幕左上角时球心能到 (32,32)', topLeft.x === HALF && topLeft.y === HALF,
    `实际 ${JSON.stringify(topLeft)}`)
  const oldMinX = ballWindowSize(true)[0] - 44
  const oldMinY = ballWindowSize(true)[1] - 44
  ok(
    `旧实现(整窗口钳制)球心最低只能到 (${oldMinX},${oldMinY}),本用例能抓到该问题`,
    oldMinX > HALF && oldMinY > HALF,
  )
}

// ── 4. 反向拖回立刻跟手(旧累加式会弹开) ──
{
  // 光标拖到 x=-800(远超左边界),球心被钳在 32
  const pinned = clampBallCenter({ x: -800, y: 400 }, WORK_AREA)
  assert.strictEqual(pinned.x, HALF, '贴边时球心 x 应为 32')
  passed++
  console.log('  PASS 贴左边后球心停在 x=32')

  // 光标回到 x=300:球心就是 300,窗口原点 300-44=256,而不是「从 32 补回丢掉的位移」
  check('反向拖回立刻跟手', windowOriginForBallCenter(clampBallCenter({ x: 300, y: 400 }, WORK_AREA), false, false), { x: 256, y: 356 })

  const buggyX = Math.max(0, Math.min(0 + 1100, WORK_AREA.width - 88))
  assert.notStrictEqual(buggyX, 256, '旧实现应当复现出偏离(用于确认回归用例确实能抓到问题)')
  console.log(`  PASS 旧累加式实现在同一序列下会偏到 x=${buggyX}(本用例能抓到该问题)`)
  passed++
}

// ── 5. 取整只作用在最终结果上,不逐帧累积 ──
{
  let cursor = 500
  let origin = windowOriginForBallCenter(clampBallCenter({ x: cursor, y: 400 }, WORK_AREA), false, false)
  for (let i = 0; i < 1000; i++) {
    cursor += 0.4
    origin = windowOriginForBallCenter(clampBallCenter({ x: cursor, y: 400 }, WORK_AREA), false, false)
  }
  // 期望 = round(500 + 400 - 44) = 856,与步数无关
  check('千次小数步进后仍精确落在光标下方', origin, { x: 856, y: 356 })
}

// ── 6. 面板方向:上方放不下就翻到下方 ──
{
  ok('球贴近顶部时面板翻到下方', shouldPlacePanelBelow(100, WORK_AREA, true) === true)
  ok('球在屏幕下方时面板留在上方', shouldPlacePanelBelow(800, WORK_AREA, true) === false)
  ok('收起态不需要翻转(窗口只有球)', shouldPlacePanelBelow(100, WORK_AREA, false) === false)
}

// ── 7. 球心与窗口原点互换必须自洽(渲染端 ballAnchorY 与主进程同一口径) ──
{
  const cases = [
    { center: { x: 400, y: 120 }, expanded: true, below: true },
    { center: { x: 900, y: 700 }, expanded: true, below: false },
    { center: { x: 1500, y: 900 }, expanded: false, below: false },
  ]
  for (const c of cases) {
    const origin = windowOriginForBallCenter(c.center, c.expanded, c.below)
    const back = ballCenterForWindowOrigin(origin, c.expanded, c.below)
    assert.deepStrictEqual(back, c.center, `球心往返不一致: ${JSON.stringify(c)} -> ${JSON.stringify(back)}`)
  }
  passed++
  console.log('  PASS 球心 ↔ 窗口原点往返一致(3 种方向/尺寸组合)')
}

// ── 8. 球心纵向锚点随面板方向变化 ──
{
  check('展开态·面板在上 → 球贴窗口底(356)', ballAnchorY(true, false), 356)
  check('展开态·面板在下 → 球贴窗口顶(44)', ballAnchorY(true, true), 44)
  check('收起态两种方向等价(44)', [ballAnchorY(false, false), ballAnchorY(false, true)], [44, 44])
}

console.log(`\n全部通过(${passed} 项断言)`)
