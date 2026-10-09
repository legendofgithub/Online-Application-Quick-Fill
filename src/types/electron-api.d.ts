import type { AutofillStatus } from '../autofill/types'
import type { Resume } from '../mock/resumes'

/** 主进程 → 悬浮球窗口的状态快照 */
export interface CampusFillPayload {
  status: AutofillStatus
  resumeName: string
  /** 检测命中的站点名(演示公司 / MokaHR / 通用表单),展示在就绪文案中 */
  siteLabel: string
  /** 面板是否放在球体下方(球贴近屏幕顶部时主进程会翻转面板,避免被挤出屏幕) */
  panelBelow?: boolean
}

/** 浏览器工具栏状态(主进程 → 主窗口) */
export interface BrowserState {
  url: string
  canGoBack: boolean
  canGoForward: boolean
  loading: boolean
}

/** 简历数据快照(主进程持有,userData/resumes.json 落盘) */
export interface ResumeSnapshot {
  resumes: Resume[]
  currentId: string
}

/** 一次自动填写完成后的报告(主进程 → 主窗口) */
export interface FillReport {
  resumeName: string
  filled: number
  total: number
  /**
   * 匹配到了简历字段、但没能填上的(值为空,或控件类型/下拉选项对不上)。
   * 注意与 missingPageFields 的区别:这里页面**有**对应控件,只是没写进去。
   */
  missingData: string[]
  /** 页面上带标签但没获得数据的信息项(需人工补充或手动关联) */
  missingPageFields: string[]
}

/** 「导出到 DSH」的结果 */
export interface ExportReportResult {
  ok: boolean
  /** 成功时的落盘路径(默认写进 DSH 收件箱) */
  path?: string
  /** 是否已把「请分析这份报告」的提示语放进剪贴板 */
  copied?: boolean
  /** no-report(还没填写过) / write-failed */
  reason?: string
}

/** preload 经 contextBridge 暴露的 API(仅 Electron 环境存在;web 开发模式下为 undefined) */
export interface CampusFillApi {
  isElectron: true
  /** 窗口角色:main=主窗口(简历/网申页),ball=悬浮球窗口 */
  role: 'main' | 'ball'

  // ── 简历(主窗口)──
  getResumes(): Promise<ResumeSnapshot>
  selectResume(id: string): void
  /** 新增或更新简历(id 为空串时新增,新增后自动切换为当前简历) */
  saveResume(resume: Resume): void
  /** 删除简历(至少保留一份;删除当前简历时自动切换) */
  deleteResume(id: string): void
  onResumesChanged(cb: (snapshot: ResumeSnapshot) => void): void

  // ── 内嵌浏览工具栏(主窗口)──
  nav(action: { type: 'url'; url: string } | { type: 'back' | 'forward' | 'reload' | 'stop' }): void
  onBrowserState(cb: (state: BrowserState) => void): void
  /** 把最近一次填写导出成 Markdown(主进程弹保存对话框;toPath 仅供测试直接落盘) */
  exportReport(opts?: { toPath?: string; mode?: 'dsh' | 'file' }): Promise<ExportReportResult>
  /** 主进程要求切换 tab(如悬浮球「进入演示网申页」) */
  onShellTab(cb: (payload: { tab: 'resume' | 'browse' }) => void): void
  shellTab(tab: 'resume' | 'browse'): void

  // ── 填写报告与手动关联 ──
  /** 填写报告(主进程 → 主窗口):页面字段与缺项情况 */
  onFillReport(cb: (report: FillReport) => void): void
  /** 手动关联:把页面字段 label 绑定到简历字段(传空 target 删除关联) */
  setMapping(payload: { label: string; target: string }): void
  /** 报告横幅显隐:主进程据此在内嵌浏览模式下为横幅腾出固定高度 */
  reportVisibility(visible: boolean): void

  // ── 悬浮球窗口 ──
  onState(cb: (payload: CampusFillPayload) => void): void
  /** 探测当前页面是否为网申表单页(仅判定,不跳转任何页面) */
  detectNow(): void
  startFill(): void
  resetFill(): void
  ballReady(): void
  /**
   * 拖拽起手:上报光标的绝对屏幕坐标(DIP,即 pointer 事件的 screenX/screenY)。
   * 主进程据此记录抓手相对窗口原点的偏移,后续 ballDragMove 只认光标坐标。
   */
  ballDragStart(cursorX: number, cursorY: number): void
  /** 拖拽中:上报光标当前的绝对屏幕坐标(DIP);窗口位置 = 光标 − 抓手偏移(主进程钳制到工作区) */
  ballDragMove(cursorX: number, cursorY: number): void
  /** 拖拽结束(pointerup / pointercancel):主进程清除拖拽会话 */
  ballDragEnd(): void
  /** 面板开合切换球窗口尺寸(收起 88×88 只包球体/展开 340×400 容纳面板),球体屏幕位置不变 */
  setBallMode(expand: boolean): void
  /** 渲染端诊断日志(落盘 main.log,定位面板交互问题) */
  ballLog(msg: string): void
}

declare global {
  interface Window {
    campusFill?: CampusFillApi
  }
}

export {}
