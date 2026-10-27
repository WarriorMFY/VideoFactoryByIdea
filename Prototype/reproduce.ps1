# reproduce.ps1 — 一键复现小循环 1 的全部结论
# 用法：在仓库根目录执行 .\Prototype\reproduce.ps1
# 说明：本机 PowerShell 出网被策略拦截，所有网络动作都由 Node 完成（见 Tool/*.mjs 注释）。

$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  Write-Host "== 0/3 当前目录：$($PWD.Path)" -ForegroundColor Cyan
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "找不到 node，请先安装 Node.js 20+" }

  Write-Host "`n== 1/3 准备 FFmpeg（约 160MB，仅首次）" -ForegroundColor Cyan
  node Tool\bootstrap_ffmpeg.mjs
  if ($LASTEXITCODE -ne 0) { throw "FFmpeg 准备失败" }

  Write-Host "`n== 2/3 准备真实公开素材（失败则只跑合成用例）" -ForegroundColor Cyan
  node Tool\fetch_real_footage.mjs
  if ($LASTEXITCODE -ne 0) { Write-Host "  （真实素材获取失败，用例 B 将跳过）" -ForegroundColor Yellow }

  Write-Host "`n== 3/3 端到端验收（造用例→跑工厂→真值验收→成片质检）" -ForegroundColor Cyan
  node Tool\run_acceptance.mjs
  $code = $LASTEXITCODE

  Write-Host "`n---- 产物 ----" -ForegroundColor Cyan
  Write-Host "成片与交付包 : History\runs\bench01 , History\runs\real01"
  Write-Host "验收记录     : History\loops\loop01\acceptance.md"
  Write-Host "样例交付包   : Prototype\case_A_synth , Prototype\case_B_real"
  if ($code -eq 0) { Write-Host "`n结果：PASS" -ForegroundColor Green } else { Write-Host "`n结果：FAIL（见上方各步骤输出）" -ForegroundColor Red }
  exit $code
}
finally {
  Pop-Location
}
