import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'

interface FormValues {
  name: string
  gender: string
  birthDate: string
  phone: string
  email: string
  politicalStatus: string
  hometown: string
  school: string
  major: string
  degree: string
  graduationDate: string
  jobIntention: string
  selfEvaluation: string
}

const EMPTY_FORM: FormValues = {
  name: '',
  gender: '',
  birthDate: '',
  phone: '',
  email: '',
  politicalStatus: '',
  hometown: '',
  school: '',
  major: '',
  degree: '',
  graduationDate: '',
  jobIntention: '',
  selfEvaluation: '',
}

type FieldName = keyof FormValues

/**
 * 模块级表单状态:路由切换打断时组件会卸载,
 * 按产品设计 §4 打断规则「已填字段保留不清空」,回到 #/apply 后恢复已填内容。
 */
let persistedForm: FormValues = EMPTY_FORM

const SUBMIT_MESSAGE = '演示提交成功:未发送任何数据'
const TYPING_STEP_MS = 40

type FormElementEvent = ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>

/** 页面二 #/apply:模拟网申表单(容器带 data-campus-form="demo",供悬浮球检测) */
export function ApplyPage() {
  const [form, setForm] = useState<FormValues>(persistedForm)
  const [submitMessage, setSubmitMessage] = useState('')
  const typingTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (typingTimer.current !== null) window.clearInterval(typingTimer.current)
    },
    [],
  )

  const update =
    (field: FieldName) =>
    (event: FormElementEvent): void => {
      const value = event.target.value
      setForm(prev => {
        const next: FormValues = { ...prev }
        next[field] = value
        persistedForm = next
        return next
      })
    }

  // 单选:以 checked 状态为准(被工具清空时 checked 为 false,需写回空串)
  const updateRadio =
    (field: FieldName) =>
    (event: ChangeEvent<HTMLInputElement>): void => {
      const value = event.target.checked ? event.target.value : ''
      setForm(prev => {
        const next: FormValues = { ...prev }
        next[field] = value
        persistedForm = next
        return next
      })
    }

  // 「提交申请(演示)」仅供用户人工点击:逐字提示演示成功,不发生任何真实网络提交
  const handleDemoSubmit = (): void => {
    if (typingTimer.current !== null) window.clearInterval(typingTimer.current)
    setSubmitMessage('')
    let typed = 0
    typingTimer.current = window.setInterval(() => {
      typed += 1
      setSubmitMessage(SUBMIT_MESSAGE.slice(0, typed))
      if (typed >= SUBMIT_MESSAGE.length && typingTimer.current !== null) {
        window.clearInterval(typingTimer.current)
        typingTimer.current = null
      }
    }, TYPING_STEP_MS)
  }

  return (
    <main className="page apply-page">
      <p className="demo-banner">演示模式:表单为模拟页面,数据为模拟简历</p>
      <h1 className="page-title">演示公司 2027 届秋季校园招聘</h1>
      <div className="apply-card" data-campus-form="demo">
        <div className="form-grid">
          <div className="form-field" data-field="name">
            <label htmlFor="field-name">姓名</label>
            <input
              id="field-name"
              type="text"
              value={form.name}
              onChange={update('name')}
              placeholder="请输入姓名"
              autoComplete="off"
            />
          </div>
          <div className="form-field" data-field="gender">
            <span className="field-label" id="field-gender-label">
              性别
            </span>
            <div className="radio-group" role="radiogroup" aria-labelledby="field-gender-label">
              <label className="radio-option">
                <input type="radio" name="gender" value="男" checked={form.gender === '男'} onChange={updateRadio('gender')} />
                男
              </label>
              <label className="radio-option">
                <input type="radio" name="gender" value="女" checked={form.gender === '女'} onChange={updateRadio('gender')} />
                女
              </label>
            </div>
          </div>
          <div className="form-field" data-field="birthDate">
            <label htmlFor="field-birthDate">出生日期</label>
            <input id="field-birthDate" type="date" value={form.birthDate} onChange={update('birthDate')} />
          </div>
          <div className="form-field" data-field="phone">
            <label htmlFor="field-phone">手机</label>
            <input
              id="field-phone"
              type="text"
              value={form.phone}
              onChange={update('phone')}
              placeholder="请输入手机号"
              autoComplete="off"
              inputMode="tel"
            />
          </div>
          <div className="form-field" data-field="email">
            <label htmlFor="field-email">邮箱</label>
            <input
              id="field-email"
              type="text"
              value={form.email}
              onChange={update('email')}
              placeholder="请输入邮箱"
              autoComplete="off"
              inputMode="email"
            />
          </div>
          <div className="form-field" data-field="politicalStatus">
            <label htmlFor="field-politicalStatus">政治面貌</label>
            <select id="field-politicalStatus" value={form.politicalStatus} onChange={update('politicalStatus')}>
              <option value="">请选择</option>
              <option value="群众">群众</option>
              <option value="共青团员">共青团员</option>
              <option value="中共党员">中共党员</option>
            </select>
          </div>
          <div className="form-field" data-field="hometown">
            <label htmlFor="field-hometown">籍贯</label>
            <input
              id="field-hometown"
              type="text"
              value={form.hometown}
              onChange={update('hometown')}
              placeholder="请输入籍贯"
              autoComplete="off"
            />
          </div>
          <div className="form-field" data-field="school">
            <label htmlFor="field-school">学校</label>
            <input
              id="field-school"
              type="text"
              value={form.school}
              onChange={update('school')}
              placeholder="请输入学校"
              autoComplete="off"
            />
          </div>
          <div className="form-field" data-field="major">
            <label htmlFor="field-major">专业</label>
            <input
              id="field-major"
              type="text"
              value={form.major}
              onChange={update('major')}
              placeholder="请输入专业"
              autoComplete="off"
            />
          </div>
          <div className="form-field" data-field="degree">
            <label htmlFor="field-degree">学历</label>
            <select id="field-degree" value={form.degree} onChange={update('degree')}>
              <option value="">请选择</option>
              <option value="本科">本科</option>
              <option value="硕士">硕士</option>
              <option value="博士">博士</option>
            </select>
          </div>
          <div className="form-field" data-field="graduationDate">
            <label htmlFor="field-graduationDate">毕业时间</label>
            <input id="field-graduationDate" type="date" value={form.graduationDate} onChange={update('graduationDate')} />
          </div>
          <div className="form-field" data-field="jobIntention">
            <label htmlFor="field-jobIntention">求职意向</label>
            <select id="field-jobIntention" value={form.jobIntention} onChange={update('jobIntention')}>
              <option value="">请选择</option>
              <option value="前端开发工程师">前端开发工程师</option>
              <option value="后端开发工程师">后端开发工程师</option>
              <option value="产品经理">产品经理</option>
              <option value="算法工程师">算法工程师</option>
            </select>
          </div>
          <div className="form-field form-field-full" data-field="selfEvaluation">
            <label htmlFor="field-selfEvaluation">自我评价</label>
            <textarea
              id="field-selfEvaluation"
              value={form.selfEvaluation}
              onChange={update('selfEvaluation')}
              placeholder="请输入自我评价"
              rows={4}
            />
          </div>
        </div>
        <div className="apply-actions">
          <button type="button" className="btn-primary" onClick={handleDemoSubmit}>
            提交申请(演示)
          </button>
          {submitMessage !== '' && (
            <p className="submit-message" role="status">
              {submitMessage}
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
