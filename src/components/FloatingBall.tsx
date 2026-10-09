import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { AutofillStatus } from '../autofill/types'
import { Panel } from './Panel'
import './floating-ball.css'

const BALL_SIZE = 64
const VIEWPORT_EDGE = 8
const DEFAULT_MARGIN = 24
/** 位移超过该阈值视为拖拽,否则视为点击 */
const DRAG_THRESHOLD = 6
/** 面板避让视口边缘的翻转阈值 */
const PANEL_FLIP_X = 340
const PANEL_FLIP_Y = 360

interface BallPosition {
  x: number
  y: number
}

interface DragState {
  pointerId: number
  startClientX: number
  startClientY: number
  origin: BallPosition
  moved: boolean
}

/** 初始位于屏幕右下角 */
function defaultBallPosition(): BallPosition {
  return {
    x: window.innerWidth - BALL_SIZE - DEFAULT_MARGIN,
    y: window.innerHeight - BALL_SIZE - DEFAULT_MARGIN,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

interface FloatingBallProps {
  status: AutofillStatus
  resumeName: string
  onDetect: () => void
  onStartFill: () => void
  onReset: () => void
}

/** 全局悬浮球:可拖拽(pointer events),点击(非拖拽)展开/收起面板 */
export function FloatingBall({ status, resumeName, onDetect, onStartFill, onReset }: FloatingBallProps) {
  const [position, setPosition] = useState<BallPosition>(defaultBallPosition)
  const [open, setOpen] = useState(false)
  const dragState = useRef<DragState | null>(null)

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    dragState.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      origin: position,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragState.current
    if (drag === null || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startClientX
    const dy = event.clientY - drag.startClientY
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    drag.moved = true
    setPosition({
      x: clamp(drag.origin.x + dx, VIEWPORT_EDGE, window.innerWidth - BALL_SIZE - VIEWPORT_EDGE),
      y: clamp(drag.origin.y + dy, VIEWPORT_EDGE, window.innerHeight - BALL_SIZE - VIEWPORT_EDGE),
    })
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragState.current
    if (drag === null || drag.pointerId !== event.pointerId) return
    dragState.current = null
    if (!drag.moved) {
      setOpen(prev => !prev)
    }
  }

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragState.current
    if (drag !== null && drag.pointerId === event.pointerId) {
      dragState.current = null
    }
  }

  const panelClasses = [
    position.y < PANEL_FLIP_Y ? 'below' : '',
    position.x < PANEL_FLIP_X ? 'align-left' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="fb-root" style={{ left: position.x, top: position.y }}>
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
      {open && (
        <Panel
          className={panelClasses}
          status={status}
          resumeName={resumeName}
          onDetect={onDetect}
          onStartFill={onStartFill}
          onReset={onReset}
        />
      )}
    </div>
  )
}
