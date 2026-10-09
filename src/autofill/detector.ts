// Demo 版检测逻辑(产品设计 §4「检测逻辑(Demo 版)」):
// 当前 hash 为 #/apply 且 DOM 存在 [data-campus-form] 即视为网申页面。
// 阶段一(静默环境探测)与阶段二(点击「开始填写」后的复检)共用同一判定。

export const APPLY_HASH = '#/apply'
export const FORM_CONTAINER_SELECTOR = '[data-campus-form]'

export function isApplicationFormPage(): boolean {
  if (window.location.hash !== APPLY_HASH) return false
  return document.querySelector(FORM_CONTAINER_SELECTOR) !== null
}
