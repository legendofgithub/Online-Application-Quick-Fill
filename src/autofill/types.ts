import type { ResumeProfile } from '../mock/resumes'

/** 悬浮球面板五态:未检测到(idle) / 检测中(detecting) / 已检测到(ready) / 填写中(filling) / 完成(done) */
export type PanelState = 'idle' | 'ready' | 'detecting' | 'filling' | 'done'

/**
 * 面板状态机的全部状态快照。
 *
 * 产品口径:探测是**用户点击「开始检测」触发的显式动作**,不做后台轮询 ——
 * 因此判定结果只有两种:「未检测到网申表单」与「已检测到网申表单(站点名)」。
 */
export interface AutofillStatus {
  state: PanelState
  /** 已填入字段数 0..n(demo 为 13;真实页面为匹配到的字段总数) */
  filledCount: number
  /** 最近填入的字段名(填写中展示「正在填写 x/n:字段名」) */
  activeFieldLabel: string
  /** 字段总数:demo 恒为 13;通用引擎按实际匹配数上报 */
  totalFields: number
  /** 完成态:页面上带标签但未获得简历数据的信息项(缺项提醒,通用引擎上报) */
  missingPageFields?: string[]
}

/**
 * 状态机唯一入口的事件(迁移规则见 stateMachine.ts)。
 * 探测相关事件全部由「开始检测」或「开始填写」这两个用户动作触发。
 */
export type AutofillEvent =
  /** 用户点击「开始检测」 */
  | { type: 'DETECT' }
  /** 探测命中当前页面存在网申表单 */
  | { type: 'DETECT_PASS' }
  /** 探测未命中(或页面暂不可测) */
  | { type: 'DETECT_FAIL' }
  /** 用户点击「开始填写」 */
  | { type: 'START' }
  /** 填入第 index 个字段(1 基,幂等) */
  | { type: 'FIELD_FILLED'; index: number; label: string }
  /** 用户点击「清空重填」 */
  | { type: 'RESET' }
  /** 页面已离开/目标消失:回到未检测到 */
  | { type: 'ABORT' }

export type FieldControl = 'text' | 'radio' | 'date' | 'select' | 'textarea'

/** 简历字段 → 表单控件的定位与填写方式 */
export interface FieldSelector {
  /** 简历字段名(与 ResumeProfile 的键一致) */
  key: keyof ResumeProfile
  /** 面板展示名 */
  label: string
  /** 相对 [data-campus-form] 容器的选择器 */
  selector: string
  /** 控件类型(决定填写原语) */
  control: FieldControl
}
