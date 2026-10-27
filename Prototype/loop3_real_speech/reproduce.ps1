# reproduce.ps1 - one-click reproduce of small loop 3 (real-footage speech -> Chinese subtitles).
# Usage: run from repo root:  .\Prototype\loop3_real_speech\reproduce.ps1
# Note: PowerShell/curl cannot reach the internet in this sandbox; network work is done by Node (see Tool/*.mjs).
# ASCII-only on purpose (Windows PowerShell 5.1 + no BOM issues).
param(
  [switch]$SkipModel
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Push-Location $root
try {
  Write-Host "== 0/4 cwd: $($PWD.Path)" -ForegroundColor Cyan
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node not found; install Node.js 20+" }

  Write-Host "`n== 1/4 prepare deps (ffmpeg + ASR libs, first run only)" -ForegroundColor Cyan
  node Tool\bootstrap_ffmpeg.mjs
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg bootstrap failed" }
  node Tool\bootstrap_asr.mjs
  if ($LASTEXITCODE -ne 0) { throw "asr bootstrap failed" }

  if (-not $SkipModel) {
    Write-Host "`n== 2/4 fetch Vosk English model (39MB, throttled source: ~15 min)" -ForegroundColor Cyan
    node Tool\fetch_vosk_model.mjs
    if ($LASTEXITCODE -ne 0) { throw "model fetch failed" }
  } else { Write-Host "`n== 2/4 skipped model fetch (-SkipModel)" -ForegroundColor Yellow }

  Write-Host "`n== 3/4 download real footage (Sintel trailer, CC-BY 3.0)" -ForegroundColor Cyan
  node Tool\fetch_realspeech.mjs
  if ($LASTEXITCODE -ne 0) { throw "footage fetch failed" }

  Write-Host "`n== 4/4 full chain: ASR(+preprocess) -> cut(+speech protection) -> subs -> remap -> burn -> verify" -ForegroundColor Cyan
  node Tool\run_real_acceptance.mjs
  $code = $LASTEXITCODE

  Write-Host "`n---- outputs ----" -ForegroundColor Cyan
  Write-Host "final           : History\runs\real3_subs\final.mp4"
  Write-Host "subtitles       : History\subs\real3\remapped\out_bilingual.srt"
  Write-Host "acceptance      : History\loops\loop03\acceptance.md"
  Write-Host "snapshot dir    : Prototype\loop3_real_speech\case_D_sintel_en2zh"
  if ($code -eq 0) { Write-Host "`nresult: PASS (QA may warn on residual black: dialogue over black cards is a known tradeoff)" -ForegroundColor Green }
  else { Write-Host "`nresult: FAIL (see step output above)" -ForegroundColor Red }
  exit $code
}
finally {
  Pop-Location
}
