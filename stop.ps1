# Quill — 서버 종료 (5174만 내린다)
$conn = Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
  try {
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction Stop
    Write-Host "포트 5174 종료 (PID $($conn.OwningProcess))" -ForegroundColor Green
  } catch {
    Write-Host "포트 5174 종료 실패: $_" -ForegroundColor Red
  }
} else {
  Write-Host '포트 5174 는 사용 중이 아닙니다.' -ForegroundColor DarkGray
}
