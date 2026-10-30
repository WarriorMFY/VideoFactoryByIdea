# reproduce.ps1 - one-click reproduce of small loop 7 (short-utterance rescue: hypothesis test).
# Usage: run from repo root:  .\Prototype\loop7_short_utterance\reproduce.ps1
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

  Write-Host "`n== 2/4 media (Tears of Steel 355MB + official subtitles + 90s excerpt)" -ForegroundColor Cyan
  node Tool\setup\fetch_tos_movie.mjs;   if ($LASTEXITCODE -ne 0) { throw "fetch_tos_movie failed" }
  node Tool\setup\make_tos_excerpt.mjs;  if ($LASTEXITCODE -ne 0) { throw "make_tos_excerpt failed" }

  Write-Host "`n== 3/4 acceptance (baseline / best af chain / rescue / 3 probes)" -ForegroundColor Cyan
  node Tool\acceptance\run_rescue_acceptance.mjs --force
  $code = $LASTEXITCODE

  Write-Host "`n== 4/4 outputs" -ForegroundColor Cyan
  Write-Host "acceptance : History\loops\loop07\acceptance.md"
  Write-Host "metrics    : History\loops\loop07\metrics.json"
  Write-Host "probes     : History\loops\loop07\{af_grid,af_crosscheck,oov_probe,rescue_chain_probe}.json"
  Write-Host "snapshot   : Prototype\loop7_short_utterance\case_tos_short"
  if ($code -eq 0) { Write-Host "`nresult: PASS" -ForegroundColor Green; exit 0 }
  else { Write-Host "`nresult: FAIL (see acceptance output above)" -ForegroundColor Red; exit 1 }
}
finally {
  Pop-Location
}
