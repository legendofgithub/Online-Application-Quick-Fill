# 校招快填桌面悬浮球 UI 自动化自测
# 路径:启动应用 → 截屏 → 点球开面板 → 进网申页 → 开始填写 → 拖动悬浮球 → 全程截屏留证
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class User32 {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
# DPI 感知后 WorkingArea 返回物理像素,SetCursorPos 也用物理像素,坐标系一致
[User32]::SetProcessDPIAware() | Out-Null

$SCREEN_W = [System.Windows.Forms.SystemInformation]::PrimaryMonitorSize.Width
$SCREEN_H = [System.Windows.Forms.SystemInformation]::PrimaryMonitorSize.Height
# 物理像素与 Electron DIP 的缩放比(由主显示器 DPI 推算)
$g = [System.Drawing.Graphics]::FromHwnd([IntPtr]::Zero)
$scale = $g.DpiX / 96.0
$g.Dispose()

$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
Write-Output "SCREEN ${SCREEN_W}x${SCREEN_H} scale=$scale workArea=$($wa.Width)x$($wa.Height)+$($wa.X)+$($wa.Y)"

# ── 布局常量(与 electron/main.cjs、ball.css 保持一致,单位 DIP)──
$BALL_WIN_W = 340; $BALL_WIN_H = 400; $BALL_EDGE = 16; $BALL_INSET = 12; $BALL_SIZE = 64
$winRightPhys  = ($wa.X + $wa.Width) - [int]($BALL_EDGE * $scale)
$winBottomPhys = ($wa.Y + $wa.Height) - [int]($BALL_EDGE * $scale)
# 球心 = 窗口右下角内缩 (12+32) DIP
$ballCx = $winRightPhys - [int](($BALL_INSET + $BALL_SIZE / 2) * $scale)
$ballCy = $winBottomPhys - [int](($BALL_INSET + $BALL_SIZE / 2) * $scale)
# 面板按钮真实位置(据 ball.css/floating-ball.css 推导,DIP):
#   面板底边 = 球顶上方 12 → 距窗口底 12+64+12 = 88
#   面板 body 底 padding 16 + 按钮高约36的一半 18 → 按钮中心距窗口底 ≈ 122
#   (旧值 209 会点在面板页眉文本上,点击被吞导致整条流程静默失败)
$panelRightPhys = $winRightPhys - [int]($BALL_INSET * $scale)
$btnCx = $panelRightPhys - [int](150 * $scale)
$btnCy = $winBottomPhys - [int](($BALL_INSET + $BALL_SIZE + 12 + 16 + 18) * $scale)
Write-Output "ballCenter=($ballCx,$ballCy) buttonEst=($btnCx,$btnCy)"

$outDir = "F:\AI\突发奇想的乱七八糟\简历投递工作流\qa-screens"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Shot($name) {
  $bmp = New-Object System.Drawing.Bitmap($SCREEN_W, $SCREEN_H)
  $g2 = [System.Drawing.Graphics]::FromImage($bmp)
  $g2.CopyFromScreen(0, 0, 0, 0, $bmp.Size)
  $g2.Dispose()
  $bmp.Save("$outDir\$name", [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "shot $name"
}
function Click($x, $y) {
  [User32]::SetCursorPos($x, $y) | Out-Null
  Start-Sleep -Milliseconds 250
  [User32]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)   # LEFTDOWN
  [User32]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)   # LEFTUP
  Start-Sleep -Milliseconds 250
}
# 悬浮球窗口依赖 mousemove 转发激活交互;单步瞬移偶尔来不及,分3步逼近模拟真实轨迹
function HoverClick($x, $y) {
  $mx1 = [Math]::Max(0, $x - 120); $my1 = [Math]::Max(0, $y - 60)
  $mx2 = [Math]::Max(0, $x - 36);  $my2 = [Math]::Max(0, $y - 18)
  [User32]::SetCursorPos($mx1, $my1) | Out-Null; Start-Sleep -Milliseconds 140
  [User32]::SetCursorPos($mx2, $my2) | Out-Null; Start-Sleep -Milliseconds 140
  [User32]::SetCursorPos($x, $y)    | Out-Null; Start-Sleep -Milliseconds 380
  [User32]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  [User32]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 250
}
function DragTo($x0, $y0, $dx, $dy) {
  [User32]::SetCursorPos($x0, $y0) | Out-Null
  Start-Sleep -Milliseconds 200
  [User32]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  for ($i = 1; $i -le 12; $i++) {
    Start-Sleep -Milliseconds 30
    [User32]::SetCursorPos(($x0 + [int]($dx * $i / 12)), ($y0 + [int]($dy * $i / 12))) | Out-Null
  }
  Start-Sleep -Milliseconds 150
  [User32]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 400
}

# ── 启动应用(dev 直跑 dist;dev 模式 userData 隔离到 .dev-data)──
Set-Location "F:\AI\突发奇想的乱七八糟\简历投递工作流\campus-autofill"
# 清掉上次运行日志,保证后面的日志断言针对本轮(绝不动 resumes.json)
Remove-Item ".dev-data\main.log" -ErrorAction SilentlyContinue
$devLog = "F:\AI\突发奇想的乱七八糟\简历投递工作流\campus-autofill\.dev-data\main.log"
function Assert-Log($pattern, $label) {
  $log = Get-Content $devLog -Raw -ErrorAction SilentlyContinue
  if ($log -ne $null -and $log -match $pattern) { Write-Output "LOG-PASS $label" }
  else { Write-Output "LOG-FAIL $label" }
}
$app = Start-Process -FilePath ".\node_modules\.bin\electron.cmd" -ArgumentList "." -PassThru
Start-Sleep -Seconds 10

# 0. 回归步骤:点击第二张简历卡片(切换当前简历)——曾因主进程 currentId 未定义崩溃
$script:foundRect = $null
function EnumCb($hWnd, $lParam) {
  $sb = New-Object System.Text.StringBuilder 256
  [User32]::GetWindowText($hWnd, $sb, 256) | Out-Null
  if ($sb.ToString() -like '*校招网申自动填写*' -and $sb.ToString() -notlike '*悬浮球*') {
    $r = New-Object User32+RECT
    [User32]::GetWindowRect($hWnd, [ref]$r) | Out-Null
    $script:foundRect = $r; return $false
  }
  return $true
}
[User32]::EnumWindows({ param($h, $l) (EnumCb $h $l) }, [IntPtr]::Zero) | Out-Null
if ($null -ne $script:foundRect) {
  $r = $script:foundRect
  $cardX = $r.Left + [int]((1280 * 0.62) * $scale)
  $cardY = $r.Top + [int]((48 + 130 + 80) * $scale)
  Click $cardX $cardY
  Start-Sleep -Milliseconds 800
  Shot "0-card-switch.png"
  $aliveAfterCard = -not $app.HasExited
  Write-Output "cardClickAlive=$aliveAfterCard"
} else {
  Write-Output "MAINWIN_NOT_FOUND(跳过卡片回归)"
}

# 窗口存活与标题
Get-Process electron -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowTitle -ne '' } |
  ForEach-Object { Write-Output "WINDOW pid=$($_.Id) title=$($_.MainWindowTitle)" }

Shot "1-initial.png"
# 1. 点击悬浮球 → 面板展开(此时应是「未检测到网申表单」+「开始检测」)
HoverClick $ballCx $ballCy
Start-Sleep -Milliseconds 1200
Shot "2-panel-idle.png"
# 2. 点「开始检测」:当前主窗口在 #/resume(没有网申表单),期望得到**未命中**
#    这条同时是产品口径的负向断言:球只判定当前页面,不跳转任何页面。
HoverClick $btnCx $btnCy
Start-Sleep -Seconds 2
Shot "3-detect-miss.png"
Assert-Log "ball-cmd.*detect" "开始检测被点击"
Assert-Log "detect.*main:not-apply" "未检测到(简历管理页确实没有表单)"

# 3. 验证「练习填写」入口(演示表单从悬浮球挪到简历页后的新入口)。
#    工具栏 justify-content:flex-end,DOM 顺序是 [新增简历][练习填写],故**练习填写在最右侧**,
#    实测中心距窗口外框右缘约 160 DIP(「+ 新增简历」在约 266 DIP)。
#    候选偏移刻意收在 130–190 DIP:全部落在练习填写按钮内,绝不误触新增按钮
#    (误触会弹出「新增简历」对话框,把后续点击全部吞掉——上一版就栽在这里)。
if ($null -eq $r) {
  # 卡片回归分支未跑到时 $r 可能未赋值,重新枚举一次
  [User32]::EnumWindows({ param($h, $l) (EnumCb $h $l) }, [IntPtr]::Zero) | Out-Null
  $r = $script:foundRect
}
$entryOk = $false
if ($null -eq $r) {
  Write-Output "ENTRY-SKIP 主窗口未找到,跳过练习填写入口验证"
} else {
  # 工具栏按钮中心:标题栏 30 DIP + 内容区约 228 DIP
  $toolbarY = $r.Top + [int](258 * $scale)
  foreach ($off in @(160, 145, 175, 135, 190)) {
    Click ($r.Right - [int]($off * $scale)) $toolbarY
    Start-Sleep -Milliseconds 1100
    if ((Get-Content $devLog -Raw -ErrorAction SilentlyContinue) -match 'main-route.*apply') {
      Write-Output "练习填写入口命中(距右缘 $off DIP)"
      $entryOk = $true
      break
    }
  }
  if (-not $entryOk) { Write-Output "ENTRY-FAIL 未能在候选偏移内进入演示页" }
  Assert-Log "main-route.*apply" "练习填写入口导航到 #/apply"
}
Shot "4-apply-page.png"

# 4. 已在演示网申页:再点「开始检测」,这次期望**命中**
HoverClick $btnCx $btnCy
Start-Sleep -Seconds 3
Shot "5-detect-hit.png"
Assert-Log "detect.*main:demo-hit" "已检测到(演示表单被识别)"
# 5. 点「开始填写」→ 逐字段填入(按钮位置与「开始检测」相同)
#
# 这里曾经偶发失败:日志里连 fill-records 都没有,说明这一下点击没点中。
# 原因是脚本按**固定坐标**点(`$btnCx $btnCy` 沿用「开始检测」按钮的位置),
# 而面板内容会随状态变化(检测结果文案、已填写计数),按钮纵向位置可能偏移。
# 因此改为「点一次 → 等 → 查日志 → 没生效就再点」,最多 3 次;
# 重复点击无害:填写中状态不是 ready,应用会忽略后续点击。
$fillOk = $false
for ($attempt = 1; $attempt -le 3 -and -not $fillOk; $attempt++) {
  HoverClick $btnCx $btnCy
  Start-Sleep -Seconds 5
  $logPath = Join-Path $PSScriptRoot '..\.dev-data\main.log'
  if (Test-Path -LiteralPath $logPath) {
    $tail = Get-Content -LiteralPath $logPath -Raw -ErrorAction SilentlyContinue
    if ($tail -match 'fill-done') { $fillOk = $true }
    elseif ($attempt -lt 3) { Write-Host "  (第 $attempt 次点击未触发填写,重试)" -ForegroundColor Yellow }
  }
}
Start-Sleep -Seconds 2
Shot "6-filled.png"
Assert-Log "fill-done" "fill-done(填写是否真的完成)"
# 6. 拖动悬浮球到屏幕中部偏左(验证桌面级自由拖动)
DragTo $ballCx $ballCy (-500) (-300)
Shot "7-dragged.png"

Stop-Process -Name electron -Force -ErrorAction SilentlyContinue
# 失败时直接看日志尾部定位,不用再截图猜
Write-Output "── main.log tail ──"
Get-Content $devLog -Tail 16 -ErrorAction SilentlyContinue | ForEach-Object { Write-Output $_ }
Write-Output "DONE"
