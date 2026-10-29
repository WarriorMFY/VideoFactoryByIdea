# reproduce.ps1 - one-click reproduce of small loop 5 (bilingual karaoke subtitles with per-word highlight).
# Usage: run from repo root:  .\Prototype\loop5_karaoke_subs\reproduce.ps1
# Note: PowerShell/curl cannot reach the internet in this sandbox; network work is done by Node (see Tool/*.mjs).
# ASCII-only on purpose (Windows PowerShell 5.1 + no BOM issues).

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Push-Location $root
try {
  Write-Host "== 0/5 cwd: $($PWD.Path)" -ForegroundColor Cyan
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node not found; install Node.js 20+" }

  Write-Host "`n== 1/5 check inputs (deps + materials)" -ForegroundColor Cyan
  $need = @(
    'Workspace\bin\ffmpeg\ffmpeg.exe',
    'History\bench\l2_en\source.mp4',
    'History\subs\l2\cues.json',
    'History\subs\real3\cues.json',
    'History\runs\real3_subs\edits.json',
    'Workspace\assets\realspeech\sintel-trailer.mp4',
    'History\asr\transcript_real.json'
  )
  $missing = @()
  foreach ($p in $need) { if (-not (Test-Path $p)) { $missing += $p } }
  if ($missing.Count -gt 0) {
    Write-Host "missing inputs:" -ForegroundColor Yellow
    $missing | ForEach-Object { Write-Host "  - $_" }
    throw "run loop 1/2/3 reproduce scripts first (or provide your own cues.json)"
  }
  Write-Host "  inputs ok"

  Write-Host "`n== 2/5 build ASS (case E: TTS material, 101 words)" -ForegroundColor Cyan
  node Tool\subtitle\make_ass.mjs History\subs\l2\cues.json --out History\subs\karaoke\l2.ass --hl 33E6C8
  if ($LASTEXITCODE -ne 0) { throw "make_ass (E) failed" }

  Write-Host "`n== 3/5 render + verify case E" -ForegroundColor Cyan
  if (Test-Path History\runs\karaoke_l2) { Remove-Item -Recurse -Force History\runs\karaoke_l2 }
  node Tool\edit\vfactory.mjs History\bench\l2_en\source.mp4 --out History\runs\karaoke_l2 --title "双语 - 逐词高亮" --srt History\subs\karaoke\l2.ass
  if ($LASTEXITCODE -ne 0) { throw "render (E) failed" }
  $env:KARAOKE_DUR = (& Workspace\bin\ffmpeg\ffprobe.exe -v error -show_entries format=duration -of csv=p=0 History\runs\karaoke_l2\final.mp4).Trim()
  node Tool\acceptance\verify_karaoke.mjs History\runs\karaoke_l2\final.mp4 History\subs\karaoke\l2.ass --hl 33E6C8 --json History\runs\karaoke_l2\verify_karaoke.json
  $e = $LASTEXITCODE
  node Tool\acceptance\diagnose_flicker.mjs History\runs\karaoke_l2\final.mp4 History\subs\karaoke\l2.ass --json History\runs\karaoke_l2\flicker.json
  $eFlicker = $LASTEXITCODE
  node Tool\acceptance\qa_report.mjs History\runs\karaoke_l2\final.mp4 --json History\runs\karaoke_l2\qa.json | Select-Object -Last 3

  Write-Host "`n== 4/5 build ASS + render + verify case F (real footage, remapped timeline)" -ForegroundColor Cyan
  node Tool\subtitle\make_ass.mjs History\subs\real3\cues.json --edl History\runs\real3_subs\edits.json --out History\subs\karaoke\real3.ass --hl 33E6C8
  if ($LASTEXITCODE -ne 0) { throw "make_ass (F) failed" }
  if (Test-Path History\runs\karaoke_real3) { Remove-Item -Recurse -Force History\runs\karaoke_real3 }
  node Tool\edit\vfactory.mjs Workspace\assets\realspeech\sintel-trailer.mp4 --out History\runs\karaoke_real3 --title "真实素材 - 逐词高亮" --protect History\asr\transcript_real.json --srt History\subs\karaoke\real3.ass
  if ($LASTEXITCODE -ne 0) { throw "render (F) failed" }
  $env:KARAOKE_DUR = (& Workspace\bin\ffmpeg\ffprobe.exe -v error -show_entries format=duration -of csv=p=0 History\runs\karaoke_real3\final.mp4).Trim()
  node Tool\acceptance\verify_karaoke.mjs History\runs\karaoke_real3\final.mp4 History\subs\karaoke\real3.ass --hl 33E6C8 --json History\runs\karaoke_real3\verify_karaoke.json
  $f = $LASTEXITCODE
  node Tool\acceptance\diagnose_flicker.mjs History\runs\karaoke_real3\final.mp4 History\subs\karaoke\real3.ass --json History\runs\karaoke_real3\flicker.json
  $fFlicker = $LASTEXITCODE
  node Tool\acceptance\qa_report.mjs History\runs\karaoke_real3\final.mp4 --json History\runs\karaoke_real3\qa.json | Select-Object -Last 3

  Write-Host "`n== 5/5 summary" -ForegroundColor Cyan
  Write-Host "case E: highlight=$e  flicker=$eFlicker"
  Write-Host "case F: highlight=$f  flicker=$fFlicker"
  Write-Host "outputs: History\runs\karaoke_l2 , History\runs\karaoke_real3"
  if ($e -eq 0 -and $f -eq 0 -and $eFlicker -eq 0 -and $fFlicker -eq 0) { Write-Host "`nresult: PASS" -ForegroundColor Green; exit 0 }
  else { Write-Host "`nresult: FAIL (see per-case output above)" -ForegroundColor Red; exit 1 }
}
finally {
  Pop-Location
}
