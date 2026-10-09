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
[User32]::SetProcessDPIAware() | Out-Null
$SW = [System.Windows.Forms.SystemInformation]::PrimaryMonitorSize.Width
$SH = [System.Windows.Forms.SystemInformation]::PrimaryMonitorSize.Height
$g = [System.Drawing.Graphics]::FromHwnd([IntPtr]::Zero); $scale = $g.DpiX / 96.0; $g.Dispose()
$out = "F:\AI\突发奇想的乱七八糟\简历投递工作流\qa-screens"
New-Item -ItemType Directory -Force -Path $out | Out-Null
function Shot($n) {
  $bmp = New-Object System.Drawing.Bitmap($SW, $SH)
  $gg = [System.Drawing.Graphics]::FromImage($bmp); $gg.CopyFromScreen(0,0,0,0,$bmp.Size); $gg.Dispose()
  $bmp.Save("$out\$n", [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose(); Write-Output "shot $n"
}
function Click($x, $y) {
  [User32]::SetCursorPos([int]$x, [int]$y) | Out-Null; Start-Sleep -Milliseconds 350
  [User32]::mouse_event(2,0,0,0,[UIntPtr]::Zero); [User32]::mouse_event(4,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 450
}
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
Set-Location "F:\AI\突发奇想的乱七八糟\简历投递工作流\campus-autofill"
$app = Start-Process -FilePath ".\node_modules\.bin\electron.cmd" -ArgumentList "." -PassThru -RedirectStandardError "F:\AI\突发奇想的乱七八糟\简历投递工作流\qa-screens\electron-err.log" -RedirectStandardOutput "F:\AI\突发奇想的乱七八糟\简历投递工作流\qa-screens\electron-out.log"
Start-Sleep -Seconds 9
[User32]::EnumWindows({ param($h, $l) (EnumCb $h $l) }, [IntPtr]::Zero) | Out-Null
if ($null -eq $script:foundRect) { Write-Output "MAINWIN_NOT_FOUND"; Stop-Process -Name electron -Force -ErrorAction SilentlyContinue; exit 1 }
$r = $script:foundRect
$winCx = ($r.Left + $r.Right) / 2; $winCy = ($r.Top + $r.Bottom) / 2
# 新增按钮(简历页右上)
$addX = $r.Right - [int](90 * $scale); $addY = $r.Top + [int](200 * $scale)
Click $addX $addY
Start-Sleep -Milliseconds 800
Shot "c1-modal-open.png"
# modal 坐标(640 宽居中,估算高度 ~590 DIP)
$mL = $winCx - [int](320 * $scale); $mT = $winCy - [int](295 * $scale)
Click ($mL + [int](165 * $scale)) ($mT + [int](105 * $scale))   # 简历名称
Set-Clipboard -Value "测试-Electron新增"
[System.Windows.Forms.SendKeys]::SendWait("^v")
Click ($mL + [int](165 * $scale)) ($mT + [int](173 * $scale))   # 姓名
Set-Clipboard -Value "王五"
[System.Windows.Forms.SendKeys]::SendWait("^v")
Click ($mL + [int](475 * $scale)) ($mT + [int](173 * $scale))   # 手机
[System.Windows.Forms.SendKeys]::SendWait("13700002222")
Click ($mL + [int](540 * $scale)) ($mT + [int](560 * $scale))   # 保存
Start-Sleep -Milliseconds 1200
Shot "c2-saved.png"
# 删除该卡片(两段式确认:同一点两次)
$cardX = $r.Left + [int]((1280 * 0.62) * $scale); $cardY = $r.Top + [int]((48 + 130 + 20) * $scale)
$delX = $cardX + [int](240 * $scale); $delY = $cardY
Click $delX $delY
Start-Sleep -Milliseconds 600
Shot "c3-confirm.png"
Click $delX $delY
Start-Sleep -Milliseconds 1200
Shot "c4-deleted.png"
$alive = (Get-Process electron -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Output "electronProcs=$alive"
Stop-Process -Name electron -Force -ErrorAction SilentlyContinue
Write-Output "DONE"
