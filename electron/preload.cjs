// preload:以 contextIsolation 白名单方式向主窗口/悬浮球窗口暴露 campusFill API。
// 注意:内嵌浏览(WebContentsView,加载任意外部网页)使用 preload-bridge.cjs,仅暴露进度桥,
// 绝不向外部页面暴露简历数据(PII)或窗口控制能力。
const { contextBridge, ipcRenderer } = require('electron')

// 填写进度桥:主窗口(演示表单)的注入脚本用它回报逐字段进度
contextBridge.exposeInMainWorld('campusFillBridge', {
  report: stepJson => ipcRenderer.send('cf:fill-progress', stepJson),
})

contextBridge.exposeInMainWorld('campusFill', {
  isElectron: true,
  role: new URLSearchParams(window.location.search).get('role') === 'ball' ? 'ball' : 'main',

  // ── 简历(主窗口)──
  getResumes: () => ipcRenderer.invoke('cf:get-resumes'),
  selectResume: id => ipcRenderer.send('cf:select-resume', id),
  saveResume: resume => ipcRenderer.send('cf:save-resume', resume),
  deleteResume: id => ipcRenderer.send('cf:delete-resume', id),
  onResumesChanged: cb => {
    ipcRenderer.on('cf:resumes-changed', (_event, data) => cb(data))
  },
  /** 导出最近一次填写报告:主进程弹保存对话框并落盘 Markdown,返回落盘路径 */
  exportReport: opts => ipcRenderer.invoke('cf:export-report', opts),

  // ── 内嵌浏览工具栏(主窗口)──
  nav: action => ipcRenderer.send('cf:nav', action),
  onBrowserState: cb => {
    ipcRenderer.on('cf:browser', (_event, state) => cb(state))
  },
  onShellTab: cb => {
    ipcRenderer.on('cf:shell-tab', (_event, payload) => cb(payload))
  },
  shellTab: tab => ipcRenderer.send('cf:shell', { type: 'tab', tab }),

  // ── 填写报告与手动关联 ──
  onFillReport: cb => {
    ipcRenderer.on('cf:fill-report', (_event, report) => cb(report))
  },
  setMapping: payload => ipcRenderer.send('cf:set-mapping', payload),
  /** 报告横幅显隐:主进程据此在内嵌浏览模式下为横幅腾出固定高度 */
  reportVisibility: visible => ipcRenderer.send('cf:report-visibility', { visible: visible === true }),

  // ── 悬浮球窗口 ──
  onState: cb => {
    ipcRenderer.on('cf:state', (_event, payload) => cb(payload))
  },
  // 探测当前页面是否为网申表单页(仅判定,不跳转任何页面)
  detectNow: () => ipcRenderer.send('cf:cmd-from-ball', { type: 'detect' }),
  startFill: () => ipcRenderer.send('cf:cmd-from-ball', { type: 'start' }),
  resetFill: () => ipcRenderer.send('cf:cmd-from-ball', { type: 'reset' }),
  ballReady: () => ipcRenderer.send('cf:cmd-from-ball', { type: 'request-state' }),
  // 拖拽:只上报光标的绝对屏幕坐标(DIP),窗口位置由主进程按「光标 − 抓手偏移」直接算出。
  // 不再传增量:增量累加在「被屏幕边缘钳制」和「每帧取整」两处都会把球带偏(见 main.cjs)。
  ballDragStart: (cursorX, cursorY) => ipcRenderer.send('cf:ball-drag-start', cursorX, cursorY),
  ballDragMove: (cursorX, cursorY) => ipcRenderer.send('cf:ball-drag-move', cursorX, cursorY),
  ballDragEnd: () => ipcRenderer.send('cf:ball-drag-end'),
  setBallMode: expand => ipcRenderer.send('cf:ball-mode', expand === true),
  ballLog: msg => ipcRenderer.send('cf:ball-log', String(msg)),
})
