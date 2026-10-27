$ErrorActionPreference = "Continue"
Set-Location -LiteralPath $PSScriptRoot

$electronExe = Join-Path $PSScriptRoot "node_modules\electron\dist\electron.exe"
$appDir = $PSScriptRoot

if (-not (Test-Path -LiteralPath $electronExe)) {
    Write-Host "错误：找不到 electron.exe，请先双击 start.bat 完成首次安装" -ForegroundColor Red
    Write-Host "  $electronExe" -ForegroundColor Red
    Start-Sleep -Seconds 5
    exit 1
}

Write-Host "正在启动聊天胶囊..."
Start-Process -FilePath $electronExe -ArgumentList "`"$appDir`"" -WorkingDirectory $appDir
Write-Host "已启动。胶囊在屏幕右上角，快捷键 Ctrl+Alt+Space。"
Start-Sleep -Seconds 2
