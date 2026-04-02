# 아래 전체를 복사해서 PowerShell에 붙여넣기
Write-Host "=== Hi-Link 프로세스 진단 ===" -ForegroundColor Cyan

# 1. Hi-Link 관련 프로세스 검색
Write-Host "`n1. Hi-Link 관련 프로세스 검색 중..." -ForegroundColor Yellow
$hiLinkProcesses = Get-Process | Where-Object {
    $_.ProcessName -like "*HiLink*" -or
    $_.ProcessName -like "*Hi-Link*" -or
    $_.ProcessName -like "*FANUC*" -or
    $_.MainWindowTitle -like "*HiLink*" -or
    $_.MainWindowTitle -like "*Hi-Link*"
}

if ($hiLinkProcesses.Count -eq 0) {
    Write-Host "   ✓ Hi-Link 관련 프로세스 없음" -ForegroundColor Green
} else {
    Write-Host "   ✗ Hi-Link 관련 프로세스 발견:" -ForegroundColor Red
    $hiLinkProcesses | ForEach-Object {
        Write-Host "      - $($_.ProcessName) (PID: $($_.Id))" -ForegroundColor Red
        Write-Host "        경로: $($_.Path)" -ForegroundColor Gray
    }
}

# 2. 브리지 서버 프로세스 확인
Write-Host "`n2. 브리지 서버 프로세스 확인 중..." -ForegroundColor Yellow
$bridgeProcesses = Get-Process | Where-Object {
    $_.ProcessName -like "*HiLinkBridge*"
}

if ($bridgeProcesses.Count -eq 0) {
    Write-Host "   ✗ 브리지 서버 실행 중이 아님" -ForegroundColor Red
} else {
    Write-Host "   ✓ 브리지 서버 실행 중:" -ForegroundColor Green
    $bridgeProcesses | ForEach-Object {
        Write-Host "      - $($_.ProcessName) (PID: $($_.Id))" -ForegroundColor Green
    }
}

# 3. CNC 장비 연결 확인
Write-Host "`n3. CNC 장비 연결 확인 중 (192.168.0.105:8193)..." -ForegroundColor Yellow
$connections = netstat -ano | Select-String "192.168.0.105:8193"
if ($connections) {
    Write-Host "   ✓ CNC 장비와 연결된 프로세스:" -ForegroundColor Yellow
    $pids = @()
    $connections | ForEach-Object {
        if ($_.Line -match "\s+(\d+)$") {
            $pid = $matches[1]
            if ($pid -notin $pids) {
                $pids += $pid
                $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
                if ($process) {
                    Write-Host "      - $($process.ProcessName) (PID: $pid)" -ForegroundColor Yellow
                    if ($process.ProcessName -notlike "*HiLinkBridge*") {
                        Write-Host "        ⚠ 경고: 브리지 서버가 아닌 프로그램!" -ForegroundColor Red
                    }
                }
            }
        }
    }
} else {
    Write-Host "   ✓ CNC 장비와 연결된 프로세스 없음" -ForegroundColor Green
}

# 종합 진단
Write-Host "`n=== 종합 진단 ===" -ForegroundColor Cyan
if ($hiLinkProcesses.Count -eq 0) {
    Write-Host "✓ 프로세스 충돌 없음" -ForegroundColor Green
    Write-Host "  → CNC 장비가 Auto 모드인지 확인" -ForegroundColor Yellow
    Write-Host "  → CNC 장비에 알람이 없는지 확인" -ForegroundColor Yellow
} else {
    Write-Host "✗ 다른 Hi-Link 프로그램이 실행 중입니다!" -ForegroundColor Red
}