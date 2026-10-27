$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

Write-Host "==========================================="
Write-Host "  聊天胶囊 · 首次启动"
Write-Host "==========================================="
Write-Host ""

Write-Host "[1/3] 切换 better-sqlite3 到 electron ABI..."
node (Join-Path $PSScriptRoot "scripts\rebuild-native.cjs") --electron
Write-Host ""

Write-Host "[2/3] 构建主进程与渲染进程..."
npm run build
Write-Host ""

Write-Host "[3/3] 启动应用，胶囊将出现在屏幕右上角..."
$electronExe = Join-Path $PSScriptRoot "node_modules\electron\dist\electron.exe"
$appDir = $PSScriptRoot
Start-Process -FilePath $electronExe -ArgumentList "`"$appDir`"" -WorkingDirectory $appDir

Write-Host ""
Write-Host "应用已启动！如未看到胶囊，请检查屏幕右上角。"
Write-Host "唤起快捷键: Ctrl+Alt+Space"
Start-Sleep -Seconds 3
