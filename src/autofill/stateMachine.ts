import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react'
import type { Resume } from '../mock/resumes'
import { FORM_CONTAINER_SELECTOR, isApplicationFormPage } from './detector'
import { FIELD_MAPPINGS, TOTAL_FIELD_COUNT } from './fieldMapping'
import { fillField, resetForm } from './filler'
import type { AutofillEvent, AutofillStatus } from './types'

/** 探测动作的最短可见时长:让「检测中」可被感知,而不是一闪而过 */
const DETECT_MS = 300
const FILL_STEP_MS = 200

// ---- 规范化状态快照(reducer 返回同一引用即可避免无谓重渲染) ----

const STATUS_IDLE: AutofillStatus = { state: 'idle', filledCount: 0, activeFieldLabel: '', totalFields: TOTAL_FIELD_COUNT }
const STATUS_READY: AutofillStatus = { ...STATUS_IDLE, state: 'ready' }
const STATUS_DETECTING: AutofillStatus = { ...STATUS_IDLE, state: 'detecting' }
const STATUS_FILLING: AutofillStatus = { ...STATUS_IDLE, state: 'filling' }
const STATUS_DONE: AutofillStatus = { ...STATUS_IDLE, state: 'done', filledCount: TOTAL_FIELD_COUNT }

export const initialAutofillStatus: AutofillStatus = STATUS_IDLE

/**
 * 面板状态机(唯一迁移依据)。
 *
 * 产品口径:探测是用户点击「开始检测」触发的**显式动作**,不做后台轮询;
 * 判定结果只有「未检测到网申表单」与「已检测到网申表单(站点名)」两种。
 *
 *   idle --DETECT--> detecting --DETECT_PASS--> ready --START--> filling --满--> done
 *                             \--DETECT_FAIL--> idle                      |
 *   done --RESET--> ready(表单已清空,仍在网申页)                          |
 *   任意态 --ABORT--> idle(离开网申页/表单容器消失)  <--------------------+
 */
export function autofillReducer(status: AutofillStatus, event: AutofillEvent): AutofillStatus {
  switch (event.type) {
    case 'DETECT':
      // 填写中/完成态不允许重新探测,避免把正在进行的填写打断
      return status.state === 'idle' || status.state === 'ready' ? STATUS_DETECTING : status
    case 'DETECT_PASS':
      return status.state === 'detecting' ? STATUS_READY : status
    case 'DETECT_FAIL':
      return status.state === 'detecting' ? STATUS_IDLE : status
    case 'START':
      return status.state === 'ready' ? STATUS_FILLING : status
    case 'FIELD_FILLED':
      if (status.state !== 'filling') return status
      if (event.index >= TOTAL_FIELD_COUNT) return STATUS_DONE
      return { ...STATUS_FILLING, filledCount: event.index, activeFieldLabel: event.label }
    case 'RESET':
      return status.state === 'done' ? STATUS_READY : status
    case 'ABORT':
      return status.state === 'idle' ? status : STATUS_IDLE
    default:
      return status
  }
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => { window.setTimeout(resolve, ms) })

export interface AutofillMachine {
  status: AutofillStatus
  /** 未检测到 / 已检测到 态面板按钮「开始检测」 */
  detect: () => void
  /** 已检测到态面板按钮「开始填写」 */
  startFill: () => void
  /** 完成态面板按钮「清空重填」:清空表单并回到已检测到 */
  resetAndRefill: () => void
}

/** 悬浮球状态机编排:探测由用户动作触发,填写逐字段推进,全部事件收敛进上面的 reducer */
export function useAutofillMachine(currentResume: Resume | undefined): AutofillMachine {
  const [status, dispatch] = useReducer(autofillReducer, initialAutofillStatus)
  // 填写循环按字段逐个读取最新简历,避免中途切换简历导致循环重启;
  // Electron 模式简历异步加载,加载完成前不执行填写
  const resumeRef = useRef(currentResume)
  useEffect(() => {
    resumeRef.current = currentResume
  }, [currentResume])

  // 探测:仅在「检测中」态执行一次判定。不做后台轮询——不探测用户没要求的页面。
  useEffect(() => {
    if (status.state !== 'detecting') return
    const timer = window.setTimeout(() => {
      dispatch({ type: isApplicationFormPage() ? 'DETECT_PASS' : 'DETECT_FAIL' })
    }, DETECT_MS)
    return () => window.clearTimeout(timer)
  }, [status.state])

  // 填写中:按约 200ms/字段顺序填入并高亮;离开网申页立即中止,已填字段保留
  useLayoutEffect(() => {
    if (status.state !== 'filling') return
    let cancelled = false
    const run = async (): Promise<void> => {
      if (resumeRef.current === undefined) return
      for (let index = 0; index < FIELD_MAPPINGS.length; index += 1) {
        if (cancelled) return
        if (!isApplicationFormPage()) {
          dispatch({ type: 'ABORT' })
          return
        }
        const field = FIELD_MAPPINGS[index]
        if (field === undefined) continue
        const container = document.querySelector(FORM_CONTAINER_SELECTOR)
        if (container) {
          fillField(container, field, resumeRef.current.profile[field.key])
        }
        dispatch({ type: 'FIELD_FILLED', index: index + 1, label: field.label })
        await sleep(FILL_STEP_MS)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [status.state])

  const detect = useCallback(() => {
    dispatch({ type: 'DETECT' })
  }, [])

  const startFill = useCallback(() => {
    dispatch({ type: 'START' })
  }, [])

  const resetAndRefill = useCallback(() => {
    // 仅清空映射字段;绝不触碰页面上的任何提交按钮(产品铁律)
    const container = document.querySelector(FORM_CONTAINER_SELECTOR)
    if (container) resetForm(container)
    dispatch({ type: 'RESET' })
  }, [])

  return { status, detect, startFill, resetAndRefill }
}
