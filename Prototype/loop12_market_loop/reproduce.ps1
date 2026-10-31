# reproduce.ps1 - one-click reproduce of small loop 12 (market <-> factory loop).
# Usage: run from repo root:  .\Prototype\loop12_market_loop\reproduce.ps1
# ASCII-only on purpose. Needs network for: Bilibili public APIs (read-only) and Edge TTS.
#
# 2026-10-31 续跑新增（continue-round additions）：9:16 vertical / cover self-check / market radar trend.
# 说明：竖屏与封面都从「无字幕干净成片」取素材，避免把已烧字幕拍进封面（实测踩过的坑）。

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Push-Location $root
$EP = 'Workspace\deliverables\ep01_editing_tips'
$FB = 'Prototype\loop12_market_loop\case_ep01\feedback.csv'
try {
  Write-Host "== 0/9 cwd: $($PWD.Path)" -ForegroundColor Cyan
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node not found; install Node.js 20+" }

  Write-Host "`n== 1/9 market recon (Bilibili public APIs, read-only)" -ForegroundColor Cyan
  node Tool\ops\recon_bilibili.mjs --out History\loops\loop12 --top 60
  if ($LASTEXITCODE -ne 0) { throw "recon failed (network?)" }
  node Tool\ops\recon_bilibili.mjs --out History\loops\loop12\niche --top 40 --keywords "TED 中英,编程教程 英文,Blender 教程 双语,剪辑教程 英文,纪录片 中英双字"

  Write-Host "`n== 2/9 build episode source (Edge TTS narration + CC-BY footage)" -ForegroundColor Cyan
  node Tool\ops\make_episode.mjs --script "$EP\script_en.txt" --out $EP
  if ($LASTEXITCODE -ne 0) { throw "make_episode failed" }

  Write-Host "`n== 3/9 ASR -> script alignment -> polished bilingual subs -> karaoke ASS" -ForegroundColor Cyan
  node Tool\subtitle\asr_vosk.mjs "$EP\source.mp4" --out "$EP\transcript.json"
  if ($LASTEXITCODE -ne 0) { throw "asr failed" }
  node Tool\subtitle\align_script.mjs "$EP\transcript.json" "$EP\ground_truth.json" --out "$EP\transcript_aligned.json"
  if ($LASTEXITCODE -ne 0) { throw "align failed" }
  node Tool\subtitle\make_subs.mjs "$EP\transcript_aligned.json" --out "$EP\subs" --punct --mt agent --zh-file "$EP\zh_agent.json" --glossary Tool\subtitle\glossary_zh.json --cps 20
  if ($LASTEXITCODE -ne 0) { throw "make_subs failed" }
  node Tool\subtitle\make_ass.mjs "$EP\subs\cues.json" --out "$EP\karaoke.ass" --hl 33E6C8
  if ($LASTEXITCODE -ne 0) { throw "make_ass failed" }

  Write-Host "`n== 4/9 render 16:9 (subtitles burned) + QA" -ForegroundColor Cyan
  node Tool\edit\vfactory.mjs "$EP\source.mp4" --out "$EP\render_16x9" --title "5个剪辑提速技巧" --srt "$EP\karaoke.ass" --width 1280 --height 720 --max-cut 0
  if ($LASTEXITCODE -ne 0) { throw "render failed" }
  node Tool\acceptance\qa_report.mjs "$EP\render_16x9\final.mp4" --json "$EP\render_16x9\qa.json"

  Write-Host "`n== 5/9 clean renders (NO subtitles) - required for cover frames and vertical" -ForegroundColor Cyan
  node Tool\edit\vfactory.mjs "$EP\source.mp4" --out "$EP\render_16x9_clean" --title "5个剪辑提速技巧" --width 1280 --height 720 --max-cut 0
  if ($LASTEXITCODE -ne 0) { throw "clean render failed" }
  node Tool\ops\make_vertical.mjs --video "$EP\render_16x9_clean\final.mp4" --out "$EP\render_9x16_clean"
  if ($LASTEXITCODE -ne 0) { throw "clean vertical failed" }

  Write-Host "`n== 6/9 9:16 vertical (blurred bg + centered picture + portrait karaoke subs)" -ForegroundColor Cyan
  node Tool\subtitle\make_ass.mjs "$EP\subs\cues.json" --out "$EP\karaoke_9x16.ass" --hl 33E6C8 --width 1080 --height 1920 --zh-size 68 --en-size 54 --wrap-zh 12 --wrap-en 34 --en-margin 265
  if ($LASTEXITCODE -ne 0) { throw "vertical ASS failed" }
  node Tool\ops\make_vertical.mjs --video "$EP\render_16x9_clean\final.mp4" --ass "$EP\karaoke_9x16.ass" --out "$EP\render_9x16" --title "5个剪辑提速技巧"
  if ($LASTEXITCODE -ne 0) { throw "vertical render failed" }
  node Tool\acceptance\qa_report.mjs "$EP\render_9x16\final_9x16.mp4" --json "$EP\render_9x16\qa.json"

  Write-Host "`n== 7/9 covers: auto-pick frame -> generate -> self-check (both aspects)" -ForegroundColor Cyan
  $at16 = ((node Tool\ops\pick_cover_frame.mjs --video "$EP\render_16x9_clean\final.mp4" --count 12) -join "`n") -replace '(?s).*AT=([\d.]+).*','$1'
  if (-not $at16) { throw "pick_cover_frame failed" }
  node Tool\ops\make_cover.mjs --video "$EP\render_16x9_clean\final.mp4" --out "$EP\cover_16x9.jpg" --w 1280 --h 720 --at $at16 --title "5 个剪辑提速技巧" --sub "英文原声 · 中英双语 · 逐词高亮" --tag "工厂样片"
  if ($LASTEXITCODE -ne 0) { throw "cover 16:9 failed" }
  node Tool\ops\make_cover.mjs --video "$EP\render_9x16_clean\final_9x16.mp4" --out "$EP\cover_9x16.jpg" --w 1080 --h 1920 --at $at16 --title "5 个剪辑提速技巧" --sub "英文原声 · 中英双语 · 逐词高亮" --tag "工厂样片"
  if ($LASTEXITCODE -ne 0) { throw "cover 9:16 failed" }
  node Tool\ops\check_cover.mjs --cover "$EP\cover_16x9.jpg" --expect 16:9 --json "$EP\cover_16x9.check.json" --md "$EP\cover_16x9.check.md"
  node Tool\ops\check_cover.mjs --cover "$EP\cover_9x16.jpg" --expect 9:16 --json "$EP\cover_9x16.check.json" --md "$EP\cover_9x16.check.md"

  Write-Host "`n== 8/9 market radar: seed baseline (if needed) + collect one snapshot + diff" -ForegroundColor Cyan
  if (-not (Test-Path History\ops\radar\index.json)) {
    node Tool\ops\radar.mjs --seed History\loops\loop12\market_raw.json
  }
  node Tool\ops\radar.mjs
  if ($LASTEXITCODE -ne 0) { throw "radar failed (network?)" }

  Write-Host "`n== 9/9 feedback tracker (empty table must say 'pending') + acceptance (12 checks)" -ForegroundColor Cyan
  node Tool\ops\track_feedback.mjs --csv $FB --out Prototype\loop12_market_loop\case_ep01\feedback_report.md
  node Tool\acceptance\run_market_loop_acceptance.mjs
  $code = $LASTEXITCODE

  Write-Host "`n---- outputs ----" -ForegroundColor Cyan
  Write-Host "market    : History\loops\loop12\market_report.md"
  Write-Host "radar     : History\ops\radar\report-latest.md (+ snapshots\)"
  Write-Host "delivery  : $EP (final.mp4 / final_9x16.mp4 / covers / srt / ass / publish.md)"
  Write-Host "acceptance: History\loops\loop12\acceptance.md (12 checks)"
  Write-Host "snapshot  : Prototype\loop12_market_loop (case_ep01 / case_ep01_vertical / case_market)"
  Write-Host "`nnext step : upload with your own account, then fill $FB (T+1/T+3/T+7)" -ForegroundColor Yellow
  if ($code -eq 0) { Write-Host "`nresult: PASS" -ForegroundColor Green; exit 0 }
  else { Write-Host "`nresult: FAIL (see acceptance output above)" -ForegroundColor Red; exit 1 }
}
finally {
  Pop-Location
}
