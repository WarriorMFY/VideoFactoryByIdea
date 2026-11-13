$ErrorActionPreference = 'Stop'
Set-Location 'd:\Data\QoderWorkArea\CardVideoMethod'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$prompt = (Get-Content 'Log\Circle1\prompt.txt' -Encoding UTF8)[0].Trim()
$key = (Select-String -Path 'AGENTS.md' -Pattern 'apikey:\s*(\S+)').Matches[0].Groups[1].Value

$env:RUNNINGHUB_API_KEY = $key
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONPATH = (Resolve-Path 'Skill\RHClaw\runninghub\scripts').Path

Write-Host ("PROMPT_LEN=" + $prompt.Length)

$out = 'Log\Circle1\output\style-dark-fantasy_01.png'
python 'Workspace\_rh_app.py' --run 2046794551444119554 --node ("18:prompt=" + $prompt) --instance-type lite -o $out

Write-Host ("EXIT=" + $LASTEXITCODE)