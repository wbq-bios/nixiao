# 羁绊彩色图标同步脚本 · 把 design/bonds/out/color 里的 128px 图拷进图床
# 用途:小程序只在「满羁绊」时引用这些彩色图标(/art/icon/128/羁绊重绘/color/<羁绊名>.png);
#       图床目录(ART_DIR)在仓库之外,换机器/重装后跑一次本脚本即可恢复,不用重新导出。
# 用法:powershell -ExecutionPolicy Bypass -File pipeline\sync_bond_icons.ps1 [-ArtRoot "D:\...\提取结果"]
#       不传 -ArtRoot 时优先读环境变量 ART_DIR,再退回本机默认路径。
param([string]$ArtRoot = "")

if (-not $ArtRoot) { $ArtRoot = $env:ART_DIR }
if (-not $ArtRoot) { $ArtRoot = "D:\AIPro\工具\orc识别数据\归档\S3赛季\提取结果" }
if (-not (Test-Path $ArtRoot)) { Write-Host "图床目录不存在:$ArtRoot"; exit 1 }

$src = Join-Path (Split-Path $PSScriptRoot -Parent) "miniprogram\design\bonds\out\color"
if (-not (Test-Path $src)) { Write-Host "重绘源目录不存在:$src"; exit 1 }
$dst = Join-Path $ArtRoot "羁绊重绘\color"
New-Item -ItemType Directory -Force -Path $dst | Out-Null

$n = 0
Get-ChildItem $src -Filter "*_128.png" | ForEach-Object {
  $name = $_.BaseName -replace "_128$", ""
  Copy-Item $_.FullName (Join-Path $dst ($name + ".png")) -Force
  $n++
}
Write-Host "synced $n bond icons -> $dst"