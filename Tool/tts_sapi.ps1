param(
  [Parameter(Mandatory = $true)][string]$InputFile,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string]$Voice = "Microsoft Zira Desktop - English (United States)",
  [int]$Rate = 0
)
# tts_sapi.ps1 - offline TTS via Windows SAPI5 (no network, no model download).
# Purpose: build test material for "foreign-language video + Chinese subtitles" with known text.
# NOTE: host is Windows PowerShell 5.1; this file must stay ASCII-only (or be saved as UTF-8 with BOM),
#       otherwise PS 5.1 mis-parses it as ANSI. Keep comments in English for safety.
# Output: <OutDir>\000.wav ... one file per non-empty line of InputFile.

$ErrorActionPreference = 'Stop'
$lines = Get-Content -LiteralPath $InputFile -Encoding UTF8 | Where-Object { $_.Trim().Length -gt 0 }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$voiceObj = New-Object -ComObject SAPI.SpVoice
$voiceObj.Rate = $Rate
$tokens = $voiceObj.GetVoices()
$selected = $null
for ($i = 0; $i -lt $tokens.Count; $i++) {
  if ($tokens.Item($i).GetDescription() -like "*$Voice*") { $selected = $tokens.Item($i); break }
}
if (-not $selected) {
  $avail = @(0..($tokens.Count - 1) | ForEach-Object { $tokens.Item($_).GetDescription() }) -join '; '
  throw "voice not found: $Voice (available: $avail)"
}
$voiceObj.Voice = $selected

$n = 0
foreach ($line in $lines) {
  $wav = Join-Path $OutDir ('{0:D3}.wav' -f $n)
  $stream = New-Object -ComObject SAPI.SpFileStream
  # 3 = SSFMCreateForWrite (creating a new file); passing 22 throws "Value does not fall within the expected range"
  $stream.Open($wav, 3, $false)
  $voiceObj.AudioOutputStream = $stream
  $voiceObj.Speak($line) | Out-Null
  $stream.Close()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($stream) | Out-Null
  Write-Host ('[tts] {0} <- {1}' -f (Split-Path $wav -Leaf), $line)
  $n++
}
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($voiceObj) | Out-Null
Write-Host "[tts] done: $n files -> $OutDir"
