# reproduce.ps1 - one-click reproduce of small loop 10 (karaoke subtitles at 49-minute scale).
# Usage: run from repo root:  .\Prototype\loop10_karaoke_scale\reproduce.ps1
# Prereq: loop 9 artifacts (History\runs\l9_long\...). ASCII-only on purpose.

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Push-Location $root
try {
  Write-Host "== 0/3 cwd: $($PWD.Path)" -ForegroundColor Cyan
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node not found; install Node.js 20+" }

  Write-Host "`n== 1/3 check loop-9 artifacts" -ForegroundColor Cyan
  $need = @(
    'History\runs\l9_long\subs\cues.json',
    'History\runs\l9_long\cut\edits.json',
    'History\runs\l9_long\cut\final.mp4'
  )
  $missing = @()
  foreach ($p in $need) { if (-not (Test-Path $p)) { $missing += $p } }
  if ($missing.Count -gt 0) {
    Write-Host "missing inputs:" -ForegroundColor Yellow
    $missing | ForEach-Object { Write-Host "  - $_" }
    throw "run loop9 first: node Tool\acceptance\run_long_acceptance.mjs"
  }
  Write-Host "  inputs ok"

  Write-Host "`n== 2/3 karaoke ASS at scale (events / size / gen time) + 120s burn + pixel check" -ForegroundColor Cyan
  node Tool\acceptance\run_karaoke_scale.mjs
  $code = $LASTEXITCODE

  Write-Host "`n== 3/3 outputs" -ForegroundColor Cyan
  Write-Host "acceptance : History\loops\loop10\acceptance.md"
  Write-Host "ass        : History\runs\l10_karaoke\karaoke_long.ass (1030 events, ~103KB)"
  Write-Host "probe      : History\runs\l10_karaoke\probe.mp4 (first 120s with burned-in karaoke)"
  Write-Host "snapshot   : Prototype\loop10_karaoke_scale\case_long_karaoke"
  if ($code -eq 0) { Write-Host "`nresult: PASS" -ForegroundColor Green; exit 0 }
  else { Write-Host "`nresult: FAIL (see acceptance output above)" -ForegroundColor Red; exit 1 }
}
finally {
  Pop-Location
}
