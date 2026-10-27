# reproduce.ps1 - one-click reproduce of small loop 2 (foreign video -> Chinese subtitles).
# Usage: run from repo root:  .\Prototype\loop2_subtitles\reproduce.ps1
#                                 .\Prototype\loop2_subtitles\reproduce.ps1 -Polished
# Note: PowerShell/curl cannot reach the internet in this sandbox; all network work is done by Node (see Tool/*.mjs).
# ASCII-only on purpose (Windows PowerShell 5.1 + no BOM issues).
param(
  [switch]$Polished,          # also render the human-polished subtitle variant
  [switch]$SkipModel          # skip model download (assume already fetched)
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Push-Location $root
try {
  Write-Host "== 0/4 cwd: $($PWD.Path)" -ForegroundColor Cyan
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node not found; install Node.js 20+" }

  Write-Host "`n== 1/4 prepare dirs (ffmpeg + ASR deps, first run only)" -ForegroundColor Cyan
  node Tool\setup/bootstrap_ffmpeg.mjs
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg bootstrap failed" }
  node Tool\setup/bootstrap_asr.mjs
  if ($LASTEXITCODE -ne 0) { throw "asr bootstrap failed" }

  if (-not $SkipModel) {
    Write-Host "`n== 2/4 fetch Vosk English model (39MB, source throttled: ~15 min)" -ForegroundColor Cyan
    node Tool\setup/fetch_vosk_model.mjs
    if ($LASTEXITCODE -ne 0) { throw "model fetch failed" }
  } else { Write-Host "`n== 2/4 skipped model fetch (-SkipModel)" -ForegroundColor Yellow }

  Write-Host "`n== 3/4 build test material (Edge TTS English script + real footage)" -ForegroundColor Cyan
  node Tool\bench/make_l2_bench.mjs
  if ($LASTEXITCODE -ne 0) { throw "material build failed" }

  Write-Host "`n== 4/4 full chain: ASR -> cut -> subtitles -> remap -> burn -> verify" -ForegroundColor Cyan
  node Tool\acceptance/run_subs_acceptance.mjs --skip-build --mt mymemory
  $code = $LASTEXITCODE

  if ($Polished) {
    Write-Host "`n== extra: polished (human-level) translation variant" -ForegroundColor Cyan
    node History\probe\make_zh_agent.mjs History\subs\l2\cues.json History\bench\l2_en\ground_truth.json History\subs\l2\zh_agent.json
    node Tool\acceptance/run_subs_acceptance.mjs --skip-build --mt agent --zh-file History\subs\l2\zh_agent.json
  }

  Write-Host "`n---- outputs ----" -ForegroundColor Cyan
  Write-Host "final (auto MT) : History\runs\l2_subs_mymemory\final.mp4"
  Write-Host "final (polished): History\runs\l2_subs_agent\final.mp4"
  Write-Host "subtitles       : History\subs\l2\remapped\out_bilingual.srt"
  Write-Host "acceptance      : History\loops\loop02\acceptance.md"
  Write-Host "snapshot dir    : Prototype\loop2_subtitles\case_C_en2zh"
  if ($code -eq 0) { Write-Host "`nresult: PASS" -ForegroundColor Green } else { Write-Host "`nresult: FAIL (see step output above)" -ForegroundColor Red }
  exit $code
}
finally {
  Pop-Location
}
