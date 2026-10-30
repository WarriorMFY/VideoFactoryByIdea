# reproduce.ps1 - one-click reproduce of small loop 12 (market <-> factory loop).
# Usage: run from repo root:  .\Prototype\loop12_market_loop\reproduce.ps1
# ASCII-only on purpose. Needs network for: Bilibili public APIs (read-only) and Edge TTS.

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Push-Location $root
$EP = 'Deliverables\ep01_editing_tips'
try {
  Write-Host "== 0/6 cwd: $($PWD.Path)" -ForegroundColor Cyan
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node not found; install Node.js 20+" }

  Write-Host "`n== 1/6 market recon (Bilibili public APIs, read-only)" -ForegroundColor Cyan
  node Tool\ops\recon_bilibili.mjs --out History\loops\loop12 --top 60
  if ($LASTEXITCODE -ne 0) { throw "recon failed (network?)" }
  node Tool\ops\recon_bilibili.mjs --out History\loops\loop12\niche --top 40 --keywords "TED 中英,编程教程 英文,Blender 教程 双语,剪辑教程 英文,纪录片 中英双字"

  Write-Host "`n== 2/6 build episode source (Edge TTS narration + CC-BY footage)" -ForegroundColor Cyan
  node Tool\ops\make_episode.mjs --script "$EP\script_en.txt" --out $EP
  if ($LASTEXITCODE -ne 0) { throw "make_episode failed" }

  Write-Host "`n== 3/6 ASR -> script alignment -> polished bilingual subs -> karaoke ASS" -ForegroundColor Cyan
  node Tool\subtitle\asr_vosk.mjs "$EP\source.mp4" --out "$EP\transcript.json"
  if ($LASTEXITCODE -ne 0) { throw "asr failed" }
  node Tool\subtitle\align_script.mjs "$EP\transcript.json" "$EP\ground_truth.json" --out "$EP\transcript_aligned.json"
  if ($LASTEXITCODE -ne 0) { throw "align failed" }
  node Tool\subtitle\make_subs.mjs "$EP\transcript_aligned.json" --out "$EP\subs" --punct --mt agent --zh-file "$EP\zh_agent.json" --glossary Tool\subtitle\glossary_zh.json --cps 20
  if ($LASTEXITCODE -ne 0) { throw "make_subs failed" }
  node Tool\subtitle\make_ass.mjs "$EP\subs\cues.json" --out "$EP\karaoke.ass" --hl 33E6C8
  if ($LASTEXITCODE -ne 0) { throw "make_ass failed" }

  Write-Host "`n== 4/6 render 16:9 (no cut, subtitles burned) + QA" -ForegroundColor Cyan
  node Tool\edit\vfactory.mjs "$EP\source.mp4" --out "$EP\render_16x9" --title "5个剪辑提速技巧" --srt "$EP\karaoke.ass" --width 1280 --height 720 --max-cut 0
  if ($LASTEXITCODE -ne 0) { throw "render failed" }
  node Tool\acceptance\qa_report.mjs "$EP\render_16x9\final.mp4" --json "$EP\render_16x9\qa.json"

  Write-Host "`n== 5/6 cover + feedback tracker (empty table must say 'pending')" -ForegroundColor Cyan
  node Tool\ops\make_cover.mjs --video "$EP\render_16x9\final.mp4" --out "$EP\cover_16x9.jpg" --title "5 个剪辑提速技巧" --sub "英文原声 · 中英双语 · 逐词高亮" --tag "工厂样片" --at 2.2
  if ($LASTEXITCODE -ne 0) { throw "cover failed" }
  node Tool\ops\track_feedback.mjs --csv "$EP\feedback.csv" --out "$EP\feedback_report.md"

  Write-Host "`n== 6/6 acceptance (9 checks)" -ForegroundColor Cyan
  node Tool\acceptance\run_market_loop_acceptance.mjs
  $code = $LASTEXITCODE

  Write-Host "`n---- outputs ----" -ForegroundColor Cyan
  Write-Host "market    : History\loops\loop12\market_report.md"
  Write-Host "delivery  : $EP (final.mp4 / cover / srt / ass / publish.md / feedback.csv)"
  Write-Host "acceptance: History\loops\loop12\acceptance.md"
  Write-Host "snapshot  : Prototype\loop12_market_loop"
  Write-Host "`nnext step : upload with your own account, then fill $EP\feedback.csv (T+1/T+3/T+7)" -ForegroundColor Yellow
  if ($code -eq 0) { Write-Host "`nresult: PASS" -ForegroundColor Green; exit 0 }
  else { Write-Host "`nresult: FAIL (see acceptance output above)" -ForegroundColor Red; exit 1 }
}
finally {
  Pop-Location
}
