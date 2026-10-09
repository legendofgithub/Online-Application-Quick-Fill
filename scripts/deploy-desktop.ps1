# 部署校招快填到桌面目录(仅供开发流程使用)
#
# 为什么要有这个脚本:
#   2026-10-04 出过一次事故 —— 我在十几轮修复里都用临时 robocopy 命令部署,
#   目标写的是「桌面\校招快填」,而用户实际运行的是「桌面\校招快填打包」
#   (任务栏固定项指向它)。结果所有更新都进了一个没人运行的文件夹,
#   用户看到的还是旧版本。根因不是手误,而是**部署目标没有固化成可校验的东西**。
#
# 本脚本做的事:
#   1. 从任务栏固定项**反查用户真正在用的目录**,而不是靠硬编码或记忆
#   2. 关掉正在运行的实例(否则 asar 覆盖不了)
#   3. 同步最新构建,并校验 app.asar 哈希与构建产物一致
#   4. 用产物里的特征串做行为校验(默认校验「导出到 DSH」,可用 -Expect 覆盖)
#   5. 次要副本一并同步,避免两个文件夹版本分叉再次造成"我改了但你没看到"
#
# 用法:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-desktop.ps1
#   ... -Expect '某个必须存在的字符串'     # 换成本次改动的特征串
#   ... -SkipSecondary                     # 只同步主目录

[CmdletBinding()]
param(
  [string]$Expect = '',
  [switch]$SkipSecondary
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 特征串默认值写在文件里(文件带 BOM,中文安全)。
# 需要覆盖时用环境变量 $env:CF_EXPECT —— **不要用命令行参数传中文**:
# PowerShell 5.1 接收命令行里的中文参数会乱码,实测会让脚本无任何输出并 exit=-1。
if ($Expect -eq '') { $Expect = if ($env:CF_EXPECT) { $env:CF_EXPECT } else { '导出到 DSH' } }

$repo = Split-Path -Parent $PSScriptRoot
$src = Join-Path $repo 'out\campus-autofill-win32-x64'
$secondary = 'C:\Users\asus\Desktop\校招快填'
$taskbarDir = Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'

if (-not (Test-Path -LiteralPath (Join-Path $src 'CampusFill.exe'))) {
  Write-Host "✗ 找不到构建产物:$src" -ForegroundColor Red
  Write-Host "  先跑 npm run package" -ForegroundColor Yellow
  exit 1
}

# ── 1. 反查用户真正在用的目录:任务栏固定项 > 其他证据 ──
Write-Host '=== 定位用户实际运行的目录 ===' -ForegroundColor Cyan
$live = ''
$ws = New-Object -ComObject WScript.Shell
Get-ChildItem -LiteralPath $taskbarDir -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object {
  $t = ''
  try { $t = $ws.CreateShortcut($_.FullName).TargetPath } catch { }
  if ($t -like '*CampusFill.exe' -and $live -eq '') {
    $live = Split-Path -Parent $t
    Write-Host "  任务栏固定项 $($_.Name) → $t"
  }
}
if ($live -eq '') {
  # 没有固定项时退回「哪个副本最近被运行过」的启发式:取 CampusFill.exe 最新访问时间的那个
  Write-Host '  (没有任务栏固定项,改用最近运行的副本)' -ForegroundColor Yellow
  $cands = Get-ChildItem 'C:\Users\asus\Desktop' -Directory | ForEach-Object {
    $exe = Join-Path $_.FullName 'CampusFill.exe'
    if (Test-Path -LiteralPath $exe) { [pscustomobject]@{ Dir = $_.FullName; Seen = (Get-Item -LiteralPath $exe).LastAccessTime } }
  } | Sort-Object Seen -Descending
  if ($cands.Count -eq 0) { Write-Host '✗ 桌面上找不到任何可运行副本' -ForegroundColor Red; exit 1 }
  $live = $cands[0].Dir
}
if (-not (Test-Path -LiteralPath $live)) { Write-Host "✗ 目标目录不存在:$live" -ForegroundColor Red; exit 1 }
Write-Host "  ★ 部署目标:$live" -ForegroundColor Green

$targets = @($live)
if (-not $SkipSecondary -and $secondary -ne $live -and (Test-Path -LiteralPath $secondary)) { $targets += $secondary }

# ── 2. 关掉运行中的实例(asar 被占用时 robocopy 会静默失败)──
Write-Host ''
Write-Host '=== 关闭正在运行的实例 ===' -ForegroundColor Cyan
$procs = Get-Process -Name CampusFill -ErrorAction SilentlyContinue
if ($procs) {
  Write-Host "  请求退出 $($procs.Count) 个进程(优雅关闭)"
  # 先请它自己退:Electron 会走 before-quit → flushStorageData,
  # 把 cookie / localStorage 落盘。直接 Stop-Process 强杀会丢未落盘的会话数据,
  # 用户看到的现象就是「网申网站又要重新登录」。
  foreach ($p in $procs) {
    try { $null = $p.CloseMainWindow() } catch { }
  }
  $deadline = (Get-Date).AddSeconds(12)
  while ((Get-Date) -lt $deadline) {
    $left = Get-Process -Name CampusFill -ErrorAction SilentlyContinue
    if (-not $left) { break }
    Start-Sleep -Milliseconds 400
  }
  $left = Get-Process -Name CampusFill -ErrorAction SilentlyContinue
  if ($left) {
    # 兜底:确实不退才强杀(例如窗口卡死),并明确说明——这种情况可能丢会话数据
    Write-Host "  ✗ 12 秒内未退出,强制结束 $($left.Count) 个进程(可能丢失未落盘的会话数据)" -ForegroundColor Yellow
    $left | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
  } else {
    Write-Host '  ✓ 已优雅退出(会话数据已落盘)'
  }
} else { Write-Host '  (没有在运行)' }

# ── 3. 同步 ──
$srcHash = (Get-FileHash (Join-Path $src 'resources\app.asar')).Hash
Write-Host ''
Write-Host '=== 同步 ===' -ForegroundColor Cyan
Write-Host "  源:$src"
Write-Host "  源 app.asar 哈希:$($srcHash.Substring(0,16))"
$failed = @()
foreach ($t in $targets) {
  robocopy $src $t /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  $dstAsar = Join-Path $t 'resources\app.asar'
  $dstHash = (Get-FileHash $dstAsar -ErrorAction SilentlyContinue).Hash
  $same = ($dstHash -eq $srcHash)
  Write-Host "  → $t  哈希 $(if ($dstHash) { $dstHash.Substring(0,16) } else { '(缺失)' })  $(if ($same) { '✓ 一致' } else { '✗ 不一致' })" -ForegroundColor $(if ($same) { 'Green' } else { 'Red' })
  if (-not $same) { $failed += $t }
}

# ── 4. 行为校验:产物里必须真的有本次改动的特征串 ──
Write-Host ''
Write-Host '=== 行为校验 ===' -ForegroundColor Cyan
foreach ($t in $targets) {
  $asar = Join-Path $t 'resources\app.asar'
  $has = (Select-String -Path $asar -Pattern $Expect -Quiet) -eq $true
  Write-Host "  「$Expect」在 $([System.IO.Path]::GetFileName($t)) 里:$(if ($has) { '✓' } else { '✗' })" -ForegroundColor $(if ($has) { 'Green' } else { 'Red' })
  if (-not $has) { $failed += "$t(缺特征串)" }
}

Write-Host ''
if ($failed.Count -gt 0) {
  Write-Host "✗ 部署存在问题:$($failed -join ' / ')" -ForegroundColor Red
  exit 1
}
Write-Host '✓ 部署完成并已校验(哈希一致 + 特征串存在)' -ForegroundColor Green
Write-Host "  用户实际运行的目录:$live"
Write-Host '  请重新启动应用(或点任务栏固定项)。'
