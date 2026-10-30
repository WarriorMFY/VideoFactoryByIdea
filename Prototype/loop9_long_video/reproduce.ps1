# reproduce.ps1 - one-click reproduce of small loop 9 (49-minute long-video stress test).
# Usage: run from repo root:  .\Prototype\loop9_long_video\reproduce.ps1
# ASCII-only on purpose (Windows PowerShell 5.1 + no BOM issues).

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Push-Location $root
try {
  Write-Host "== 0/4 cwd: $($PWD.Path)" -ForegroundColor Cyan
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node not found; install Node.js 20+" }

  Write-Host "`n== 1/4 deps (ffmpeg + Vosk runtime + small en model)" -ForegroundColor Cyan
  node Tool\setup\bootstrap_ffmpeg.mjs; if ($LASTEXITCODE -ne 0) { throw "bootstrap_ffmpeg failed" }
  node Tool\setup\bootstrap_asr.mjs;    if ($LASTEXITCODE -ne 0) { throw "bootstrap_asr failed" }
  node Tool\setup\fetch_vosk_model.mjs; if ($LASTEXITCODE -ne 0) { throw "fetch_vosk_model failed" }

  Write-Host "`n== 2/4 media (TOS 355MB + 90s excerpt + 49-minute looped source)" -ForegroundColor Cyan
  node Tool\setup\fetch_tos_movie.mjs;   if ($LASTEXITCODE -ne 0) { throw "fetch_tos_movie failed" }
  node Tool\setup\make_tos_excerpt.mjs;  if ($LASTEXITCODE -ne 0) { throw "make_tos_excerpt failed" }
  node Tool\setup\make_long_source.mjs --minutes 49; if ($LASTEXITCODE -ne 0) { throw "make_long_source failed" }

  Write-Host "`n== 3/4 acceptance (ASR -> cut -> subs -> review roundtrip -> term audit -> burn-in -> QA)" -ForegroundColor Cyan
  Write-Host "   cold run takes ~25 min (two 49-minute renders); reused artifacts ~1 min" -ForegroundColor Yellow
  node Tool\acceptance\run_long_acceptance.mjs
  $code = $LASTEXITCODE

  Write-Host "`n== 4/4 outputs" -ForegroundColor Cyan
  Write-Host "acceptance : History\loops\loop09\acceptance.md"
  Write-Host "metrics    : History\loops\loop09\metrics.json"
  Write-Host "final      : History\runs\l9_long\final.mp4 (48.7 min, with burned-in bilingual subs)"
  Write-Host "review csv : History\runs\l9_long\review\review.csv (273 rows)"
  Write-Host "snapshot   : Prototype\loop9_long_video\case_long"
  if ($code -eq 0) { Write-Host "`nresult: PASS" -ForegroundColor Green; exit 0 }
  else { Write-Host "`nresult: FAIL (see acceptance output above)" -ForegroundColor Red; exit 1 }
}
finally {
  Pop-Location
}
