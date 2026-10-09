import { FIELD_MAPPINGS } from './fieldMapping'
import type { FieldSelector } from './types'

const FLASH_CLASS = 'autofill-flash'
const FLASH_MS = 300

type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

/**
 * 原生 value setter + input/change 事件(技术方案 §5.1):
 * 走原型上的原生 setter 可绕过 React 受控组件对 value 的拦截,派发事件让框架状态同步更新。
 */
function setNativeValue(control: FormControl, value: string): void {
  const prototype =
    control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : control instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  if (setter === undefined) return
  setter.call(control, value)
  control.dispatchEvent(new Event('input', { bubbles: true }))
  control.dispatchEvent(new Event('change', { bubbles: true }))
}

/** 刚填入的控件短暂高亮(约 300ms 后移除) */
function flash(element: Element): void {
  element.classList.add(FLASH_CLASS)
  window.setTimeout(() => {
    element.classList.remove(FLASH_CLASS)
  }, FLASH_MS)
}

/**
 * 取消选中 radio:点击已选中的 radio 不会取消选中,须原生 checked setter 置 false,
 * 再派发一个被 preventDefault 的合成 click(取消激活行为以免被重新选中),
 * 让 React(对 radio/checkbox 的 onChange 基于 click 事件)同步未选中状态。
 */
function uncheckRadio(radio: HTMLInputElement): void {
  const checkedSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set
  if (checkedSetter === undefined) return
  checkedSetter.call(radio, false)
  const preventActivation = (event: Event): void => {
    event.preventDefault()
  }
  radio.addEventListener('click', preventActivation)
  radio.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }))
  radio.removeEventListener('click', preventActivation)
  radio.dispatchEvent(new Event('input', { bubbles: true }))
  radio.dispatchEvent(new Event('change', { bubbles: true }))
}

/** 填写单个字段;返回是否成功定位并写入 */
export function fillField(container: ParentNode, field: FieldSelector, value: string): boolean {
  const target = container.querySelector(field.selector)
  if (target === null) return false
  if (field.control === 'radio') {
    const radios = Array.from(target.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
    const matched = radios.find(radio => radio.value === value)
    if (matched === undefined) return false
    if (!matched.checked) matched.click()
    flash(matched)
    return true
  }
  setNativeValue(target as FormControl, value)
  flash(target)
  return true
}

/**
 * 「清空重填」:仅清空 13 个映射字段。
 * 产品铁律「只填不提交」:本模块不存在对任何提交按钮的定位与触发。
 */
export function resetForm(container: ParentNode): void {
  for (const field of FIELD_MAPPINGS) {
    const target = container.querySelector(field.selector)
    if (target === null) continue
    if (field.control === 'radio') {
      for (const radio of Array.from(target.querySelectorAll<HTMLInputElement>('input[type="radio"]'))) {
        if (!radio.checked) continue
        uncheckRadio(radio)
      }
    } else {
      setNativeValue(target as FormControl, '')
    }
  }
}
