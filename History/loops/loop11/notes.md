# 小循环 11 · 过程笔记（知识型内容链路）

## 一句话

把"这类内容能做好"变成三件可运行的东西：**内容分诊器**（0.95 vs 0.17 把教学片和电影分开）、
**数值/单位规范化**（`minus sixty sixteen l u fs` → `−16 LUFS`，且幂等、不误伤）、
**术语自动候选**（长片 61 个、l2 挑出单位术语）。验收 8/8 PASS，小循环 6 的文本验收复跑仍 PASS。

## 做了什么

| 组件 | 作用 |
| --- | --- |
| `Tool/subtitle/classify_content.mjs` | 内容分诊：语音覆盖/置信度/**配乐占比**/短句占比/句长/术语密度 → `knowledge`/`mixed`/`narrative` + 当前策略建议（CPS、翻译后端、是否需要人工校对） |
| `Tool/lib/units.mjs` | 数值与单位规范化（源句中英双向）：LUFS/dB/Mbps/fps/4K/分辨率；中文侧把"负十六 LUFS""零下16LUFS""-16 LUFS"统一成 `−16 LUFS` |
| `Tool/subtitle/normalize_units.mjs` | 把规范化应用到 transcript（只改句子文本，**不动词级时间戳**），输出替换留痕 |
| `Tool/subtitle/term_candidates.mjs` | 术语候选：缩写/单位、专名、高频长词、高频二元短语；标注是否已在术语表 |
| `Tool/acceptance/run_knowledge_acceptance.mjs` | 8 项判据的一键验收（含对照组与幂等检查） |

## 关键设计与踩坑

1. **分诊信号换过一次**：最初用"能量动态范围（p90−p10）"想区分"有没有配乐"，实测**判反**——
   TTS 的词间起伏大（18dB）、配乐反而平稳（9dB）。改成 **`music_ratio` = 有声但无词的帧占比**：
   l2 = 0%（口播时才有声）、TOS = 73%（大量音乐/音效），方向稳定。
2. **术语表源端纠错必须一次性替换**：逐条 `replace` 会二次命中刚替换的文本 ——
   `l u fs` → `LUFS` 之后，规则 `luf` → `LUFS` 又命中 `LUFS` 前缀，产出 `LUFSS`。
   改成"单正则交替 + 按长度降序"。
3. **规范化要幂等**：第二遍必须 0 处改动，否则"每次重跑字幕都在变"，没法审。
4. **不要过度数字化**：只在单位语境（LUFS/dB/Mbps/fps/分辨率）动数字，`two hours` 保持原样 —— 验收里专门有一条"不误伤"检查。
5. **中英两侧都要管**：机翻常把 `−16 LUFS` 写成 `-16 LUFS`（ASCII 连字符）或"负十六 LUFS"，
   所以翻译后的 `canonicalizeZh()` 也跑一遍，并把每次替换记进 `cues.json.unit_fixes`。
6. 对照组用 `--no-unit-norm` 才有意义：make_subs 默认已规范化，如果不给这个开关，两条路径都会变对，看不出差别。

## 数据

| 项 | 数值 |
| --- | --- |
| 分诊 | l2 `knowledge` 0.95 ／ TOS `narrative` 0.174 |
| music_ratio | l2 0% ／ TOS 73% |
| 规范化 | 2 句 / 3 处替换；二次运行 0 处（幂等）；`two hours` 未被数字化 |
| 中文侧 | 规范化后 `−16 LUFS`、`15 Mbps`；对照组无 `−16 LUFS` 且出现"负十六/卢夫斯"式错误 |
| 术语候选 | 长片 61 个（含 "look celia" 这类短语）；l2 31 个，含单位术语 |

## 已知限制

- 分诊是启发式、单片段调参，阈值可能随素材漂移（所以输出里写清"当前版本的建议"，不是判定内容类型）；
- 术语候选对**全小写 ASR 输出**只能靠频率，专名识别不了（转写后大写才有专名信号）；
- 数值规范化只覆盖可枚举单位（LUFS/dB/Mbps/fps/4K/分辨率），货币/百分比/时间未做；
- 中文数字转换只处理 0–999（"一百二十"可以，"一万"不行）。

## 复现

```powershell
node Tool\acceptance\run_knowledge_acceptance.mjs --force
```
