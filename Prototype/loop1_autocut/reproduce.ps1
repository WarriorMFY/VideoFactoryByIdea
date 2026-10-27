# reproduce.ps1 - one-click reproduce of small loop 1 (auto-edit) results.
# Usage: run from repo root:  .\Prototype\loop1_autocut\reproduce.ps1
# Note: PowerShell/curl cannot reach the internet in this sandbox; all network work is done by Node (see Tool/*.mjs).
# This file is intentionally ASCII-only (host is Windows PowerShell 5.1; non-ASCII needs UTF-8 BOM).

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Push-Location $root
try {
  Write-Host "== 0/3 cwd: $($PWD.Path)" -ForegroundColor Cyan
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node not found; install Node.js 20+" }

  Write-Host "`n== 1/3 prepare FFmpeg (about 160MB, first run only)" -ForegroundColor Cyan
  node Tool\bootstrap_ffmpeg.mjs
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg bootstrap failed" }

  Write-Host "`n== 2/3 prepare real public footage (skips case B on failure)" -ForegroundColor Cyan
  node Tool\fetch_real_footage.mjs
  if ($LASTEXITCODE -ne 0) { Write-Host "  (footage download failed, case B will be skipped)" -ForegroundColor Yellow }

  Write-Host "`n== 3/3 end-to-end acceptance (build cases -> run factory -> verify vs ground truth -> QA)" -ForegroundColor Cyan
  node Tool\run_acceptance.mjs
  $code = $LASTEXITCODE

  Write-Host "`n---- outputs ----" -ForegroundColor Cyan
  Write-Host "runs          : History\runs\bench01 , History\runs\real01"
  Write-Host "acceptance    : History\loops\loop01\acceptance.md"
  Write-Host "snapshot dir  : Prototype\loop1_autocut\case_A_synth , Prototype\loop1_autocut\case_B_real"
  if ($code -eq 0) { Write-Host "`nresult: PASS" -ForegroundColor Green } else { Write-Host "`nresult: FAIL (see step output above)" -ForegroundColor Red }
  exit $code
}
finally {
  Pop-Location
}
