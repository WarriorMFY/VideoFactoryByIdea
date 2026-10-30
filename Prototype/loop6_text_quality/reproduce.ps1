# reproduce.ps1 - one-click reproduce of small loop 6 (text layer: punctuation, translation, CPS).
# Usage: run from repo root:  .\Prototype\loop6_text_quality\reproduce.ps1
# ASCII-only on purpose (Windows PowerShell 5.1 + no BOM issues).

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Push-Location $root
try {
  Write-Host "== 0/4 cwd: $($PWD.Path)" -ForegroundColor Cyan
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node not found; install Node.js 20+" }

  Write-Host "`n== 1/4 check inputs" -ForegroundColor Cyan
  $need = @(
    'History\asr\transcript.json',
    'History\bench\l2_en\script.txt',
    'History\bench\l2_en\ground_truth.json',
    'History\bench\l2_en\reference_zh.json',
    'History\subs\zh_agent_l2_punct.json'
  )
  $missing = @()
  foreach ($p in $need) { if (-not (Test-Path $p)) { $missing += $p } }
  if ($missing.Count -gt 0) {
    Write-Host "missing inputs:" -ForegroundColor Yellow
    $missing | ForEach-Object { Write-Host "  - $_" }
    throw "run loop2 reproduce first (it produces transcript.json and the bench materials)"
  }
  Write-Host "  inputs ok"

  Write-Host "`n== 2/4 punctuation + capitalisation restoration" -ForegroundColor Cyan
  node Tool\subtitle\restore_punct.mjs History\asr\transcript.json --out History\asr\transcript_punct.json --glossary Tool\subtitle\glossary_zh.json
  if ($LASTEXITCODE -ne 0) { throw "restore_punct failed" }

  Write-Host "`n== 3/4 acceptance (punct F1 / 3 translation variants / subs regression)" -ForegroundColor Cyan
  node Tool\acceptance\run_text_acceptance.mjs
  $code = $LASTEXITCODE

  Write-Host "`n== 4/4 render a sample with the polished subtitle track" -ForegroundColor Cyan
  if (Test-Path History\runs\l6_text) { Remove-Item -Recurse -Force History\runs\l6_text }
  node Tool\edit\vfactory.mjs History\bench\l2_en\source.mp4 --out History\runs\l6_text --title "loop6 text quality" --srt History\subs\l2_agent\bilingual.srt
  if ($LASTEXITCODE -ne 0) { throw "render failed" }
  node Tool\acceptance\qa_report.mjs History\runs\l6_text\final.mp4 --json History\runs\l6_text\qa.json | Select-Object -Last 3

  Write-Host "`n---- outputs ----" -ForegroundColor Cyan
  Write-Host "acceptance : History\loops\loop06\acceptance.md"
  Write-Host "subtitles  : History\subs\l2 (A) / l2_punct (B) / l2_agent (C)"
  Write-Host "sample clip: History\runs\l6_text\final.mp4"
  Write-Host "snapshot   : Prototype\loop6_text_quality\case_l2_textquality"
  if ($code -eq 0) { Write-Host "`nresult: PASS" -ForegroundColor Green; exit 0 }
  else { Write-Host "`nresult: FAIL (see acceptance output)" -ForegroundColor Red; exit 1 }
}
finally {
  Pop-Location
}
