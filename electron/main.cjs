// 校招快填主进程:主窗口(简历管理+内嵌网申浏览)+ 桌面悬浮球窗口 + 统一自动填写引擎
const { app, BrowserWindow, WebContentsView, ipcMain, screen, shell, dialog, clipboard, session } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { matchAdapter, DEMO_PROBE, GENERIC_PROBE } = require('./adapters.cjs')
const fillScript = require('./fillScript.cjs')
const {
  BALL_COLLAPSED_W,
  BALL_COLLAPSED_H,
  BALL_ANCHOR,
  ballWindowSize,
  windowOriginForBallCenter,
  ballCenterForWindowOrigin,
  clampBallCenter,
  shouldPlacePanelBelow,
} = require('./ballGeometry.cjs')

app.setName('校招快填')

// 开发运行(electron .)与正式安装共用一台机器时,隔离 userData:
// 避免自动化测试写入用户的正式简历库,也避免单实例锁误伤对方
if (process.defaultApp === true) {
  app.setPath('userData', path.join(__dirname, '..', '.dev-data'))
}

// 单实例锁:重复双击时聚焦已有窗口,而不是叠出多个悬浮球/抢写同一个 resumes.json
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWin !== null) {
      if (mainWin.isMinimized()) mainWin.restore()
      mainWin.focus()
    }
  })
}

/** 面板收起态窗口只包住球体(64 DIP 球 + 右下 12 DIP 边距),原生接收点击。
 * 不再使用 setIgnoreMouseEvents 点击穿透:其 mousemove 转发在本机不可靠(点击随机失效),
 * 且高频 ignore 切换曾是主进程崩溃弹窗的嫌疑源。窗口尺寸/几何常量见 ballGeometry.cjs */
const BALL_EDGE_MARGIN = 16
/**
 * 「导出到 DSH」的默认收件箱:报告落到 AI 能直接读到的固定路径,
 * 用户再把剪贴板里那句提示语粘进对话即可。
 * 可用 %APPDATA%\校招快填\dsh-inbox.txt(一行,文件夹路径)覆盖。
 */
/**
 * 浏览视图的会话分区名。'persist:' 前缀 = 落盘,重启后保留登录状态。
 * 改动这个值等于换一套全新的 cookie 库(用户需要重新登录一次)。
 */
const BROWSE_PARTITION = 'persist:campus-fill'

const DSH_INBOX_DEFAULT = 'F:\\AI\\突发奇想的乱七八糟\\简历投递工作流\\qa-reports'

let ballExpanded = false
/** 面板是否放在球体下方(球贴近屏幕顶部时为 true,避免面板被挤出屏幕) */
let ballPanelBelow = false
/** 主窗口内 React 工具栏高度(DIP),内嵌浏览区在其下方;与 BrowserToolbar 组件保持一致 */
const TOOLBAR_H = 48
/** 填写报告横幅高度(DIP):内嵌浏览模式下网页区域为其让位;与 .fill-report 样式保持一致 */
const REPORT_H = 224

let mainWin = null
let ballWin = null
let browseView = null
let browseVisible = false
let reportVisible = false
let quitTimeout = null
/**
 * 悬浮球拖拽会话:抓手相对窗口原点的偏移 [offX, offY] + 最近一次光标屏幕坐标(均为 DIP)。
 * 拖拽一律按「光标的绝对屏幕坐标 − 抓手偏移」直接算窗口位置,不做增量累加:
 * 累加式(旧实现 getPosition() + dx)在两种情况下必然走偏 ——
 * ① 被工作区边缘钳制后,丢失的位移会在反向拖动时一次性补回,球猛地弹离光标;
 * ② 每帧 Math.round 的截断误差会沿拖拽方向持续累积。
 */
let ballDragAnchor = null
/** 探测的「走了哪个分支」轨迹:落盘后一眼定位(见 detectNow / detect) */
let envTrace = ''
/** 内嵌浏览视图的状态(no-view / view-on / view-off):与分支 trace 分开记录,避免被覆盖 */
let envViewState = 'no-view'

// ── 简历存储(userData/resumes.json,首次运行写入初始空白简历)──────────

/**
 * 全新安装 / 数据文件损坏时的初始简历。
 *
 * 这里**必须是中性空模板**,不能再放「张三-前端开发方向」这类演示数据:
 * 该种子会在数据被清空、损坏或换机重装时自动写回,让虚构人物重新出现在用户界面里,
 * 与用户的真实简历混在一起造成混淆(用户已明确要求消除)。
 */
const SEED_RESUMES = {
  currentId: 'resume-default',
  resumes: [
    {
      id: 'resume-default',
      name: '我的简历',
      updatedAt: '',
      profile: {},
      custom: {},
      // 可重复记录:新简历从一条空白教育开始(与编辑器的初始状态一致)
      educations: [
        {
          id: 'resume-default-edu-0',
          学校: '',
          院系: '',
          专业: '',
          学历: '',
          学制: '',
          入学时间: '',
          毕业时间: '',
          统招与否: '',
          GPA: '',
          专业排名: '',
        },
      ],
      experiences: [],
      projects: [],
      awards: [],
    },
  ],
}

function resumesPath() {
  return path.join(app.getPath('userData'), 'resumes.json')
}

function loadResumeStore() {
  try {
    const raw = fs.readFileSync(resumesPath(), 'utf8')
    const data = JSON.parse(raw)
    if (Array.isArray(data.resumes)) {
      // 剔除损坏元素(非对象/缺 id),过滤后为空则回种子,杜绝坏数据进入渲染进程
      const clean = data.resumes.filter(r => r != null && typeof r === 'object' && typeof r.id === 'string')
      if (clean.length > 0) return { currentId: typeof data.currentId === 'string' ? data.currentId : clean[0].id, resumes: clean }
    }
  } catch {
    /* 首次运行或文件损坏:落种子 */
  }
  fs.mkdirSync(path.dirname(resumesPath()), { recursive: true })
  fs.writeFileSync(resumesPath(), JSON.stringify(SEED_RESUMES, null, 2), 'utf8')
  return JSON.parse(JSON.stringify(SEED_RESUMES))
}

function saveResumeStore(store) {
  fs.writeFileSync(resumesPath(), JSON.stringify(store, null, 2), 'utf8')
}

// ── 字段手动关联映射(页面字段规范化 label → 简历字段名),跨站点持久记忆 ──

function mappingsPath() {
  return path.join(app.getPath('userData'), 'field-mappings.json')
}

/** 与注入脚本的 norm() 保持同一规范化口径 */
function normalizeLabel(label) {
  return String(label ?? '')
    .replace(/[\s:*:::　]/g, '')
    .toLowerCase()
}

function loadMappings() {
  try {
    const data = JSON.parse(fs.readFileSync(mappingsPath(), 'utf8'))
    if (data !== null && typeof data === 'object' && data.mappings !== undefined) return data.mappings
  } catch {
    /* 首次运行 */
  }
  return {}
}

function saveMappings(mappings) {
  fs.mkdirSync(path.dirname(mappingsPath()), { recursive: true })
  fs.writeFileSync(mappingsPath(), JSON.stringify({ mappings }, null, 2), 'utf8')
}

let resumeStore = null
function currentResume() {
  return (
    resumeStore.resumes.find(r => r != null && r.id === resumeStore.currentId) ?? resumeStore.resumes[0]
  )
}

// ── 窗口 ──────────────────────────────────────────────

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: '校招快填 · 校招网申自动填写',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // 演示表单的填写脚本用 setTimeout(200ms) 逐字段推进;窗口被遮挡/不在前台时
      // Chromium 会节流甚至暂停后台定时器,表现为「recheck 命中后卡住、不报错也不完成」。
      backgroundThrottling: false,
    },
  })

  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWin.on('closed', () => {
    mainWin = null
    scheduleQuit()
  })
  mainWin.on('resize', layoutBrowseView)

  void mainWin.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

function createBallWindow() {
  const wa = screen.getPrimaryDisplay().workArea
  // 初始收起:窗口只包住球体;球心保持与旧版(340×400 窗口)相同的屏幕位置
  const ballCx = wa.x + wa.width - BALL_EDGE_MARGIN - BALL_ANCHOR
  const ballCy = wa.y + wa.height - BALL_EDGE_MARGIN - BALL_ANCHOR
  ballExpanded = false
  ballWin = new BrowserWindow({
    width: BALL_COLLAPSED_W,
    height: BALL_COLLAPSED_H,
    x: ballCx - BALL_ANCHOR,
    y: ballCy - BALL_ANCHOR,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: '校招快填·悬浮球',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  // level 必须是 Electron 的合法枚举;原值 'screen-level' 不在枚举内(合法为 screen-saver 等),
  // 技术方案 §2.2 的意图也是 screen-saver。Windows 下 level 参数被忽略,故此前未暴露为崩溃。
  ballWin.setAlwaysOnTop(true, 'screen-saver')
  ballWin.on('closed', () => {
    ballWin = null
    scheduleQuit()
  })
  void ballWin.loadFile(path.join(__dirname, '..', 'dist', 'ball.html'), { search: 'role=ball' })
}

/**
 * 球体当前屏幕中心。
 * 球心在窗口内的纵向偏移取决于面板放在哪一侧(上方 → 贴窗口底;下方 → 贴窗口顶),
 * 所以必须用 ballAnchorY 而不是写死 h-BALL_ANCHOR。
 */
function currentBallCenter() {
  if (ballWin === null) return null
  const pos = ballWin.getPosition()
  if (!Number.isFinite(pos[0]) || !Number.isFinite(pos[1])) return null
  return ballCenterForWindowOrigin({ x: pos[0], y: pos[1] }, ballExpanded, ballPanelBelow)
}

/**
 * 按球心摆放球窗口:决定面板放哪一侧 → 由球心反推窗口原点 → 落位。
 *
 * **不对窗口做工作区钳制**:可见性已由调用方的 clampBallCenter 施加在**球心**上;
 * 再夹窗口就会重现「球只能在下半屏活动」的老问题(400 高的窗口进了工作区,
 * 贴着窗口底边的球自然到不了上半屏)。
 * 面板方向发生变化时通知渲染端翻转面板。
 */
function applyBallGeometry(center, workArea, expanded) {
  if (ballWin === null) return
  const below = shouldPlacePanelBelow(center.y, workArea, expanded)
  const size = ballWindowSize(expanded)
  const origin = windowOriginForBallCenter(center, expanded, below)
  try {
    ballWin.setBounds({ x: origin.x, y: origin.y, width: size[0], height: size[1] })
  } catch (err) {
    logLine('ball-bounds-failed', err)
    return
  }
  logLine('ball-bounds', `center=${Math.round(center.x)},${Math.round(center.y)} origin=${origin.x},${origin.y} size=${size[0]}x${size[1]} panel=${below ? 'below' : 'above'}`)
  if (below !== ballPanelBelow) {
    ballPanelBelow = below
    // 面板翻转只影响渲染端布局,复用 cf:state 通道下发(见 push 里的 panelBelow)
    autofill.push()
  }
}

/** 任一窗口关闭即退出(延迟一拍,避免窗口重建竞态) */
function scheduleQuit() {
  if (quitTimeout !== null) clearTimeout(quitTimeout)
  quitTimeout = setTimeout(() => app.quit(), 200)
}

// ── 内嵌网申浏览(WebContentsView,仅 bridge preload,不暴露任何数据 API)──

/**
 * 退出前把会话数据落盘。
 *
 * cookie / localStorage 都是懒写入:进程被强杀(任务管理器结束、脚本 Stop-Process)
 * 时未落盘的部分会丢 —— 用户看到的现象就是「又要重新登录」。
 */
function flushBrowseSession() {
  try {
    session.fromPartition(BROWSE_PARTITION).flushStorageData()
  } catch {
    /* 会话尚未建立时忽略 */
  }
}

function ensureBrowseView() {
  if (browseView !== null) return
  browseView = new WebContentsView({
    webPreferences: {
      // 命名持久分区:cookie / localStorage / IndexedDB 落在
      // userData/Partitions/campus-fill 下,重启后仍然有效。
      // 网申站点(腾讯/快手/安永)丢登录态就得重新登录,代价很高,
      // 所以这里用显式分区而不是依赖默认会话的隐式持久化。
      partition: BROWSE_PARTITION,
      preload: path.join(__dirname, 'preload-bridge.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // 真实站点的通用填写同样靠注入脚本里的延时逐字段推进:
      // 窗口被遮挡时若被节流,用户会看到「点了开始填写却半天不动」。
      backgroundThrottling: false,
    },
  })
  mainWin.contentView.addChildView(browseView)
  const wc = browseView.webContents
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  const pushState = () => {
    sendToMain('cf:browser', {
      url: wc.getURL(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      loading: wc.isLoading(),
    })
  }
  wc.on('did-navigate', pushState)
  wc.on('did-navigate-in-page', pushState)
  wc.on('did-start-loading', pushState)
  wc.on('did-stop-loading', pushState)
  // 换页后上一次的检测结论不再可信:打断填写并回到「未检测到」,由用户重新点「开始检测」
  wc.on('did-navigate', () => {
    autofill.abortFilling()
    autofill.resetToIdle()
  })
  pushState()
}

function layoutBrowseView() {
  if (browseView === null || mainWin === null) return
  const size = mainWin.getContentSize()
  const cw = Number.isFinite(size[0]) ? size[0] : 0
  const ch = Number.isFinite(size[1]) ? size[1] : 0
  try {
    if (browseVisible) {
      const top = TOOLBAR_H + (reportVisible ? REPORT_H : 0)
      browseView.setBounds({ x: 0, y: top, width: Math.max(0, cw), height: Math.max(0, ch - top) })
    } else {
      browseView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    }
  } catch (err) {
    logLine('layout-browse-failed', err)
  }
}

function sendToMain(channel, payload) {
  mainWin?.webContents.send(channel, payload)
}

function sendToBall(channel, payload) {
  ballWin?.webContents.send(channel, payload)
}

// ── 统一自动填写引擎(状态机语义与页面内 stateMachine.ts 的 T1–T7 对齐)──

/**
 * 在目标页面的主 frame 与全部子 frame(含跨域 iframe/OOPIF)各执行一次脚本。
 * 返回每个 frame 的结果数组(注入异常的 frame 为 null):
 * - 探测:存在 true 即命中;有非 null 但全 false = 确认无表单;全 null = 页面暂不可测('error')
 * - 填写:取首个非 null 的汇总结果
 * 子 frame 注入依赖 WebFrameMain.executeJavaScript;preload 会注入到每个 frame,
 * 因此 iframe 内的进度桥同样可用。任一 frame 失败不影响其余。
 */
async function executeOnFrames(wc, script) {
  // 导航进行中/刚创建/已销毁的 webContents,mainFrame 可能尚未就绪——视为暂不可测
  if (wc == null || typeof wc !== 'object') return []
  if (typeof wc.isDestroyed === 'function' && wc.isDestroyed()) return []
  if (wc.mainFrame == null || typeof wc.mainFrame !== 'object') return []
  const frames = []
  try {
    frames.push(wc.mainFrame)
    for (const frame of wc.mainFrame.frames) frames.push(frame)
  } catch {
    /* frames 枚举失败时退回仅主 frame */
  }
  return Promise.all(frames.map(frame => frame.executeJavaScript(script).catch(() => null)))
}

/**
 * 环境探测命中结果 —— T1/T7 状态机的核心契约。
 * 显式声明后,detect() 的三种返回(命中/null/'error')才能被正确收窄,
 * 否则 'error' 会被推断成普通 string,调用处再也分不清「命中」与「暂不可测」。
 * @typedef {{ target: any, kind: 'demo' | 'generic', label: string }} DetectHit
 */

const autofill = {
  status: { state: 'idle', filledCount: 0, activeFieldLabel: '', totalFields: 13 },
  /** 最近一次填写的完整结果(状态机只存 missingPageFields),导出报告用 */
  lastResult: null,
  siteLabel: '演示公司',
  busy: false,

  push() {
    const resume = currentResume()
    sendToBall('cf:state', {
      status: this.status,
      resumeName: resume !== undefined && typeof resume.name === 'string' ? resume.name : '(无简历)',
      siteLabel: this.siteLabel,
      // 面板放在球的哪一侧由主进程决定(它才知道工作区与窗口原点),渲染端据此翻转布局
      panelBelow: ballPanelBelow,
    })
  },

  set(state, patch) {
    this.status = { ...this.status, ...patch, state }
    this.push()
  },

  /**
   * 环境探测(T1/T7):优先真实页面(view),其次演示表单(mainWin)。
   * 'error' 与 null 的区别供上层决定是否重试——大 SPA 在渲染/懒加载瞬间会拒绝脚本执行。
   * @returns {Promise<DetectHit | null | 'error'>} 命中 {target,kind,label};确定无表单 null;页面暂不可测 'error'
   */
  async detect() {
    // 浏览视图的状态必须独立记录:它曾与分支trace混在一起,
    // 而主窗口分支会覆盖 trace,导致「视图压根没创建」和「视图没激活」在日志里长得一样
    // —— 用户报「检测不到腾讯网申页」时,正是这个盲点让第一轮排查走偏。
    envViewState = browseView === null ? 'no-view' : (browseVisible ? 'view-on' : 'view-off')
    if (browseView !== null && browseVisible && !browseView.webContents.isDestroyed()) {
      const url = browseView.webContents.getURL()
      const adapter = matchAdapter(url)
      if (adapter === null) {
        envTrace = `view:no-adapter url=${url.slice(0, 80)}`
      } else {
        let results = []
        try {
          results = await executeOnFrames(browseView.webContents, adapter.probe)
        } catch {
          envTrace = 'view:threw'
          return 'error'
        }
        if (results.some(result => result === true)) {
          envTrace = 'view:hit'
          return { target: browseView.webContents, kind: 'generic', label: adapter.name }
        }
        if (results.length === 0) {
          envTrace = 'view:no-frames'
          return 'error'
        }
        if (results.some(result => result !== null)) {
          envTrace = 'view:probe-false'
          return null
        }
        envTrace = `view:all-null ${JSON.stringify(results).slice(0, 200)}`
        return 'error'
      }
    }
    if (mainWin !== null && !mainWin.webContents.isDestroyed()) {
      const url = mainWin.webContents.getURL()
      if (url.includes('#/apply')) {
        let results = []
        try {
          results = await executeOnFrames(mainWin.webContents, DEMO_PROBE)
        } catch {
          envTrace = 'main:threw'
          return 'error'
        }
        if (results.some(result => result === true)) {
          envTrace = 'main:demo-hit'
          return { target: mainWin.webContents, kind: 'demo', label: '演示公司' }
        }
        if (results.length === 0) {
          envTrace = 'main:no-frames'
          return 'error'
        }
        if (results.some(result => result !== null)) {
          envTrace = 'main:probe-false'
          return null
        }
        envTrace = 'main:all-null'
        return 'error'
      }
      envTrace = 'main:not-apply'
    } else {
      envTrace = 'none'
    }
    return null
  },

  /** 上一次成功检测的结果;页面离开或检测失败时清空(结论不再可信) */
  /** @type {DetectHit|null} */
  detected: null,

  /**
   * 「开始检测」:探测当前页面是否为网申表单页。
   *
   * **只由用户点击触发,不做后台轮询** —— 球不探测用户没要求的页面:
   * 既避免持续向第三方站点注入脚本(反自动化与性能考虑),也让「检测」保持为一个显式动作。
   * 结果只有两种:命中 → ready(已检测到);未命中 → idle(未检测到)。
   *
   * SPA 常见「点击那一刻表单还在渲染」,故未命中时最多重试 2 次(合计约 1.2s);
   * 而不是像被移除的 800ms 轮询那样长期驻留。
   */
  async detectNow() {
    if (this.busy) return
    if (this.status.state !== 'idle' && this.status.state !== 'ready') return
    this.busy = true
    this.set('detecting', { filledCount: 0, activeFieldLabel: '' })
    /** @type {DetectHit|null} */
    let hit = null
    for (let attempt = 0; attempt < 3; attempt++) {
      /** @type {DetectHit|null|'error'} */
      let result = null
      try {
        result = await this.detect()
      } catch (err) {
        logLine('detect-threw', err)
        result = 'error'
      }
      logLine('detect', `#${attempt + 1} [${envViewState}] ${envTrace} -> ${result === 'error' ? 'error' : result === null ? 'null' : 'hit'}`)
      if (result !== null && result !== 'error') {
        hit = result
        break
      }
      if (attempt < 2) await new Promise(r => setTimeout(r, 600))
    }
    if (hit !== null) {
      this.detected = hit
      this.siteLabel = hit.label
      this.set('ready', { filledCount: 0, activeFieldLabel: '', totalFields: hit.kind === 'demo' ? 13 : this.status.totalFields })
    } else {
      this.detected = null
      this.set('idle', { filledCount: 0, activeFieldLabel: '' })
    }
    this.busy = false
  },

  /** 回到「未检测到」:页面已离开/目标消失时调用,上次的检测结论不再可信 */
  resetToIdle() {
    this.detected = null
    if (this.status.state !== 'idle') this.set('idle', { filledCount: 0, activeFieldLabel: '' })
  },

  async start() {
    const hit = this.detected
    if (this.status.state !== 'ready' || hit === null) {
      // 落盘「为什么没开始填」:此前这条早退路径完全静默,
      // 表现为「点了开始填写却什么都没发生」,无从判断是没点到还是状态不对
      logLine('fill-skip', `state=${this.status.state} detected=${hit === null ? 'null' : 'ok'}`)
      return
    }
    this.busy = true
    // 「开始填写」直接沿用刚刚「开始检测」得到的结论:
    // 探测已是显式动作,不再重复一次 2.4s 的静默复检。
    this.set('filling', { filledCount: 0, activeFieldLabel: '', totalFields: hit.kind === 'demo' ? 13 : this.status.totalFields })
    this.fillTarget = hit.target
    this.fillKind = hit.kind
    this.fillToken = {}
    try {
      logLine('fill-start', `kind=${hit.kind} targetDestroyed=${typeof hit.target.isDestroyed === 'function' ? hit.target.isDestroyed() : 'n/a'}`)
      const resume = currentResume()
      const profile = resume !== undefined ? resume.profile : {}
      const custom = resume !== undefined && resume.custom !== undefined ? resume.custom : {}
      // 可重复记录必须一起传给注入脚本:此前只传 profile/custom,多段教育只填第 1 条、
      // 实习经历则完全填不了(引擎里根本没有读取它们的代码)。
      const educations = resume !== undefined && Array.isArray(resume.educations) ? resume.educations : []
      const experiences = resume !== undefined && Array.isArray(resume.experiences) ? resume.experiences : []
      const projects = resume !== undefined && Array.isArray(resume.projects) ? resume.projects : []
      const awards = resume !== undefined && Array.isArray(resume.awards) ? resume.awards : []
      logLine('fill-records', `educations=${educations.length} experiences=${experiences.length} projects=${projects.length} awards=${awards.length} kind=${hit.kind}`)
      const script =
        hit.kind === 'demo'
          ? fillScript.demoFillScript(profile)
          : fillScript.genericFillScript(profile, { mappings: loadMappings(), custom, educations, experiences, projects, awards })
      const results = await executeOnFrames(hit.target, script)
      logLine('fill-raw', JSON.stringify(results).slice(0, 500))
      // 多 frame 各自执行:取实际填写数最多的结果,避免空 frame 的 0 填写结果掩盖真实表单
      const result =
        results
          .filter(item => item != null && typeof item === 'object')
          .sort((a, b) => (typeof b.filled === 'number' ? b.filled : 0) - (typeof a.filled === 'number' ? a.filled : 0))[0] ?? null
      if (this.fillToken === null) {
        logLine('fill-aborted', 'fillToken 已被导航置空(T7 打断),丢弃本次填写结果')
        return
      }
      const total = result && typeof result.total === 'number' ? result.total : this.status.totalFields
      const filled = result && typeof result.filled === 'number' ? result.filled : 0
      // 一个字段都没实际填上:保持完成态如实显示 0/N 与全部缺项(不用「未检测到表单」误导),
      // 报告说明可能原因,引导用户补充资料/手动填写/反馈字段名
      // 两个缺项口径必须分开写:此前只打了 missingPageFields 的数量,
      // 出现 filled=28/30 missing=1 这种「28 填了 30 却说缺 1 个」的自相矛盾日志
      // (missingData=匹配到简历字段但值为空,missingPageFields=页面有标签但没匹配到简历字段)。
      const missingDataCount = result && Array.isArray(result.missingData) ? result.missingData.length : 0
      const missingFieldCount = result && Array.isArray(result.missingPageFields) ? result.missingPageFields.length : 0
      logLine('fill-done', `filled=${filled}/${total} missingData=${missingDataCount} missingPageFields=${missingFieldCount}`)
      // 导出报告用:状态机只留存 missingPageFields,这里把这次填写的完整口径记下来
      this.lastResult = {
        filled: filled,
        total: total,
        missingData: result && Array.isArray(result.missingData) ? result.missingData : [],
        missingPageFields: result && Array.isArray(result.missingPageFields) ? result.missingPageFields : [],
        // 未匹配控件的结构:报告里单列一节,反馈时不必再靠猜页面长什么样
        unmatched: result && Array.isArray(result.unmatched) ? result.unmatched : [],
        // 「添加」按钮诊断:记录数 / 识别到的行数 / 需新增数 / 找到的按钮
        addDiag: result && Array.isArray(result.addDiag) ? result.addDiag : [],
        // 自绘下拉失败诊断:0 个候选 = 没点开;>0 = 点开了但没匹配上
        customFail: result && Array.isArray(result.customFail) ? result.customFail : [],
        // 匹配到但没填上的控件结构:安永的 学校/专业/学历 卡在这一类
        fillFail: result && Array.isArray(result.fillFail) ? result.fillFail : [],
      }
      const nothingFilled = filled === 0
      this.set('done', { filledCount: filled, activeFieldLabel: '', totalFields: total })
      if (nothingFilled) {
        sendToMain('cf:fill-report', {
          resumeName: resume !== undefined ? resume.name : '',
          filled: 0,
          total,
          missingData: result !== null && Array.isArray(result.missingData) ? result.missingData : [],
          missingPageFields:
            result !== null && Array.isArray(result.missingPageFields) && result.missingPageFields.length > 0
              ? result.missingPageFields
              : ['页面字段与简历信息未能对上:请先补全简历对应字段,或在下方手动关联;仍不行请把字段名反馈给开发者'],
        })
        this.busy = false
        return
      }
      const missingPage =
        result && Array.isArray(result.missingPageFields) ? result.missingPageFields.slice(0, 8) : []
      this.set('done', { filledCount: filled, activeFieldLabel: '', totalFields: total, missingPageFields: missingPage })
      // 填写报告发主窗口:页面字段、缺项、可关联提示(手动关联 UI 依据)
      sendToMain('cf:fill-report', {
        resumeName: resume !== undefined ? resume.name : '',
        filled,
        total,
        missingData: result !== null && Array.isArray(result.missingData) ? result.missingData : [],
        missingPageFields: result !== null && Array.isArray(result.missingPageFields) ? result.missingPageFields : [],
      })
      if (missingPage.length > 0) {
        console.log(`[autofill] 页面未匹配项: ${missingPage.join('、')}(可手动补充或在填写报告中关联)`)
      }
    } catch (err) {
      // 曾经只走 console.error:这条路径的失败在 main.log 里完全不可见,
      // 表现为「点了开始填写、然后什么都没发生」
      if (this.fillToken === null) {
        logLine('fill-aborted', 'fillToken 已被导航置空,本次填写放弃')
        return
      }
      logLine('fill-error', err)
      this.detected = null
      this.set('idle', { filledCount: 0, activeFieldLabel: '' })
    } finally {
      this.busy = false
    }
  },

  /** 目标页导航即中止填写:已填字段保留在页面中;检测结论随之作废(回到未检测到) */
  abortFilling() {
    if (this.status.state === 'filling' || this.status.state === 'detecting') {
      this.fillToken = null
      this.busy = false
      this.detected = null
      this.set('idle', { filledCount: 0, activeFieldLabel: '' })
    }
  },

  async reset() {
    if (this.status.state !== 'done') return
    const target = this.fillTarget
    const kind = this.fillKind
    if (target !== undefined && !target.isDestroyed()) {
      try {
        await executeOnFrames(target, kind === 'demo' ? fillScript.demoResetScript() : fillScript.genericResetScript())
      } catch {
        /* ignore */
      }
    }
    this.set('ready', { filledCount: 0, activeFieldLabel: '' })
  },
}

// 注意:这里**没有**环境探测定时器。探测只在用户点「开始检测」时执行(detectNow),
// 球的职责是判断用户已经打开的页面,而不是在后台反复探测用户没要求的页面。

// ── IPC ──────────────────────────────────────────────

ipcMain.handle('cf:get-resumes', () => ({
  resumes: resumeStore.resumes,
  currentId: resumeStore.currentId,
}))

ipcMain.on('cf:select-resume', (_e, id) => {
  if (!resumeStore.resumes.some(r => r.id === id)) return
  resumeStore.currentId = id
  saveResumeStore(resumeStore)
  sendToMain('cf:resumes-changed', { resumes: resumeStore.resumes, currentId: resumeStore.currentId })
  autofill.push()
})

/** 新增或更新简历:有 id 且存在 → 更新(刷新 updatedAt);无 id/未命中 → 追加并切换为当前 */
ipcMain.on('cf:save-resume', (_e, resume) => {
  if (resume == null || typeof resume !== 'object' || resume.profile == null || typeof resume.profile !== 'object') return
  const name = typeof resume.name === 'string' ? resume.name.trim() : ''
  if (name === '') return
  // custom 必须一并持久化:早期版本漏了这个字段,导致用户在编辑器里保存一次简历,
  // 所有自定义字段就被静默删除(连带「填写报告」里指向自定义字段的手动关联一起失效)。
  const custom =
    resume.custom !== null && typeof resume.custom === 'object' && !Array.isArray(resume.custom)
      ? resume.custom
      : {}
  // 可重复记录(教育背景/实习经历)同理必须持久化;非数组或混入非对象元素时归一,
  // 避免脏数据写进 resumes.json 后在渲染端引发崩溃。
  const plainObjects = value =>
    Array.isArray(value) ? value.filter(item => item !== null && typeof item === 'object' && !Array.isArray(item)) : []
  const record = {
    id: typeof resume.id === 'string' && resumeStore.resumes.some(r => r.id === resume.id) ? resume.id : `resume-${Date.now().toString(36)}`,
    name,
    updatedAt: new Date().toISOString(),
    profile: resume.profile,
    custom,
    educations: plainObjects(resume.educations),
    experiences: plainObjects(resume.experiences),
    projects: plainObjects(resume.projects),
    awards: plainObjects(resume.awards),
  }
  const index = resumeStore.resumes.findIndex(r => r.id === record.id)
  if (index >= 0) {
    resumeStore.resumes[index] = record
  } else {
    resumeStore.resumes.push(record)
    resumeStore.currentId = record.id
  }
  saveResumeStore(resumeStore)
  sendToMain('cf:resumes-changed', { resumes: resumeStore.resumes, currentId: resumeStore.currentId })
  autofill.push()
})

/** 删除简历:至少保留一份;删除当前简历时自动切到剩余第一份 */
ipcMain.on('cf:delete-resume', (_e, id) => {
  if (typeof id !== 'string' || resumeStore.resumes.length <= 1) return
  const index = resumeStore.resumes.findIndex(r => r != null && r.id === id)
  if (index < 0) return
  resumeStore.resumes.splice(index, 1)
  if (resumeStore.currentId === id) {
    const first = resumeStore.resumes[0]
    resumeStore.currentId = first !== undefined ? first.id : ''
  }
  saveResumeStore(resumeStore)
  sendToMain('cf:resumes-changed', { resumes: resumeStore.resumes, currentId: resumeStore.currentId })
  autofill.push()
})

/** 手动关联:把页面字段 label 绑定到简历字段(内置或自定义),下次填写优先使用 */
ipcMain.on('cf:set-mapping', (_e, payload) => {
  if (payload == null || typeof payload.label !== 'string' || typeof payload.target !== 'string') return
  const key = normalizeLabel(payload.label)
  if (key === '') return
  const mappings = loadMappings()
  if (payload.target === '') {
    delete mappings[key]
  } else {
    mappings[key] = payload.target
  }
  saveMappings(mappings)
})

ipcMain.on('cf:nav', (_e, action) => {
  if (action === null || typeof action !== 'object' || typeof action.type !== 'string') return
  ensureBrowseView()
  const wc = browseView.webContents
  if (action.type === 'url' && typeof action.url === 'string' && action.url.length < 2048) {
    let url = action.url.trim()
    if (url === '') return
    if (!/^[a-z]+:\/\//i.test(url)) url = `https://${url}`
    // 在地址栏输入地址即视为浏览意图:必须先激活 browse 标签,否则视图 bounds 仍是 0×0,
    // 用户会看到「地址栏有地址、页面却纹丝不动」——E2E 里表现为面板恒停在待机
    if (!browseVisible) {
      browseVisible = true
      layoutBrowseView()
      sendToMain('cf:shell-tab', { tab: 'browse' })
    }
    logLine('nav-url', url.slice(0, 200))
    void wc.loadURL(url).catch(err => logLine('load-url-failed', err))
  } else if (action.type === 'back' && wc.navigationHistory.canGoBack()) {
    wc.navigationHistory.goBack()
  } else if (action.type === 'forward' && wc.navigationHistory.canGoForward()) {
    wc.navigationHistory.goForward()
  } else if (action.type === 'reload') {
    wc.reload()
  } else if (action.type === 'stop') {
    wc.stop()
  }
})

ipcMain.on('cf:shell', (_e, payload) => {
  if (payload === null || typeof payload !== 'object' || typeof payload.type !== 'string') return
  if (payload.type === 'tab') {
    browseVisible = payload.tab === 'browse'
    // 标签切换落盘:browseVisible 决定内嵌视图是 340×400 还是 0×0,
    // 而「标签到底有没有点中」曾是整条 browse 链路排查的盲区,必须可观测
    logLine('shell-tab', `${payload.tab} browseVisible=${browseVisible}`)
    if (browseVisible) ensureBrowseView()
    layoutBrowseView()
    if (!browseVisible) autofill.abortFilling()
  }
})

ipcMain.on('cf:report-visibility', (_e, payload) => {
  reportVisible = payload !== null && typeof payload === 'object' && payload.visible === true
  layoutBrowseView()
})

ipcMain.on('cf:cmd-from-ball', (_e, cmd) => {
  if (cmd === null || typeof cmd !== 'object' || typeof cmd.type !== 'string') return
  // 悬浮球触发的每个动作落盘:用户报「点了没反应」时先看 main.log 有没有这条
  logLine('ball-cmd', cmd.type)
  if (cmd.type === 'detect') {
    // 只判定当前页面,不导航任何窗口 —— 球不负责把用户带去某个页面
    void autofill.detectNow()
  } else if (cmd.type === 'start') {
    void autofill.start()
  } else if (cmd.type === 'reset') {
    void autofill.reset()
  } else if (cmd.type === 'request-state') {
    autofill.push()
  }
})

// 拖拽起手:记录「光标相对**球心**」的偏移(而不是相对窗口原点)。
// 用球心做基准的原因:面板在上/在下会改变球心在窗口内的位置,中途翻转方向时
// 若仍以窗口原点为基准,球会跳位;以球心为基准则整个拖拽过程中球严格跟手。
ipcMain.on('cf:ball-drag-start', (_e, cursorX, cursorY) => {
  if (ballWin === null) return
  if (!Number.isFinite(cursorX) || !Number.isFinite(cursorY)) return
  const center = currentBallCenter()
  if (center === null) return
  ballDragAnchor = {
    grabFromCenter: [cursorX - center.x, cursorY - center.y],
    cursorX,
    cursorY,
  }
  logLine('ball-drag', `start cursor=${Math.round(cursorX)},${Math.round(cursorY)} center=${Math.round(center.x)},${Math.round(center.y)}`)
})

ipcMain.on('cf:ball-drag-move', (_e, cursorX, cursorY) => {
  if (ballWin === null) return
  if (!Number.isFinite(cursorX) || !Number.isFinite(cursorY)) return
  // 落单的 move(丢过 drag-start):按「当前光标 − 球心仍在原处」的等价关系补一个锚点
  if (ballDragAnchor === null) {
    const center = currentBallCenter()
    if (center === null) return
    ballDragAnchor = { grabFromCenter: [cursorX - center.x, cursorY - center.y], cursorX, cursorY }
    return
  }
  ballDragAnchor.cursorX = cursorX
  ballDragAnchor.cursorY = cursorY
  const wa = screen.getDisplayMatching(ballWin.getBounds()).workArea
  // 钳制**球心**:球可贴到工作区任意一边,窗口允许伸出屏幕外
  const center = clampBallCenter(
    { x: cursorX - ballDragAnchor.grabFromCenter[0], y: cursorY - ballDragAnchor.grabFromCenter[1] },
    wa,
  )
  applyBallGeometry(center, wa, ballExpanded)
})

// 松手:清掉拖拽会话,后续 move(若还有)不再移动窗口
// 落盘最后收到的光标:拖拽「停在半路」时据此判断是坐标没送到,还是另有原因
ipcMain.on('cf:ball-drag-end', () => {
  if (ballDragAnchor !== null) {
    logLine('ball-drag', `end lastCursor=${Math.round(ballDragAnchor.cursorX)},${Math.round(ballDragAnchor.cursorY)}`)
  }
  ballDragAnchor = null
})

// 面板开合切换窗口尺寸:**球心原地不动**。
// 旧实现把 400 高的窗口整体夹进工作区,球贴窗口底边 → 球靠近顶部时一开面板就被
// 强制下移(实测最多 312 DIP),表现为「长按不动它自己就走了」。
// 改为:窗口原点由球心反推,不夹窗口;上方放不下时把面板翻到球下方。
ipcMain.on('cf:ball-mode', (_e, expand) => {
  if (ballWin === null) return
  const center = currentBallCenter()
  if (center === null) return
  const want = expand === true
  if (want === ballExpanded) return
  const wa = screen.getDisplayMatching(ballWin.getBounds()).workArea
  ballExpanded = want
  const safeCenter = clampBallCenter(center, wa)
  logLine('ball-mode', `${want ? 'expand' : 'collapse'} center=${Math.round(safeCenter.x)},${Math.round(safeCenter.y)}`)
  applyBallGeometry(safeCenter, wa, want)
})

// 悬浮球渲染端诊断日志:面板开合/点击问题定位的地面真相
ipcMain.on('cf:ball-log', (_e, msg) => {
  logLine('ball', typeof msg === 'string' ? msg.slice(0, 300) : 'non-string')
})

// ── 导出填写报告 ──────────────────────────────────────
/**
 * 把**最近一次填写**导成 Markdown。内容全部取自主进程自己的状态
 * (状态机 + 内嵌页 URL + 简历库 + 手动关联),不依赖渲染端传参 ——
 * 导出的一定是「真实发生过的那一次」,而不是界面上的二手数据。
 *
 * 三个小节对应三种可行动的信息:
 *   一、页面有、简历里没有的字段 → 照着补简历(本轮新增字段就是这么来的)
 *   二、匹配到但没填上          → 值为空,或控件选项对不上
 *   三、已记住的手动关联        → 确认自动关联没跑偏
 * opts.toPath 仅供自动化测试直接落盘;正常路径弹保存对话框。
 */
ipcMain.handle('cf:export-report', async (_e, opts) => {
  if (autofill.status.state !== 'done') return { ok: false, reason: 'no-report' }
  const resume = currentResume()
  const result =
    autofill.lastResult !== null
      ? autofill.lastResult
      : { filled: autofill.status.filledCount, total: autofill.status.totalFields, missingData: [], missingPageFields: [] }
  const url = browseView !== null && !browseView.webContents.isDestroyed() ? browseView.webContents.getURL() : ''
  const mappings = loadMappings()
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  const section = (title, items, numbered) => [
    `## ${title}`,
    '',
    ...(items.length === 0 ? ['(无)'] : items.map((text, i) => (numbered ? `${i + 1}. ${text}` : `- ${text}`))),
    '',
  ]
  const content = [
    '# 校招快填 · 填写报告',
    '',
    `- 时间:${now.toLocaleString('zh-CN')}`,
    `- 简历:${resume !== undefined ? resume.name : '(无简历)'}`,
    `- 站点:${autofill.siteLabel !== '' ? autofill.siteLabel : '(未识别)'}`,
    `- 页面:${url !== '' ? url : '(未知)'}`,
    `- 结果:已自动填写 ${result.filled}/${result.total} 项`,
    '',
    ...section('一、页面有、简历里没有的字段(建议补进简历)', result.missingPageFields, true),
    ...section('二、匹配到简历字段但没能填上(值为空,或控件选项对不上)', result.missingData, false),
    ...section('三、已记住的手动关联', Object.entries(mappings).map(([k, v]) => `${k} → ${v}`), false),
    ...section(
      '四、未匹配控件的结构(反馈给开发者用)',
      (Array.isArray(result.unmatched) ? result.unmatched : []).map(
        u => `${u.label || '(无标签)'} — <${u.tag} type=${u.type}${u.ro === true ? ' readonly' : ''}> 占位「${u.ph || ''}」 区块=${u.blk || '未识别'}${u.ctx ? ' 外层文字「' + u.ctx + '」' : ''}${u.chain ? '\n  ' + u.chain : ''}`,
      ),
      false,
    ),
    ...section(
      '五、「添加」按钮诊断(多段经历未能自动生成时看这里)',
      (Array.isArray(result.addDiag) ? result.addDiag : []).map(
        d => `${d.kind}:简历 ${d.records} 条 / 识别到现有 ${d.rows} 行 / 需新增 ${d.need} 行 → 按钮 ${d.btn || '(未找到)'}`,
      ),
      false,
    ),
    ...section(
      '六、自绘下拉填写失败的现场(0 个候选 = 没点开;大于 0 = 点开了但值对不上)',
      (Array.isArray(result.customFail) ? result.customFail : []).map(
        c => `${c.key}:触发器「${c.probe || '(空)'}」${c.ro === true ? ' readonly' : ''} → 可见候选 ${c.opts} 个;我们的值「${c.val || ''}」;候选原文:${c.sample || '(读不到)'}`,
      ),
      false,
    ),
    ...section(
      '七、匹配到但没填上的控件结构(回读验证失败 = 赋值被页面忽略)',
      (Array.isArray(result.fillFail) ? result.fillFail : []).map(
        f => `${f.key}:<${f.tag} type=${f.type}${f.ro === true ? " readonly" : ""}> 占位「${f.ph || ""}」${f.cs === true ? " 走自绘下拉" : " 走直接赋值"} 值「${f.val || ""}」`,
      ),
      false,
    ),
  ].join('\n')
  try {
    let target = opts !== null && typeof opts === 'object' && typeof opts.toPath === 'string' ? opts.toPath : ''
    const wantFile = opts !== null && typeof opts === 'object' && opts.mode === 'file'
    if (target === '' && wantFile) {
      // 「导出报告」:让用户自己挑位置(保留原有行为,与「导出到 DSH」并存)
      const dialogOpts = {
        title: '导出填写报告',
        defaultPath: path.join(app.getPath('desktop'), `校招快填-填写报告-${stamp}.md`),
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: '文本文件', extensions: ['txt'] },
        ],
      }
      const picked = mainWin !== null ? await dialog.showSaveDialog(mainWin, dialogOpts) : await dialog.showSaveDialog(dialogOpts)
      if (picked.canceled || typeof picked.filePath !== 'string' || picked.filePath === '') return { ok: false, reason: 'canceled' }
      target = picked.filePath
    }
    if (target === '') {
      // 「导出到 DSH」:不再弹保存对话框,直接写进**固定收件箱**,并把一句提示语放进剪贴板。
      // 为什么这样设计:DSH 的本地端口需要认证(实测 /api/* 全部 401),
      // 应用无法把消息直接注入对话,所以「自动反馈」能做到的极限是
      // 「报告落到 AI 能直接读的固定路径 + 用户一步 Ctrl+V 即可发出」。
      // 收件箱路径可由 %APPDATA%\校招快填\dsh-inbox.txt 覆盖(一行,文件夹路径)。
      let inbox = ''
      try {
        const cfg = path.join(app.getPath('userData'), 'dsh-inbox.txt')
        if (fs.existsSync(cfg)) inbox = String(fs.readFileSync(cfg, 'utf8')).trim().split(/\r?\n/)[0].trim()
      } catch {
        inbox = ''
      }
      if (inbox === '') inbox = DSH_INBOX_DEFAULT
      try {
        fs.mkdirSync(inbox, { recursive: true })
      } catch {
        /* 建不出来就退回桌面,至少不丢报告 */
        inbox = app.getPath('desktop')
      }
      target = path.join(inbox, `填写报告-${stamp}.md`)
    }
    fs.writeFileSync(target, content, 'utf8')
    // 把「请分析这份报告」的提示语放进剪贴板:用户切到 DSH 直接 Ctrl+V 回车即可,
    // 不必手打路径。这是应用侧能做到的最短链路(DSH 本地端口需认证,无法直接注入消息)。
    let copied = false
    try {
      if (wantFile) throw new Error('file-mode') // 另存为模式不写剪贴板
      clipboard.writeText(`请读「${target}」这份填写报告,分析并改进校招快填(修 bug 或补字段)。`)
      copied = true
    } catch {
      copied = false
    }
    logLine('export-report', `ok path=${target} bytes=${content.length} clipboard=${copied}`)
    return { ok: true, path: target, copied }
  } catch (err) {
    logLine('export-report-failed', err)
    return { ok: false, reason: 'write-failed' }
  }
})

// 填写进度:仅接受来自当前填写目标的桥接消息
ipcMain.on('cf:fill-progress', (event, stepJson) => {
  const target = autofill.fillTarget
  if (target === undefined || event.sender !== target || autofill.status.state !== 'filling') return
  try {
    const step = JSON.parse(stepJson)
    autofill.set('filling', {
      filledCount: typeof step.index === 'number' ? step.index : autofill.status.filledCount,
      activeFieldLabel: typeof step.label === 'string' ? step.label : '',
      totalFields: typeof step.total === 'number' ? step.total : autofill.status.totalFields,
    })
  } catch {
    /* 非法进度包忽略 */
  }
})

/**
 * 主窗口「外框 vs 内容区」差值(标题栏高度)落盘。
 * UI 自动化脚本据此自校准点击 Y 坐标:GetWindowRect 拿到的是外框左上角,
 * 而 React 工具栏在标题栏下方——曾因硬编码 24 DIP 把点击打在标题栏上,
 * 导致「网申浏览」标签永远点不中、面板恒停在待机。
 */
function logWindowMetrics() {
  if (mainWin === null) return
  try {
    const b = mainWin.getBounds()
    const c = mainWin.getContentBounds()
    logLine(
      'mainwin-metrics',
      `bounds=${b.x},${b.y},${b.width},${b.height} content=${c.x},${c.y},${c.width},${c.height}` +
        ` frameH=${c.y - b.y} frameW=${c.x - b.x} scale=${screen.getPrimaryDisplay().scaleFactor}`,
    )
  } catch (err) {
    logLine('mainwin-metrics-failed', err)
  }
}

app.on('before-quit', flushBrowseSession)

app.whenReady().then(() => {
  logLine('startup', `userData=${app.getPath('userData')} version=${app.getVersion()}`)
  resumeStore = loadResumeStore()
  createMainWindow()
  createBallWindow()
  logWindowMetrics()
  // 主窗口 hash 变化(演示页路由)既影响填写目标,也应让上次的检测结论作废
  mainWin.webContents.on('did-navigate-in-page', () => {
    logLine('main-route', String(mainWin.webContents.getURL()).slice(-40))
    if (autofill.fillTarget === mainWin.webContents) autofill.abortFilling()
    autofill.resetToIdle()
  })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
      createBallWindow()
    }
  })
})

// 主进程日志落盘(userData/main.log):异常与关键事件留档,便于远程诊断
function logLine(level, ...args) {
  try {
    const parts = args.map(a => (a instanceof Error ? `${a.message}
${a.stack ?? ''}` : typeof a === 'object' ? JSON.stringify(a) : String(a)))
    const line = `[${new Date().toISOString()}] [${level}] ${parts.join(' ')}
`
    const file = path.join(app.getPath('userData'), 'main.log')
    fs.appendFileSync(file, line, 'utf8')
    // 防日志无限增长:超过 1MB 保留后半
    try {
      if (fs.statSync(file).size > 1024 * 1024) {
        const tail = fs.readFileSync(file, 'utf8').slice(-512 * 1024)
        fs.writeFileSync(file, tail, 'utf8')
      }
    } catch { /* 截断失败忽略 */ }
  } catch { /* 日志失败不影响主流程 */ }
}

// 同步与异步异常双通道兜底:全部记入 main.log,绝不再以系统弹窗打断用户
process.on('uncaughtException', err => logLine('uncaughtException', err))
process.on('unhandledRejection', reason => logLine('unhandledRejection', reason))

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
