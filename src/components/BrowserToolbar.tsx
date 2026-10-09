import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { BrowserState } from '../types/electron-api'

interface BrowserToolbarProps {
  tab: 'resume' | 'browse'
  onTabChange: (tab: 'resume' | 'browse') => void
  browserState: BrowserState
}

/**
 * 主窗口顶部工具栏(Electron 模式):[简历管理|网申浏览] 标签 + 地址栏 + 前进/后退/刷新。
 * 高度固定 48px,与主进程 TOOLBAR_H 常量一致(内嵌浏览区在其下方)。
 * 快捷键 Ctrl+L 聚焦地址栏(浏览器习惯)。
 */
export function BrowserToolbar({ tab, onTabChange, browserState }: BrowserToolbarProps) {
  const api = window.campusFill
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')

  // 导航状态变化时同步地址栏草稿(仅在不处于编辑态时)
  useEffect(() => {
    setDraft(browserState.url)
  }, [browserState.url])

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const commitUrl = (): void => {
    const url = draft.trim()
    if (url === '') return
    api?.nav({ type: 'url', url })
    inputRef.current?.blur()
  }

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitUrl()
    }
    if (event.key === 'Escape') {
      setDraft(browserState.url)
      inputRef.current?.blur()
    }
  }

  return (
    <div className="browser-toolbar">
      <div className="bt-tabs" role="tablist" aria-label="主窗口标签">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'resume'}
          className={tab === 'resume' ? 'bt-tab active' : 'bt-tab'}
          onClick={() => onTabChange('resume')}
        >
          简历管理
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'browse'}
          className={tab === 'browse' ? 'bt-tab active' : 'bt-tab'}
          onClick={() => onTabChange('browse')}
        >
          网申浏览
        </button>
      </div>
      <div className="bt-nav">
        <button
          type="button"
          className="bt-icon"
          aria-label="后退"
          disabled={!browserState.canGoBack}
          onClick={() => api?.nav({ type: 'back' })}
        >
          ←
        </button>
        <button
          type="button"
          className="bt-icon"
          aria-label="前进"
          disabled={!browserState.canGoForward}
          onClick={() => api?.nav({ type: 'forward' })}
        >
          →
        </button>
        <button
          type="button"
          className="bt-icon"
          aria-label="刷新"
          onClick={() => api?.nav({ type: 'reload' })}
        >
          ⟳
        </button>
      </div>
      <input
        ref={inputRef}
        className="bt-url"
        type="text"
        placeholder="输入网申页地址(Ctrl+L 聚焦),如 app.mokahr.com/campus-recruitment/…"
        value={draft}
        spellCheck={false}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={onInputKeyDown}
      />
    </div>
  )
}
