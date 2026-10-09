# 校招快填 交接文档（2026-10-03）

> 背景：用户反馈「点击悬浮球后报错，好几次了为什么修不好，认真对待」。本次会话完成三个根因修复 + 全新诊断基建，demo 路径已双轮全绿；**仅剩 browse-e2e（内嵌浏览器真实站点路径）的一个 detect 问题未解**，之后打包部署即可交付。
> 所有改动均在工作区（未打包、未部署、未 git commit）。

## 一、本次已完成的修复（代码已改完并验证）

### 1. 悬浮球点击不可靠 → 整个穿透机制已删除（架构级修复）
- **根因**：`setIgnoreMouseEvents(true, {forward:true})` 的 mousemove 转发在本机 Electron 44 上随机失效。日志铁证：renderer 只收到一次 `hit=0`，三步逼近球体的移动全部未送达（`[ball] hit=0 at 200,308 open=0` 之后空无一物）；同二进制 07:40 成功、07:41/07:42 失败，纯概率性。高频 `cf:ball-ignore` IPC 风暴也是用户打包版崩溃弹窗的头号嫌疑源。
- **方案**：窗口尺寸切换。收起=88×88 只包球体（原生接收点击、不挡屏幕、绝不穿透）；展开=340×400 容纳面板（面板按钮原生可点）。球心屏幕位置保持不变（expand 日志验证 bounds=1180,400,340,400 DIP，球仍在 1845,945 物理）。
- **改动**：main.cjs（`BALL_COLLAPSED_W/H`、`BALL_ANCHOR=44`、`cf:ball-mode` handler、`currentBallCenter()`、ball-move 按模式钳制；**删除** `cf:ball-ignore` handler 与初始 setIgnoreMouseEvents）；preload.cjs（`setBallMode` 替代 `setIgnoreMouseEvents`，新增 `ballLog`）；src/types/electron-api.d.ts 同步；BallApp.tsx（删除命中检测/mouseleave/onMove 整段，新增 `api.setBallMode(open)` effect + 开合日志）。

### 2. 填写引擎静默全灭 → iife 打包器双层序列化（最关键修复）
- **根因**：fillScript.cjs 的 `iife()` 用单层 `JSON.stringify(a)` 把参数内联成对象字面量 `{…}`，而注入函数契约是 `JSON.parse(profileJson)` → 必抛 `"[object Object]" is not valid JSON` → 被 `catch(()=>null)` 吞掉 → **demo 和真实站点通用引擎全部 0 填写**（`[fill-raw] [null]`）。历史上「假填写成功」现象同源。
- **修复**：`iife` 改双层 `JSON.stringify(JSON.stringify(a))`（一行修复，两个引擎同时救活）。
- **验证**：`scripts/test-fill.cjs` 输出 `{"ok":true,"filled":13,"total":13}`（WebFrameMain 与 webContents 双通道均过）。

### 3. dist 拼盘事故（已重建）
- 15:19 一次被中断的构建留下「新 ball.html/css + 旧 ball js」的混合产物，导致球窗口渲染坏包（面板打不开的假象）。已 `rm -rf dist && npm run build` 干净重建。**教训：跑 package/build 中断后必须检查 dist 产物时间戳一致性。**

### 4. 测试脚本修正 + 日志断言
- desktop-ball-smoke.ps1 / browse-e2e.ps1：按钮 Y 坐标旧公式 209 DIP 偏高 87px（点在面板页眉上）→ 改 **122 DIP**（= 球顶上 12 + 球 64 + 间隙 12 即面板底 88 + body 底 padding 16 + 按钮半高 18）；新增 `HoverClick`（三步逼近模拟真实轨迹）；新增 `Assert-Log`（读 `.dev-data/main.log` 断言 goto-apply / fill-done，不再靠截图猜）；尾部自动 dump 日志 10-12 行。
- 新增独立复现脚本：`scripts/test-fill.cjs`（demo 填写）、`scripts/test-browse-detect.cjs`（隔离跑 WebContentsView + matchAdapter + GENERIC_PROBE，**结论：隔离环境全部正常**）。

### 5. 诊断基建（上个会话写的，本次一起验证可用）
main.log 落盘（userData/main.log，1MB 截断）：`startup / ball-cmd / ball / ball-mode / fill-raw / fill-done / load-url-failed / uncaughtException / unhandledRejection`；`cf:ball-log` 渲染端日志通道；ball-move/setPosition 的 NaN 防御；双通道异常兜底。**用户正式环境日志位置：`C:\Users\asus\AppData\Roaming\校招快填\main.log`，以后报障先看日志。**

## 二、当前验证状态
- desktop-ball-smoke.ps1 **连续两轮全绿**：`LOG-PASS goto-apply` + `LOG-PASS fill-done`，`filled=13/13 missing=0`（含点卡片回归、球点击、面板展开、demo 填写、拖动）。
- test-fill.cjs：13/13 ✓。test-browse-detect.cjs：adapter=通用表单 ✓、probe-main=true ✓、frames=1 ✓。

## 三、browse 模式 detect 不就绪 —— 已定位并修复（2026-10-03 后续会话）

- **原现象**：browse-e2e 中 fixture 加载成功，但面板停在待机；点按钮触发的是 `goto-apply`（待机按钮）。
- **真实根因（不在应用里，在 E2E 脚本里）**：`browse-e2e.ps1` 的标签点击 Y 用 `$rect.Top + 24 DIP`，
  但 `GetWindowRect` 返回的是**窗口外框**，React 工具栏在标题栏（本机 30 DIP）下方 →
  点击落在标题栏上 → 「网申浏览」标签从未激活 → `browseVisible=false` →
  `layoutBrowseView()` 把内嵌视图设为 0×0 → `detect()` 的 browse 分支被整体跳过 →
  落到主窗口分支（在 `#/resume`）→ 返回 null → 恒为待机。
  隔离脚本 `test-browse-detect.cjs` 之所以全绿：它根本不依赖 `browseVisible`。
  （b2 截图「显示 fixture」是误判：地址栏只是 `cf:browser` 的 pushState 回显，不代表视图可见。）
- **修复**：
  1. 产品缺陷：`cf:nav` 收到 URL 时激活 browse 标签（此前地址栏输入地址后视图仍是 0×0，页面纹丝不动）；
  2. E2E：标签 Y 改为从主进程 `mainwin-metrics` 日志读取 `frameH` 自校准；地址栏改为点击聚焦 + 日志校验 + 重试；
  3. 可观测性：新增 `mainwin-metrics / shell-tab / nav-url / env(分支轨迹) / fill-skip / recheck / recheck-failed` 日志。
- **验证**：`LOG-PASS 标签点击命中` + `LOG-PASS 导航已送达` + `LOG-PASS env view:hit` + `LOG-PASS start/fill-done`。

### 3.1 顺带修掉的引擎缺陷：标签推断优先级

真跑 browse-e2e 暴露 `性别`/`婚姻状况`/`是否独生子女` 填不上、缺项报告出现「男」「女」「请选择(自绘下拉)」噪声。
根因：`labelFor` 把 `placeholder` 与选项内层 `<label>` 排在真正的字段标签之前，把它们遮蔽。
改为「按具体→宽泛排序候选数组，逐个尝试匹配，首个命中为准」，并把 `placeholder` 移到候选末尾。
`filled` 由 **17/18 提升到 20/21**，缺项由 6 条噪声降为 2 条真实未匹配项（`推荐人(选填)`、`个人特长`）。

### 3.2 环境备注（与本项目无关，供后续自动化参考）

- 本工作区若 `ELECTRON_RUN_AS_NODE=1`，Electron 会退化成纯 Node，GUI 起不来、`main.log` 不产生。
  跑 E2E 前需清掉该变量。
- 该环境里 Node 侧删除既有文件会被静默拒绝（`fs.rmSync` 报成功但不生效、`existsSync` 谎报 true），
  所以 `vite build --emptyOutDir` 清不掉 `dist/`；需要清 `dist` 时用 PowerShell 的 `Remove-Item -Recurse -Force`。
- `edit` 类工具会抹掉 `.ps1` 的 UTF-8 BOM，而 Windows PowerShell 5.1 按 ANSI 读无 BOM 文件会吞引号导致解析失败；
  改完 `.ps1` 必须确认 BOM 还在。

## 四、修完后的收尾（勿省略）
1. `powershell Stop-Process electron` → `npm run build`
2. 双回归全绿：desktop-ball-smoke.ps1 + browse-e2e.ps1
3. 打包（先杀进程）：`ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" npm run package`
4. 部署桌面「校招快填」文件夹：删旧目录 → 拷新产物（沿用既有流程）
5. `git add -A && git commit`（建议信息：`fix: 移除悬浮球点击穿透改窗口尺寸切换;iife双层序列化修复全引擎静默失败;smoke坐标/断言修正;browse detect待查`）
6. 向用户汇报三根因（穿透转发不可靠 / iife 单层序列化 / dist 拼盘）+ 崩溃双通道兜底 + 日志自助排查位置；坦承此前只堵了异步异常通道的历史盲区。

## 五、关键常量速查（UI 自动化/继续调试用）
- 物理像素 scale=1.25；球窗口收起 88×88（球心-44 DIP）、展开 340×400；球心=workArea 右下内缩 16+44 DIP=物理(1845,945)
- 面板按钮中心：距球窗口底 122 DIP、水平=面板右缘-150 DIP（物理约 (1697,848)）
- dev 数据隔离 `.dev-data`（process.defaultApp 时 userData 重定向）；正式数据 `C:\Users\asus\AppData\Roaming\校招快填\`
- 铁律：**只填不提交**；联网用本地 MCP（mcp__fetch__fetch / mcp__playwright__*），禁收费 web_reader
