import type { FieldSelector } from './types'

/**
 * 13 个字段按填写顺序排列,与模拟网申表单(产品设计 §5.2)一一对应。
 * 选择器相对 [data-campus-form] 容器:普通控件直接选中该控件,性别单选选中分组容器。
 */
export const FIELD_MAPPINGS: readonly FieldSelector[] = [
  { key: '姓名', label: '姓名', selector: '[data-field="name"] input', control: 'text' },
  { key: '性别', label: '性别', selector: '[data-field="gender"]', control: 'radio' },
  { key: '出生日期', label: '出生日期', selector: '[data-field="birthDate"] input', control: 'date' },
  { key: '手机', label: '手机', selector: '[data-field="phone"] input', control: 'text' },
  { key: '邮箱', label: '邮箱', selector: '[data-field="email"] input', control: 'text' },
  { key: '政治面貌', label: '政治面貌', selector: '[data-field="politicalStatus"] select', control: 'select' },
  { key: '籍贯', label: '籍贯', selector: '[data-field="hometown"] input', control: 'text' },
  { key: '学校', label: '学校', selector: '[data-field="school"] input', control: 'text' },
  { key: '专业', label: '专业', selector: '[data-field="major"] input', control: 'text' },
  { key: '学历', label: '学历', selector: '[data-field="degree"] select', control: 'select' },
  { key: '毕业时间', label: '毕业时间', selector: '[data-field="graduationDate"] input', control: 'date' },
  { key: '求职意向', label: '求职意向', selector: '[data-field="jobIntention"] select', control: 'select' },
  { key: '自我评价', label: '自我评价', selector: '[data-field="selfEvaluation"] textarea', control: 'textarea' },
]

export const TOTAL_FIELD_COUNT = FIELD_MAPPINGS.length
