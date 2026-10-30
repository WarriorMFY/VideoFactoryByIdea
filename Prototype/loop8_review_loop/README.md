# 小循环 8 · 校对回写闭环：人能改、改完能回灌时间轴

> 一句话：机翻字幕出来之后，**人在一张表里改中文、改完直接回写**，时间码/重映射/逐词高亮全都对得上，
> 并且任何"删了一行 / 动了时间码 / 留空译文"的操作都会被拦住而不是静默错位。

## 1. 为什么要有这一轮

到小循环 7 为止，流水线能自动出"能看懂"的字幕，但发布级必须是**人改过的**。
问题在于：`cues.json` 才是下游（剪辑重映射、逐词高亮、烧入）的共同输入，
而人改的天然载体是 SRT/表格。**没有回写，改了也白改。**

## 2. 两个新工具 + 一条闭环

| 工具 | 做什么 |
| --- | --- |
| `Tool/subtitle/export_review.mjs` | `cues.json` → **`review.csv`**（列：idx / start / end / en / zh / cps_zh / flags / reviewer_note）。自动给人标出可疑处：`cps_over`（读太快）、`zh_long`（太长）、`en_residual`（残留英文）、`sp_gap`（中英之间缺空格）、`empty_zh`（漏译） |
| `Tool/subtitle/apply_review.mjs` | `review.csv` → **`cues.json` + 三份 SRT**。逐项校验：行数、idx 顺序、时间码是否被改、en 是否被改、译文是否留空；不合格就**列出行号拒绝写入**，不产出半成品 |

闭环（全程本地、无额外依赖）：

```powershell
node Tool\subtitle\export_review.mjs History\subs\l2_agent\cues.json --out work\review
#  ← 人工只改 zh 列（Excel / VSCode / 任何编辑器）
node Tool\subtitle\apply_review.mjs  History\subs\l2_agent\cues.json work\review\review.csv --out work\reviewed
node Tool\edit\vfactory.mjs 原片.mp4 --out out\final --srt work\reviewed\bilingual.srt
```

## 3. 验收（5 项硬判据，全过才 PASS）

| 判据 | 结果 |
| --- | --- |
| 恒等回写：导出→不改→回写，`cues.json` 一致 | ✅ 13/13 |
| 恒等回写：`bilingual.srt` **逐字节一致** | ✅ |
| 真实改动只落在指定行（3,9,10,12），其余一字不动 | ✅ |
| 删行 / 改时间码 / 清空译文 → 全部被拒绝并报行号 | ✅ 3/3 |
| `--allow-retime` 显式放行改时间码，并记进报告 | ✅ |
| 回写后的字幕能直接出片 | ✅ QA PASS，−16.2 LUFS |

改动示例（都是真实会遇到的毛病）：

| 行 | 机器产出 | 人工改成 |
| --- | --- | --- |
| 3 | 今天我会演示三个简单的小技巧， | 今天演示三个小技巧， |
| 9 | 第三，把音频响度归一到 −16 LU | 第三，把音频响度归一到 |
| 10 | FS，这是在线视频平台的标准。 | −16 LUFS，这是在线视频平台的标准。 |
| 12 | 而且永远不要相信第一次渲染。 | 而且别信第一次渲染。 |

注意第 9/10 行：`−16 LUFS` 被"按宽度切行"切成了 `…−16 LU` + `FS，…`。
这种毛病人眼一眼能看出来，机器很难自己发现 —— 回写闭环的意义就在这。

被拒绝时人看到的是这样的（确认码不是猜的）：

```text
行数不一致：cues 13 行 vs CSV 12 行（是不是删了/多了一行？）
时间码被改动（2.055→3 / 4.08→4.08）；确认要新时间码请加 --allow-retime
zh 为空（漏译必须显式写内容，不能留空）
```

## 4. 顺带的重构

- `Tool/lib/srt.mjs`：SRT 写出统一成一份实现，`make_subs` 与 `apply_review` 共用
  （否则"生成端"和"回写端"格式会悄悄分叉，人工比对时会看到假差异）。
- `Tool/lib/csv.mjs`：极简 CSV 读写（引号内逗号/换行、双引号转义、BOM、CRLF），导出与回写同口径。

## 5. 怎么复现

```powershell
.\Prototype\loop8_review_loop\reproduce.ps1
```

前置：`History\subs\l2_agent\cues.json`（小循环 6 的精译版字幕）+ `History\bench\l2_en\source.mp4`（小循环 2 的素材）。

## 6. 限制（诚实版）

- 只支持**改中文**（`zh` 列）。改英文需要 `--allow-en-edit`，因为 `en` 是重映射与逐词高亮的锚点，改了会错位。
- 改时间码要 `--allow-retime`，且会记进 `review_report.json`；这是"故意麻烦一点"，防止手滑整体错位。
- 表格是 CSV，不带样式；超长片（几千行）在 Excel 里会慢，但仍然是可用的。
- 还没做"多版本对照"（机翻版 / 精译版 / 校对版同屏 diff），下一轮可加。
