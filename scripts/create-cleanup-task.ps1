#Requires -RunAsAdministrator
<#
.SYNOPSIS
    创建计划任务 - 关机前自动清理TUN残留
.DESCRIPTION
    在系统关机/注销前自动执行网络清理，防止TUN模式残留
#>

$TaskName = "ClashTUNCleanupOnShutdown"
$ScriptPath = "$PSScriptRoot\shutdown-cleanup.ps1"

# 创建清理脚本
$CleanupScript = @'
# 关机清理脚本
$LogFile = "$env:TEMP\tun-cleanup.log"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp - $Message" | Out-File $LogFile -Append -Encoding UTF8
}

Write-Log "开始执行关机清理..."

# 停止Clash相关进程
$processes = @("clash", "mihomo", "verge", "clash-verge")
foreach ($proc in $processes) {
    Get-Process -Name $proc -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Log "已停止进程: $proc"
}

# 清理路由表
$routes = Get-NetRoute | Where-Object {
    $_.DestinationPrefix -match "198\.18" -or
    $_.NextHop -match "198\.18" -or
    $_.InterfaceAlias -match "Meta|Wintun"
}
foreach ($route in $routes) {
    Remove-NetRoute -InputObject $route -Confirm:$false -ErrorAction SilentlyContinue
    Write-Log "已删除路由: $($route.DestinationPrefix)"
}

# 重置Winsock（可选，如果问题严重）
# netsh winsock reset

Write-Log "关机清理完成"
'@

$CleanupScript | Out-File $ScriptPath -Encoding UTF8
Write-Host "清理脚本已创建: $ScriptPath" -ForegroundColor Green

# 创建计划任务
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`""

# 触发器：系统关机时
$Trigger1 = New-ScheduledTaskTrigger -AtLogOff

# 触发器：系统启动时（检查并修复）
$Trigger2 = New-ScheduledTaskTrigger -AtStartup

$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

try {
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger1, $Trigger2 -Settings $Settings -Principal $Principal -Force
    Write-Host "计划任务已创建: $TaskName" -ForegroundColor Green
    Write-Host "该任务将在以下时机执行:" -ForegroundColor Cyan
    Write-Host "  - 用户注销时" -ForegroundColor Gray
    Write-Host "  - 系统启动时" -ForegroundColor Gray
} catch {
    Write-Host "创建计划任务失败: $_" -ForegroundColor Red
}
