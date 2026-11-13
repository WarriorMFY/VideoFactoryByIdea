<#
.SYNOPSIS
    Doc/Cards 卡片体系一致性校验。

.DESCRIPTION
    按 00-spec/card-spec.md 与 00-spec/reference-graph.md 的约束逐条检查：
      1. type 取值在 11 枚举内，且 name 以 type + "-" 开头
      2. 非模板卡的 name 与文件名一致（入库结构中文件名为 card.md 时比对父目录名）
      3. 九类基础卡零外链：正文不得出现其他卡名
      4. 主表严格两列，实例卡无 <> 残留
      5. composite 的 references 九槽位齐全、必填非空、type 匹配
      6. 表格行内无审美判断词

.EXAMPLE
    powershell -NoProfile -File .\Doc\Cards\00-spec\validate.ps1
#>
[CmdletBinding()]
param(
    [string]$Root
)

if (-not $Root) { $Root = Split-Path $PSScriptRoot -Parent }

$TYPES    = 'figure','face','style','action','camera','voiceover','ui','time-scale','anti','composite','prompt'
$BASIC    = 'figure','face','style','action','camera','voiceover','ui','time-scale','anti'
$SLOT     = [ordered]@{
    figures    = 'figure'
    faces      = 'face'
    moods      = 'style'
    actions    = 'action'
    cameras    = 'camera'
    voiceovers = 'voiceover'
    time_scales = 'time-scale'
    ui         = 'ui'
    anti       = 'anti'
}
$REQUIRED = 'figures','moods','actions','cameras'
$BANNED   = '好看','英俊','漂亮','帅气','有气质','高级感'

$script:fail = 0
$script:warn = 0

function Bad([string]$who, [string]$msg) {
    Write-Host ("[FAIL] {0} :: {1}" -f $who, $msg) -ForegroundColor Red
    $script:fail++
}
function Warn([string]$who, [string]$msg) {
    Write-Host ("[WARN] {0} :: {1}" -f $who, $msg) -ForegroundColor Yellow
    $script:warn++
}

if (-not (Test-Path $Root)) { Write-Host "目录不存在: $Root" -ForegroundColor Red; exit 2 }

$files = @(Get-ChildItem -Path $Root -Recurse -File -Filter *.md)
$cards = @{}
$rows  = @()

foreach ($f in $files) {
    $text = Get-Content $f.FullName -Raw -Encoding UTF8
    $fm = [regex]::Match($text, '(?s)\A---\r?\n(.*?)\r?\n---')
    if (-not $fm.Success) { continue }
    $yaml = $fm.Groups[1].Value
    $nm = [regex]::Match($yaml, '(?m)^name:\s*(\S+)\s*$')
    if (-not $nm.Success) { continue }

    $name = $nm.Groups[1].Value
    $type = [regex]::Match($yaml, '(?m)^type:\s*(\S+)\s*$').Groups[1].Value
    $tpl  = [regex]::IsMatch($yaml, '(?m)^is_template:\s*true\s*$')

    $rows += [pscustomobject]@{ File = $f; Text = $text; YAML = $yaml; Name = $name; Type = $type; Tpl = $tpl }

    if ($cards.ContainsKey($name)) {
        Bad $name ("重名，另见 " + $cards[$name].File.Name)
    } else {
        $cards[$name] = [pscustomobject]@{ Type = $type; File = $f }
    }
}

foreach ($c in $rows) {
    $nm = $c.Name
    if ($TYPES -notcontains $c.Type) { Bad $nm ("type 非法: " + $c.Type) }
    elseif (-not $nm.StartsWith($c.Type + '-')) { Bad $nm ("name 未以 type 前缀开头: " + $c.Type) }

    $stem = [IO.Path]::GetFileNameWithoutExtension($c.File.Name)
    if ($stem -eq 'card' -and $c.File.DirectoryName) { $stem = $c.File.Directory.Name }
    if (-not $c.Tpl -and $nm -ne $stem) { Bad $nm ("name 与文件名或入库目录名不一致: " + $c.File.Name) }

    $ln = 0
    foreach ($line in ($c.Text -split "\r?\n")) {
        $ln++
        $t = $line.Trim()
        if (-not ($t.StartsWith('|') -and $t.EndsWith('|') -and $t.Length -gt 2)) { continue }

        $cols = ($t.Trim('|') -split '\|').Count
        if ($cols -ne 2) { Bad $nm ("第 $ln 行表格非两列（$cols 列）") }
        if (-not $c.Tpl -and $t.Contains('<>')) { Bad $nm ("第 $ln 行存在未填充占位符 <>") }
        foreach ($w in $BANNED) {
            if ($t.Contains($w)) { Warn $nm ("第 $ln 行含审美判断词: " + $w) }
        }
    }
}

$names = @($cards.Keys)
foreach ($c in $rows) {
    if ($BASIC -notcontains $c.Type) { continue }
    foreach ($other in $names) {
        if ($other -eq $c.Name) { continue }
        if ($c.Text -match [regex]::Escape($other)) {
            Bad $c.Name ("零外链违规，出现卡名: " + $other)
        }
    }
}

foreach ($c in $rows) {
    if ($c.Type -ne 'composite') { continue }
    foreach ($k in $SLOT.Keys) {
        $m = [regex]::Match($c.YAML, '(?m)^\s+' + $k + ':\s*\[(.*?)\]')
        if (-not $m.Success) { Bad $c.Name ("references 缺槽位: " + $k); continue }

        $vals = @($m.Groups[1].Value -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
        if ($REQUIRED -contains $k -and $vals.Count -eq 0 -and -not $c.Tpl) { Bad $c.Name ("必填槽位为空: " + $k) }

        foreach ($v in $vals) {
            if (-not $cards.ContainsKey($v)) {
                Bad $c.Name ("引用了不存在的卡: " + $v)
            } elseif ($cards[$v].Type -ne $SLOT[$k]) {
                Bad $c.Name ("槽位类型不匹配: " + $k + " 需要 " + $SLOT[$k] + "，实际 " + $cards[$v].Type)
            }
        }
    }
}

$tplCount = @($rows | Where-Object { $_.Tpl }).Count
Write-Host ''
Write-Host ("卡片 {0} 张（其中模板 {1} 张），扫描 {2} 个 md 文件" -f $rows.Count, $tplCount, $files.Count)
if ($script:fail -eq 0) {
    Write-Host ("PASS：0 项失败，{0} 项警告" -f $script:warn) -ForegroundColor Green
    exit 0
}
Write-Host ("FAIL：{0} 项失败，{1} 项警告" -f $script:fail, $script:warn) -ForegroundColor Red
exit 1