// 悬浮球窗口几何:纯计算,不依赖 Electron,便于 scripts/test-ball-drag.cjs 直接单测。
// 关键口径:所有坐标都是 Electron 的 DIP(设备无关像素),与渲染端 pointer 事件的
// screenX/screenY 以及 BrowserWindow 的 setPosition 是同一套坐标系,不需要再乘缩放比。
//
// 核心不变式(修掉「球只能在下半屏活动 / 开关面板时球自己移动」两条缺陷的根本):
//   **要被限制在屏幕内的是「球」,不是「整个窗口」。**
// 窗口里除了球还有面板(展开态 340×400,球只占 64),把 400 高的窗口整体夹进工作区,
// 会使球贴着窗口底边的球心被限制在 [wa.y+356, wa.y+H-44] —— 屏幕上相当于只能待在下半屏。
// 正确做法:先按球心做钳制,再由球心反推窗口原点;窗口允许伸出屏幕外(面板被裁),
// 并在上方放不下时把面板翻到球下方。

/** 展开态窗口尺寸(容纳面板) */
const BALL_WINDOW_W = 340
const BALL_WINDOW_H = 400
/** 收起态窗口尺寸(只包住 64 DIP 球体 + 右下 12 DIP 边距) */
const BALL_COLLAPSED_W = 88
const BALL_COLLAPSED_H = 88
/** 球心在球窗口内的偏移:距右/下边缘 12+32=44 DIP */
const BALL_ANCHOR = 44
/** 球体直径(DIP):钳制球心时用它的一半作为最小可见余量 */
const BALL_SIZE = 64

/**
 * 悬浮球窗口尺寸(DIP)。
 * @param {boolean} expanded 面板是否展开
 * @returns {[number, number]}
 */
function ballWindowSize(expanded) {
  return expanded ? [BALL_WINDOW_W, BALL_WINDOW_H] : [BALL_COLLAPSED_W, BALL_COLLAPSED_H]
}

/**
 * 球心在窗口内的纵向偏移:面板在球上方时球贴窗口底边,面板在球下方时球贴窗口顶边。
 * 收起态窗口只有球,两个方向等价。
 * @param {boolean} expanded
 * @param {boolean} panelBelow 面板是否位于球体下方
 * @returns {number}
 */
function ballAnchorY(expanded, panelBelow) {
  const [, h] = ballWindowSize(expanded)
  return panelBelow ? BALL_ANCHOR : h - BALL_ANCHOR
}

/**
 * 由球心屏幕坐标反推窗口原点。窗口允许越出工作区(面板可能被裁),由调用方决定放置方向。
 * @param {{x:number,y:number}} center 球心屏幕坐标(DIP)
 * @param {boolean} expanded
 * @param {boolean} panelBelow
 * @returns {{x:number,y:number}}
 */
function windowOriginForBallCenter(center, expanded, panelBelow) {
  const [w] = ballWindowSize(expanded)
  return {
    x: Math.round(center.x - (w - BALL_ANCHOR)),
    y: Math.round(center.y - ballAnchorY(expanded, panelBelow)),
  }
}

/**
 * 由窗口原点与放置方向算出球心屏幕坐标(与 windowOriginForBallCenter 互逆)。
 * @param {{x:number,y:number}} origin
 * @param {boolean} expanded
 * @param {boolean} panelBelow
 * @returns {{x:number,y:number}}
 */
function ballCenterForWindowOrigin(origin, expanded, panelBelow) {
  const [w] = ballWindowSize(expanded)
  return {
    x: origin.x + (w - BALL_ANCHOR),
    y: origin.y + ballAnchorY(expanded, panelBelow),
  }
}

/**
 * 把**球心**夹进工作区,保证球体始终完整可见(留半个球径的余量)。
 * 注意:这里夹的是球,不是窗口 —— 窗口超出屏幕是可以接受的,球超出不行。
 * @param {{x:number,y:number}} center
 * @param {{x:number,y:number,width:number,height:number}} workArea
 * @param {number} [half] 球体半径(默认 32)
 * @returns {{x:number,y:number}}
 */
function clampBallCenter(center, workArea, half) {
  const h = typeof half === 'number' ? half : BALL_SIZE / 2
  const minX = workArea.x + h
  const maxX = Math.max(minX, workArea.x + workArea.width - h)
  const minY = workArea.y + h
  const maxY = Math.max(minY, workArea.y + workArea.height - h)
  return {
    x: Math.round(Math.min(Math.max(center.x, minX), maxX)),
    y: Math.round(Math.min(Math.max(center.y, minY), maxY)),
  }
}

/**
 * 决定面板放在球的哪一侧:优先上方(与窗口默认布局一致),上方放不下时翻到下方。
 * 两侧都放不下(屏幕比面板还矮)时保持上方 —— 此时球心通常更靠下,上方余地更大。
 * @param {number} centerY 球心屏幕 Y(DIP)
 * @param {{x:number,y:number,width:number,height:number}} workArea
 * @param {boolean} expanded
 * @returns {boolean} true = 面板放在球体下方
 */
function shouldPlacePanelBelow(centerY, workArea, expanded) {
  const [, h] = ballWindowSize(expanded)
  const need = h - BALL_ANCHOR
  const fitsAbove = centerY - need >= workArea.y
  const fitsBelow = centerY + need <= workArea.y + workArea.height
  return !fitsAbove && fitsBelow
}

module.exports = {
  BALL_WINDOW_W,
  BALL_WINDOW_H,
  BALL_COLLAPSED_W,
  BALL_COLLAPSED_H,
  BALL_ANCHOR,
  BALL_SIZE,
  ballWindowSize,
  ballAnchorY,
  windowOriginForBallCenter,
  ballCenterForWindowOrigin,
  clampBallCenter,
  shouldPlacePanelBelow,
}
