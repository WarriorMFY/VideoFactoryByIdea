# reproduce.ps1 - one-click reproduce of small loop 8 (proofread write-back loop).
# Usage: run from repo root:  .\Prototype\loop8_review_loop\reproduce.ps1
# ASCII-only on purpose (Windows PowerShell 5.1 + no BOM issues).

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Push-Location $root
try {
  Write-Host "== 0/4 cwd: $($PWD.Path)" -ForegroundColor Cyan
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node not found; install Node.js 20+" }

  Write-Host "`n== 1/4 check inputs" -ForegroundColor Cyan
  $need = @('History\subs\l2_agent\cues.json', 'History\bench\l2_en\source.mp4')
  $missing = @()
  foreach ($p in $need) { if (-not (Test-Path $p)) { $missing += $p } }
  if ($missing.Count -gt 0) {
    Write-Host "missing inputs:" -ForegroundColor Yellow
    $missing | ForEach-Object { Write-Host "  - $_" }
    throw "run loop2/loop6 reproduce first (they produce the polished cues + bench clip)"
  }
  Write-Host "  inputs ok"

  Write-Host "`n== 2/4 acceptance (export -> identity write-back -> 4 real edits -> 3 rejections -> re-render)" -ForegroundColor Cyan
  node Tool\acceptance\run_review_acceptance.mjs --force
  $code = $LASTEXITCODE

  Write-Host "`n== 3/4 show what the reviewer changed" -ForegroundColor Cyan
  node -e "const r=require('./History/runs/l8_review/applied_edited/review_report.json'); console.log('rows',r.rows,'changed',r.changed,'char_delta',r.char_delta); const c=require('./History/runs/l8_review/applied_edited/cues.json'); for(const x of c.cues){ if(x.zh_machine) console.log('  before:',x.zh_machine,'\n  after :',x.zh); }"
  if ($LASTEXITCODE -ne 0) { throw "report dump failed" }

  Write-Host "`n== 4/4 outputs" -ForegroundColor Cyan
  Write-Host "acceptance : History\loops\loop08\acceptance.md"
  Write-Host "review csv : History\runs\l8_review\export\review.csv (edit the zh column, then apply)"
  Write-Host "applied    : History\runs\l8_review\applied_edited\{cues.json,bilingual.srt}"
  Write-Host "sample clip: History\runs\l8_review\final.mp4"
  Write-Host "snapshot   : Prototype\loop8_review_loop\case_l2_review"
  if ($code -eq 0) { Write-Host "`nresult: PASS" -ForegroundColor Green; exit 0 }
  else { Write-Host "`nresult: FAIL (see acceptance output above)" -ForegroundColor Red; exit 1 }
}
finally {
  Pop-Location
}
