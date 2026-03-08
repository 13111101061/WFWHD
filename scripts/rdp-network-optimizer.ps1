#Requires -RunAsAdministrator
<#
.SYNOPSIS
    RDP网络优化配置脚本 - 解决Clash TUN模式残留导致的延迟波动问题
.DESCRIPTION
    本脚本优化Windows网络栈配置，专门针对RDP延迟波动问题进行调优
    包括：禁用TCP自动调优、优化网卡优先级、清理网络残留等
#>

param(
    [switch]$RestoreDefaults,
    [switch]$VerifyOnly
)

$ConfigFile = "$env:ProgramData\RdpNetworkOptimizer\config.json"

function Write-Status {
    param([string]$Message, [string]$Status = "Info")
    $colors = @{ "Success" = "Green"; "Warning" = "Yellow"; "Error" = "Red"; "Info" = "Cyan" }
    Write-Host "[$Status] $Message" -ForegroundColor $colors[$Status]
}

function Get-CurrentConfig {
    return @{
        TcpAutoTuning = (netsh interface tcp show global | Select-String "接收窗口自动调节级别").ToString().Split(":")[1].Trim()
        RscState = (netsh interface tcp show global | Select-String "接收段合并状态").ToString().Split(":")[1].Trim()
        EthernetMetric = (Get-NetIPInterface -InterfaceAlias "以太网" -AddressFamily IPv4).InterfaceMetric
        Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    }
}

function Backup-CurrentConfig {
    $backupDir = "$env:ProgramData\RdpNetworkOptimizer"
    if (!(Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir -Force | Out-Null }

    $config = Get-CurrentConfig
    $config | ConvertTo-Json | Out-File $ConfigFile -Encoding UTF8
    Write-Status "当前配置已备份到: $ConfigFile" "Success"
}

function Restore-DefaultConfig {
    Write-Status "正在恢复默认配置..." "Warning"

    # 恢复TCP自动调优
    netsh interface tcp set global autotuninglevel=normal | Out-Null
    Write-Status "TCP自动调优已恢复为 normal" "Success"

    # 恢复接收段合并
    netsh interface tcp set global rsc=enabled | Out-Null
    Write-Status "接收段合并已启用" "Success"

    # 恢复网卡度量值
    Set-NetIPInterface -InterfaceAlias "以太网" -InterfaceMetric 25 -ErrorAction SilentlyContinue
    Write-Status "网卡度量值已恢复为 25" "Success"

    Write-Status "默认配置恢复完成" "Success"
}

function Optimize-NetworkConfig {
    Write-Status "开始执行RDP网络优化..." "Info"

    # 备份当前配置
    Backup-CurrentConfig

    # 1. 禁用TCP窗口自动调节（关键优化）
    Write-Status "禁用TCP窗口自动调节..." "Info"
    $result = netsh interface tcp set global autotuninglevel=disabled 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Status "TCP窗口自动调节已禁用" "Success"
    } else {
        Write-Status "禁用TCP自动调优失败: $result" "Error"
    }

    # 2. 禁用接收段合并（RSC可能与RDP冲突）
    Write-Status "禁用接收段合并(RSC)..." "Info"
    $result = netsh interface tcp set global rsc=disabled 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Status "接收段合并已禁用" "Success"
    } else {
        Write-Status "禁用RSC失败: $result" "Error"
    }

    # 3. 优化网卡接口优先级
    Write-Status "优化网卡接口优先级..." "Info"
    try {
        Set-NetIPInterface -InterfaceAlias "以太网" -InterfaceMetric 5 -ErrorAction Stop
        Write-Status "以太网接口度量值已设置为 5（最高优先级）" "Success"
    } catch {
        Write-Status "设置网卡优先级失败: $_" "Error"
    }

    # 4. 清理网络缓存
    Write-Status "清理网络缓存..." "Info"
    Clear-DnsClientCache
    Write-Status "DNS缓存已清除" "Success"

    # 5. 优化网卡高级属性（针对Realtek网卡）
    Write-Status "优化网卡高级属性..." "Info"
    try {
        # 增大接收缓冲区
        Set-NetAdapterAdvancedProperty -Name "以太网" -DisplayName "接收缓冲区" -DisplayValue "2048" -ErrorAction SilentlyContinue
        # 增大传输缓冲区
        Set-NetAdapterAdvancedProperty -Name "以太网" -DisplayName "传输缓冲区" -DisplayValue "2048" -ErrorAction SilentlyContinue
        Write-Status "网卡缓冲区已优化" "Success"
    } catch {
        Write-Status "网卡属性优化失败（可能不是Realtek网卡）: $_" "Warning"
    }

    Write-Status "RDP网络优化完成！" "Success"
    Write-Status "请测试RDP连接，观察延迟是否稳定" "Info"
}

function Show-CurrentStatus {
    Write-Status "当前网络配置状态:" "Info"
    Write-Host ""

    $config = Get-CurrentConfig

    Write-Host "  TCP窗口自动调节级别: " -NoNewline
    if ($config.TcpAutoTuning -eq "disabled") {
        Write-Host $config.TcpAutoTuning -ForegroundColor Green
    } else {
        Write-Host $config.TcpAutoTuning -ForegroundColor Yellow
    }

    Write-Host "  接收段合并状态: " -NoNewline
    if ($config.RscState -eq "disabled") {
        Write-Host $config.RscState -ForegroundColor Green
    } else {
        Write-Host $config.RscState -ForegroundColor Yellow
    }

    Write-Host "  以太网接口度量值: " -NoNewline
    if ($config.EthernetMetric -le 10) {
        Write-Host $config.EthernetMetric -ForegroundColor Green
    } else {
        Write-Host $config.EthernetMetric -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Status "配置时间: $($config.Timestamp)" "Info"
}

# 主逻辑
if ($RestoreDefaults) {
    Restore-DefaultConfig
} elseif ($VerifyOnly) {
    Show-CurrentStatus
} else {
    Optimize-NetworkConfig
    Write-Host ""
    Show-CurrentStatus
}
