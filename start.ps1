# Quill — 개발 서버 실행 (프런트 5174)
#   실행:  powershell -ExecutionPolicy Bypass -File .\start.ps1
#   종료:  powershell -ExecutionPolicy Bypass -File .\stop.ps1
#
# 이 파일은 반드시 UTF-8 BOM 으로 저장한다.
# BOM 이 없으면 Windows PowerShell 5.1 이 CP949 로 읽어 한글 문자열에서 파싱 에러가 난다.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$frontend = Join-Path $root 'frontend'

Write-Host ''
Write-Host '  Quill — 리포트를 읽어주는 금융 과외' -ForegroundColor DarkYellow
Write-Host '  ------------------------------------------------' -ForegroundColor DarkGray

# 1) 의존성 확인
if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
  Write-Host '  [1/2] 의존성 설치 중... (처음 한 번만)' -ForegroundColor Yellow
  Push-Location $frontend
  npm install --no-audit --no-fund
  Pop-Location
} else {
  Write-Host '  [1/2] 의존성 확인 완료' -ForegroundColor Green
}

# 2) 포트 정리 — healthcare-ai-webapp(5173)는 건드리지 않는다
$conn = Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
  Write-Host "        포트 5174 사용 중인 프로세스를 종료합니다 (PID $($conn.OwningProcess))" -ForegroundColor DarkYellow
  try { Stop-Process -Id $conn.OwningProcess -Force -ErrorAction Stop } catch {}
  Start-Sleep -Milliseconds 500
}

Write-Host '  [2/2] 서버 기동 중...' -ForegroundColor Yellow

Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'dev' `
  -WorkingDirectory $frontend -WindowStyle Normal

Start-Sleep -Seconds 4

Write-Host ''
Write-Host '  준비되었습니다.' -ForegroundColor Green
Write-Host '    대문          http://localhost:5174/' -ForegroundColor White
Write-Host '    성향 진단     http://localhost:5174/survey' -ForegroundColor White
Write-Host '    리포트 서재   http://localhost:5174/library' -ForegroundColor White
Write-Host ''

Start-Process 'http://localhost:5174/'
