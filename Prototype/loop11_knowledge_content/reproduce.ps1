# reproduce.ps1 - one-click reproduce of small loop 11 (knowledge-content pipeline: triage + units + terms).
# Usage: run from repo root:  .\Prototype\loop11_knowledge_content\reproduce.ps1
# Prereq: loop2/loop6 artifacts (l2 bench + transcript_punct.json) and loop7 (TOS 90s). ASCII-only on purpose.

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Push-Location $root
try {
  Write-Host "== 0/3 cwd: $($PWD.Path)" -ForegroundColor Cyan
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node not found; install Node.js 20+" }

  Write-Host "`n== 1/3 check inputs" -ForegroundColor Cyan
  $need = @(
    'History\bench\l2_en\source.mp4',
    'History\asr\transcript_punct.json',
    'History\loops\loop07\base.json'
  )
  $missing = @()
  foreach ($p in $need) { if (-not (Test-Path $p)) { $missing += $p } }
  if ($missing.Count -gt 0) {
    Write-Host "missing inputs:" -ForegroundColor Yellow
    $missing | ForEach-Object { Write-Host "  - $_" }
    throw "run loop2/loop6 reproduce first (l2 bench + transcript); loop7 for the TOS transcript"
  }
  Write-Host "  inputs ok"

  Write-Host "`n== 2/3 acceptance (triage / unit normalization / zh units / term candidates)" -ForegroundColor Cyan
  node Tool\acceptance\run_knowledge_acceptance.mjs --force
  $code = $LASTEXITCODE

  Write-Host "`n== 3/3 outputs" -ForegroundColor Cyan
  Write-Host "acceptance : History\loops\loop11\acceptance.md"
  Write-Host "triage     : History\runs\l11_knowledge\classify_{l2,tos}.json"
  Write-Host "normalized : History\runs\l11_knowledge\subs_norm\bilingual.srt (vs subs_raw = control)"
  Write-Host "terms      : History\runs\l11_knowledge\term_candidates*.json"
  Write-Host "snapshot   : Prototype\loop11_knowledge_content\case_l2_knowledge"
  if ($code -eq 0) { Write-Host "`nresult: PASS" -ForegroundColor Green; exit 0 }
  else { Write-Host "`nresult: FAIL (see acceptance output above)" -ForegroundColor Red; exit 1 }
}
finally {
  Pop-Location
}
