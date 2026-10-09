import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { initialAutofillStatus } from '../autofill/stateMachine'
import type { AutofillStatus } from '../autofill/types'
import type { CampusFillPayload } from '../types/electron-api'
import { Panel } from '../components/Panel'

/** 位移超过该阈值视为拖拽窗口,否则视为点击(与页面内悬浮球口径一致) */
const DRAG_THRESHOLD = 6

interface DragState {
  pointerId: number
  startScreenX: number
  startScreenY: number
  moved: boolean
}

/**
 * 桌面级悬浮球窗口:球体锚定窗口右下角,可拖到屏幕任意位置(经 IPC 移动窗口);
 * 点击展开面板;透明区域鼠标穿透由命中检测驱动。
 *
 * 拖拽口径:渲染端只上报光标的**绝对屏幕坐标**(screenX/screenY,同为主进程所用的 DIP 口径),
 * 窗口位置由主进程按「光标 − 抓手偏移」直接算出。早期实现上报的是相对增量
 * (本帧 screenX − 起手 screenX),再由主进程 getPosition()+dx 累加,实测两处必然走偏:
 * ① 窗口被工作区边缘钳制后,丢失的位移会在反向拖动时一次性补回,球猛地弹离光标;
 * ② 每帧 Math.round 的截断误差沿拖拽方向持续累积。
 */
export function BallApp() {
  const api = window.campusFill
  const [status, setStatus] = useState<AutofillStatus>(initialAutofillStatus)
  const [resumeName, setResumeName] = useState('加载中…')
  const [siteLabel, setSiteLabel] = useState<string>('')
  const [open, setOpen] = useState(false)
  // 面板放球的哪一侧由主进程决定(它掌握工作区与窗口原点),渲染端只负责按结论翻转布局
  const [panelBelow, setPanelBelow] = useState(false)
  const dragState = useRef<DragState | null>(null)

  useEffect(() => {
    if (api === undefined) return
    api.onState((payload: CampusFillPayload) => {
      setStatus(payload.status)
      setResumeName(payload.resumeName)
      setSiteLabel(payload.siteLabel)
      setPanelBelow(payload.panelBelow === true)
    })
    api.ballReady()
    api.ballLog('renderer-ready')
  }, [api])

  // 面板开合 → 切换窗口尺寸:收起时 88×88 只包住球体(不挡屏幕、原生可点),
  // 展开时 340×400 容纳面板(面板按钮原生可点)。不再依赖 setIgnoreMouseEvents
  // 的 mousemove 转发激活——该机制在本机随机失效,曾导致点击穿透/面板点不开。
  useEffect(() => {
    if (api === undefined) return
    api.setBallMode(open)
    api.ballLog(`mode->${open ? 'expand' : 'collapse'}`)
  }, [api, open])

  if (api === undefined) {
    // 直接以浏览器打开 ball.html 属于异常入口,给出可见提示而非白屏
    return <div className="ball-misuse">悬浮球窗口请在校招快填桌面应用内使用</div>
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    dragState.current = {
      pointerId: event.pointerId,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragState.current
    if (drag === null || drag.pointerId !== event.pointerId) return
    // 起手位移只用于区分「点击」与「拖拽」;真正的移动一律用光标绝对坐标
    if (!drag.moved) {
      const dx = event.screenX - drag.startScreenX
      const dy = event.screenY - drag.startScreenY
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      drag.moved = true
      api.ballDragStart(event.screenX, event.screenY)
      api.ballLog(`drag-start cursor=${Math.round(event.screenX)},${Math.round(event.screenY)}`)
    }
    api.ballDragMove(event.screenX, event.screenY)
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragState.current
    if (drag === null || drag.pointerId !== event.pointerId) return
    dragState.current = null
    if (!drag.moved) {
      const next = !open
      api.ballLog(`pointer-click toggle open->${next ? 1 : 0}`)
      setOpen(next)
    } else {
      api.ballDragEnd()
    }
  }

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragState.current
    if (drag !== null && drag.pointerId === event.pointerId) {
      dragState.current = null
      // 拖拽被系统打断(如触摸被接管、指针捕获丢失)同样要结束会话,
      // 否则主进程会保留过期抓手偏移;这里必须留痕,否则「拖到一半停住」无从判断原因
      api.ballLog(`drag-cancel moved=${drag.moved ? 1 : 0}`)
      if (drag.moved) api.ballDragEnd()
    }
  }

  return (
    <div className="ball-hit">
      {/*
        ball-anchored:球锚在窗口右下(面板在球上方)。
        panel-below:球改锚窗口右上,面板翻到球下方 —— 球贴近屏幕顶部时由主进程下发,
        否则 300×~140 的面板会被挤出屏幕,用户看不到状态文案。
      */}
      <div className={panelBelow ? 'fb-root ball-anchored panel-below' : 'fb-root ball-anchored'}>
        {open && (
          <Panel
            className={panelBelow ? 'below' : undefined}
            status={status}
            resumeName={resumeName}
            siteLabel={siteLabel}
            idleHint="请先在「网申浏览」标签中打开目标公司的网申页并完成登录,再点「开始检测」。悬浮球只能检测本软件内的页面。"
            onDetect={() => api.detectNow()}
            onStartFill={() => api.startFill()}
            onReset={() => api.resetFill()}
          />
        )}
        <div
          className="fb-ball"
          role="button"
          aria-label="校招快填悬浮球"
          aria-expanded={open}
          tabIndex={0}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setOpen(prev => !prev)
            }
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          填
        </div>
      </div>
    </div>
  )
}
