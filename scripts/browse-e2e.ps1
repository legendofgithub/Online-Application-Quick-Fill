# 网申浏览 E2E:内嵌浏览器加载本地测试表单 → 悬浮球通用引擎填写
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
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
[User32]::SetProcessDPIAware() | Out-Null

$SCREEN_W = [System.Windows.Forms.SystemInformation]::PrimaryMonitorSize.Width
$SCREEN_H = [System.Windows.Forms.SystemInformation]::PrimaryMonitorSize.Height
$g = [System.Drawing.Graphics]::FromHwnd([IntPtr]::Zero)
$scale = $g.DpiX / 96.0
$g.Dispose()
$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
Write-Output "SCREEN ${SCREEN_W}x${SCREEN_H} scale=$scale"

# 悬浮球(与 desktop-ball-smoke.ps1 同口径)
$BALL_WIN_W = 340; $BALL_WIN_H = 400; $BALL_EDGE = 16; $BALL_INSET = 12; $BALL_SIZE = 64
$winRightPhys = ($wa.X + $wa.Width) - [int]($BALL_EDGE * $scale)
$winBottomPhys = ($wa.Y + $wa.Height) - [int]($BALL_EDGE * $scale)
$ballCx = $winRightPhys - [int](($BALL_INSET + $BALL_SIZE / 2) * $scale)
$ballCy = $winBottomPhys - [int](($BALL_INSET + $BALL_SIZE / 2) * $scale)
$panelRightPhys = $winRightPhys - [int]($BALL_INSET * $scale)
$btnCx = $panelRightPhys - [int](150 * $scale)
# 面板按钮中心距球窗口底 122 DIP:面板底 88(=12+64+12)+ body 底 padding 16 + 按钮半高 18。
# 旧值 209 会点在面板页眉文本上,点击被吞、整条流程静默失败——两个 E2E 脚本必须同源。
$btnCy = $winBottomPhys - [int](($BALL_INSET + $BALL_SIZE + 12 + 16 + 18) * $scale)

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
  Start-Sleep -Milliseconds 300
  [User32]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  [User32]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 300
}
# 分3步逼近点击,模拟真实鼠标轨迹(与 desktop-ball-smoke.ps1 同口径)
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
$script:foundRect = $null
$script:foundTitle = ""
$script:foundHwnd = [IntPtr]::Zero
function EnumCb($hWnd, $lParam) {
  $sb = New-Object System.Text.StringBuilder 256
  [User32]::GetWindowText($hWnd, $sb, 256) | Out-Null
  $title = $sb.ToString()
  if ($title -like '*校招网申自动填写*' -and $title -notlike '*悬浮球*') {
    $r = New-Object User32+RECT
    [User32]::GetWindowRect($hWnd, [ref]$r) | Out-Null
    $script:foundRect = $r
    $script:foundTitle = $title
    $script:foundHwnd = $hWnd
    return $false
  }
  return $true
}
function MainWinRect() {
  [User32]::EnumWindows({ param($h, $l) (EnumCb $h $l) }, [IntPtr]::Zero) | Out-Null
  if ($null -eq $script:foundRect) { throw "主窗口未找到(EnumWindows)" }
  Write-Output "found: [$script:foundTitle]"
  return $script:foundRect
}

Set-Location "F:\AI\突发奇想的乱七八糟\简历投递工作流\campus-autofill"
# 清掉上次运行日志,保证断言针对本轮(绝不动 resumes.json)
$devLog2 = "F:\AI\突发奇想的乱七八糟\简历投递工作流\campus-autofill\.dev-data\main.log"
Remove-Item $devLog2 -ErrorAction SilentlyContinue
function Assert-Log($pattern, $label) {
  $log = Get-Content $devLog2 -Raw -ErrorAction SilentlyContinue
  if ($log -ne $null -and $log -match $pattern) { Write-Output "LOG-PASS $label" }
  else { Write-Output "LOG-FAIL $label" }
}
$app = Start-Process -FilePath ".\node_modules\.bin\electron.cmd" -ArgumentList "." -PassThru
Start-Sleep -Seconds 10

# 1. 切到「网申浏览」标签。
#    GetWindowRect 返回的是窗口外框左上角,而 React 工具栏在标题栏下方,
#    所以必须叠上标题栏高度(frameH,单位 DIP,由主进程启动时写入 main.log);
#    旧代码硬编码 24 DIP 会把点击打在标题栏上 → 标签永远不激活 → browseVisible=false
#    → 内嵌视图 bounds 恒为 0×0 → 探测整条 browse 分支被跳过 → 面板恒停在待机。
$rect = MainWinRect
Write-Output "mainWin rect: $($rect.Left),$($rect.Top),$($rect.Right),$($rect.Bottom)"
$frameH = 32
$metrics = Get-Content $devLog2 -Raw -ErrorAction SilentlyContinue
if ($metrics -match 'frameH=(\d+)') { $frameH = [int]$Matches[1] }
if ($metrics -match 'scale=([\d\.]+)') { Write-Output "主进程报告 scale=$($Matches[1]) (脚本按 $scale 计算)" }
Write-Output "标题栏高度 frameH=$frameH DIP → 标签点击 Y 偏移 $(($frameH + 24)) DIP"
$tabBrowseX = $rect.Left + [int](139 * $scale)
$tabBrowseY = $rect.Top + [int](($frameH + 24) * $scale)
Click $tabBrowseX $tabBrowseY
Start-Sleep -Milliseconds 1500
# 偶发:首次点击可能没落在标签上(窗口/焦点尚未就绪)。此时不会写 shell-tab 日志,
# 而下一步往地址栏输入网址时,主进程有「输入地址即视为浏览意图」的兜底会自动激活 browse,
# 把这一次失败掩盖过去 —— 本断言校验的是**点击本身**,所以先重试一次再断言。
if (-not (Select-String -Path $devLog2 -Pattern 'shell-tab.*browse' -Quiet)) {
  Write-Output "标签未切换 → 重试一次点击"
  Click $tabBrowseX $tabBrowseY
  Start-Sleep -Milliseconds 1500
}
Shot "b1-browse-tab.png"
# 直接断言标签是否真的切过去了:坐标修复的唯一客观证据(browseVisible 决定视图 0×0 还是可见)
Assert-Log "shell-tab.*browse" "标签点击命中「网申浏览」(browseVisible=true)"

# 2. 地址栏导航:直接点地址栏(既把窗口提到前台、又聚焦输入框,比只靠 Ctrl+L 稳),
#    粘贴 URL 后回车;再用日志校验导航是否真的发生,未发生则重试——
#    曾因焦点被抢导致 SendKeys 全部落空,而截图看不出任何异常。
$urlBarX = $rect.Left + [int](700 * $scale)
$urlBarY = $rect.Top + [int](($frameH + 24) * $scale)
$fixtureUrl = "file:///F:/AI/突发奇想的乱七八糟/简历投递工作流/campus-autofill/test-forms/sample-campus-form.html"
Set-Clipboard -Value $fixtureUrl
$navOk = $false
for ($attempt = 1; $attempt -le 3 -and -not $navOk; $attempt++) {
  [User32]::ShowWindow($script:foundHwnd, 9) | Out-Null      # SW_RESTORE
  [User32]::SetForegroundWindow($script:foundHwnd) | Out-Null
  Start-Sleep -Milliseconds 300
  Click $urlBarX $urlBarY
  Start-Sleep -Milliseconds 300
  [System.Windows.Forms.SendKeys]::SendWait("^a")
  Start-Sleep -Milliseconds 120
  [System.Windows.Forms.SendKeys]::SendWait("^v")
  Start-Sleep -Milliseconds 400
  [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
  Start-Sleep -Seconds 3
  $logNow = Get-Content $devLog2 -Raw -ErrorAction SilentlyContinue
  if ($logNow -match 'nav-url') { Write-Output "地址栏导航已生效(第 $attempt 次尝试)"; $navOk = $true }
  else { Write-Output "地址栏导航未生效,重试(已完成第 $attempt 次)" }
}
if (-not $navOk) { Write-Output "NAV-FAIL 地址栏导航 3 次均未生效" }
Start-Sleep -Seconds 1
Shot "b2-fixture-loaded.png"
Assert-Log "nav-url" "地址栏导航已送达主进程"

# 3. 点球开面板 → 未主动检测前应是「未检测到网申表单」+「开始检测」
HoverClick $ballCx $ballCy
Start-Sleep -Milliseconds 1800
Shot "b3-panel-idle.png"

# 4. 点「开始检测」→ 探测当前内嵌页面,期望命中通用表单
HoverClick $btnCx $btnCy
Start-Sleep -Seconds 3
Shot "b4-detected.png"
Assert-Log "ball-cmd.*detect" "「开始检测」已点击"
Assert-Log "detect.*view:hit" "已检测到(内嵌页被识别为网申表单)"

# 5. 按钮位置不变(已检测到态显示「开始填写」),点它执行填写
HoverClick $btnCx $btnCy
Start-Sleep -Seconds 10
Shot "b5-generic-filled.png"
Assert-Log "ball-cmd.*start" "start(点到的是「开始填写」)"
Assert-Log "fill-done" "fill-done(通用引擎真的执行了填写)"

Start-Sleep -Seconds 2
Shot "b6-report-banner.png"
Write-Output "── main.log tail ──"
Get-Content $devLog2 -Tail 16 -ErrorAction SilentlyContinue | ForEach-Object { Write-Output $_ }
Stop-Process -Name electron -Force -ErrorAction SilentlyContinue
Write-Output "DONE"
