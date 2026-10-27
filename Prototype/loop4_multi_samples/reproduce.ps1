# reproduce.ps1 - one-click reproduce of small loop 4 (multi-sample EN -> ZH subtitle test).
# Usage: run from repo root:  .\Prototype\loop4_multi_samples\reproduce.ps1
#   -SkipTTSSamples   skip the 4-accent Edge TTS samples
#   -SkipToS          skip the 355MB Tears of Steel download (its 90s excerpt is the only
#                     real-footage sample WITH ground truth, so the WER table loses that row)
# Note: PowerShell/curl cannot reach the internet in this sandbox; all network work is done by Node.
# ASCII-only on purpose (Windows PowerShell 5.1 + no BOM issues).
param(
  [switch]$SkipTTSSamples,
  [switch]$SkipToS
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Push-Location $root
try {
  Write-Host "== 0/6 cwd: $($PWD.Path)" -ForegroundColor Cyan
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node not found; install Node.js 20+" }

  Write-Host "`n== 1/6 deps: ffmpeg + ASR libs + Vosk English model (first run only)" -ForegroundColor Cyan
  node Tool\setup/bootstrap_ffmpeg.mjs;  if ($LASTEXITCODE -ne 0) { throw "ffmpeg bootstrap failed" }
  node Tool\setup/bootstrap_asr.mjs;     if ($LASTEXITCODE -ne 0) { throw "asr bootstrap failed" }
  node Tool\setup/fetch_vosk_model.mjs;  if ($LASTEXITCODE -ne 0) { throw "model fetch failed" }

  Write-Host "`n== 2/6 real samples: Sintel trailer / BBB trailer / BBB movie / W3C clip" -ForegroundColor Cyan
  node Tool\setup/fetch_more_speech.mjs; if ($LASTEXITCODE -ne 0) { throw "sample fetch failed" }

  if (-not $SkipTTSSamples) {
    Write-Host "`n== 3/6 multi-accent TTS samples (US/GB/AU/IN, same script, per-sentence ground truth)" -ForegroundColor Cyan
    node Tool\setup/make_speech4_tts.mjs; if ($LASTEXITCODE -ne 0) { throw "tts sample build failed" }
  } else { Write-Host "`n== 3/6 skipped (-SkipTTSSamples)" -ForegroundColor Yellow }

  if (-not $SkipToS) {
    Write-Host "`n== 4/6 Tears of Steel 720p (355MB, dotsrc mirror + 8 threads, ~2 min) + 90s excerpt + ground truth" -ForegroundColor Cyan
    node Tool\setup/fetch_tos_movie.mjs;  if ($LASTEXITCODE -ne 0) { throw "ToS download failed" }
    node Tool\setup/make_tos_excerpt.mjs; if ($LASTEXITCODE -ne 0) { throw "ToS excerpt failed" }
  } else { Write-Host "`n== 4/6 skipped (-SkipToS)" -ForegroundColor Yellow }

  Write-Host "`n== 5/6 batch: ASR(2 variants) -> cut(+speech protect) -> MT -> remap -> burn -> verify/QA" -ForegroundColor Cyan
  node Tool\acceptance/run_multi_speech_acceptance.mjs
  $code = $LASTEXITCODE

  Write-Host "`n== 6/6 snapshot to Prototype" -ForegroundColor Cyan
  node Tool\acceptance/snapshot_loop4.mjs

  Write-Host "`n---- outputs ----" -ForegroundColor Cyan
  Write-Host "report          : History\loops\loop04\report.md"
  Write-Host "metrics         : History\loops\loop04\metrics.json"
  Write-Host "per-sample      : History\runs\multi\<id>\final.mp4 + verify_subs.json"
  Write-Host "snapshot dir    : Prototype\loop4_multi_samples\cases\<id>\"
  if ($code -eq 0) { Write-Host "`nresult: PASS (all samples)" -ForegroundColor Green }
  else { Write-Host "`nresult: some sample failed - check the table in History\loops\loop04\report.md (real footage WER/coverage is the expected weak spot)" -ForegroundColor Yellow }
  exit $code
}
finally {
  Pop-Location
}
