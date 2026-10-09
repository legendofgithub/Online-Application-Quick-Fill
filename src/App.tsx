import { useEffect, useState } from 'react'
import './App.css'
import { FloatingBall } from './components/FloatingBall'
import { BrowserToolbar } from './components/BrowserToolbar'
import { FillReportBanner } from './components/FillReportBanner'
import type { BrowserState, FillReport } from './types/electron-api'
import { useAutofillMachine } from './autofill/stateMachine'
import { ApplyPage } from './routes/ApplyPage'
import { ResumePage } from './routes/ResumePage'
import { ResumeProvider } from './store/resumeStore'
import { useResumeStore } from './store/useResumeStore'

type Route = 'resume' | 'apply'
type Tab = 'resume' | 'browse'

const KNOWN_HASHES: readonly string[] = ['#/resume', '#/apply']

/**
 * hash 路由:仅识别 #/resume 与 #/apply;
 * 无 hash 或未知 hash(如 #/foo)一律 location.replace 重定向到 #/resume(不污染历史栈)。
 */
function useHashRoute(): Route {
  const [hash, setHash] = useState<string>(() => window.location.hash)

  useEffect(() => {
    const onHashChange = (): void => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (!KNOWN_HASHES.includes(hash)) {
      // location.replace 触发 hashchange,由上方监听器同步 state
      window.location.replace('#/resume')
    }
  }, [hash])

  return hash === '#/apply' ? 'apply' : 'resume'
}

function AppShell() {
  const route = useHashRoute()
  const { currentResume, loading } = useResumeStore()
  const { status, detect, startFill, resetAndRefill } = useAutofillMachine(currentResume)

  // Electron 模式:主窗口承载 简历管理/网申浏览 两个标签,自动填写引擎在主进程,
  // 悬浮球是独立桌面窗口;web 开发模式(npm run dev)渲染页面内悬浮球,行为不变。
  const api = window.campusFill
  const isElectron = api?.isElectron === true
  const [tab, setTab] = useState<Tab>('resume')
  const [browserState, setBrowserState] = useState<BrowserState>({ url: '', canGoBack: false, canGoForward: false, loading: false })
  const [fillReport, setFillReport] = useState<FillReport | null>(null)

  useEffect(() => {
    if (!isElectron || api === undefined) return
    api.onBrowserState(state => setBrowserState(state))
    api.onShellTab(payload => setTab(payload.tab))
    api.onFillReport(report => setFillReport(report))
  }, [api, isElectron])

  // 报告横幅显示/关闭时通知主进程调整内嵌浏览区(横幅在工具栏与网页之间,固定高度)
  useEffect(() => {
    if (!isElectron || api === undefined) return
    api.reportVisibility(fillReport !== null)
  }, [api, isElectron, fillReport])

  const selectTab = (next: Tab): void => {
    setTab(next)
    api?.shellTab(next)
  }

  return (
    <div className="app">
      {isElectron && <BrowserToolbar tab={tab} onTabChange={selectTab} browserState={browserState} />}
      {isElectron && fillReport !== null && (
        <FillReportBanner
          report={fillReport}
          currentResume={currentResume}
          onSetMapping={payload => api?.setMapping(payload)}
          onExport={mode => api?.exportReport({ mode }) ?? Promise.resolve({ ok: false, reason: 'unavailable' })}
          onClose={() => setFillReport(null)}
        />
      )}
      {(!isElectron || tab === 'resume') && (
        <>
          <header className="app-header">
            <span className="app-logo" aria-hidden="true">
              校
            </span>
            <span className="app-title">校招快填</span>
            <span className="app-tag">只填不提交 · 网申自动填写</span>
          </header>
          {loading ? (
            <main className="page">
              <p className="page-tip">简历数据加载中…</p>
            </main>
          ) : (
            <>
              {route === 'apply' ? <ApplyPage /> : <ResumePage />}
              {/* 悬浮球为全局组件,挂载于路由之外,路由切换全程常驻(Electron 模式由独立窗口承载) */}
              {!isElectron && (
                <FloatingBall
                  status={status}
                  resumeName={currentResume?.name ?? ''}
                  onDetect={detect}
                  onStartFill={startFill}
                  onReset={resetAndRefill}
                />
              )}
            </>
          )}
        </>
      )}
      {isElectron && tab === 'browse' && (
        // 内嵌浏览器(WebContentsView)覆盖此区域,React 侧仅保留占位背景
        <main className="browse-backdrop" aria-hidden="true" />
      )}
    </div>
  )
}

export default function App() {
  return (
    <ResumeProvider>
      <AppShell />
    </ResumeProvider>
  )
}
