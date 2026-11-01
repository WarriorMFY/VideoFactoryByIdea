# 小循环 15 · 能力迁移：把 loop14 链路打包成独立 TalkFactory

> 开轮：2026-11-01 14:52，人指令（原话大意）：「把"素材 → 双语长片 → 3 分钟摘要 → 双向导航"这条能力
> 迁移出去，将当前工作目录中与该能力相关的所有目录文件全部打包出去，新开一轮循环做；
> 导出目录包保持和当前根目录类似但更简化；先核对最终导出包的真实结构，确认后再开干。」
>
> 人已确认四项决策：① 依赖二进制随包（离线即跑）；② 样例成片与线上版完全一致（两条 mp4 都带）；
> ③ 两个缺口（视频抓取、写稿辅助）本轮补上；④ 产物落同级新目录 + 仓库留构建脚本。

## 能力定义（打包边界）

```text
TED 演讲 → ①素材入袋(ted_fetch/ted_subs) → ②长片(ted_episode: ASR→偏移→对齐→中译→卡拉OK→渲染)
        → ③摘要(make_digest: spec→TTS→Ken Burns→导航角标) → ④封面/选帧/审计
        → ⑤发布+双向导航(publish_bilibili/bili_comment)
```

判定口径：`Prototype/loop14_talk/` 十个产物目录里，只有这条链路用到的进包；其余 13 轮全部留源仓库。

## 工作包

### `[x]` WP1 · 盘点与结构确认
- 25 个脚本 / 205KB 代码 + 7 篇 .md；能力无关项清单（acceptance/bench/Git、ops 里 8 个反馈脚本、9.2G 旧 Prototype、3.4G tmp）。
- 结构草案经人核对（本文件头部四项决策即核对结论）。

### `[x]` WP2 · 补缺口（两个新工具）
- `Tool/ops/ted_fetch.mjs`：`--pm` → f11+f12 混流 `-c copy` → talk_720p.mp4 + 官方双语字幕 + talk.meta.json。冒烟✓（pm 9260，12s 限长 + en 字幕 243 cue，23s）。
  - 顺带踩出新坑 16：本机带 http_proxy，ffmpeg `-protocol_whitelist` 必须含 `httpproxy`。
- `Tool/ops/trace_text.mjs`：cue → 带时间戳分桶全文（写摘要稿原料），`--bilingual`/`--from/--to`。冒烟✓（李开复 261 cue → 45s 桶全文）。

### `[x]` WP3 · 建包 + 静态校验
- 构建：`Prototype/loop15_export/build_package.mjs`（seed 文档 + 32 工具 + loop14 档案 + EP-A 完整样例 + deps 随包 596MB）→ `../TalkFactory/`。
- 校验：`Prototype/loop15_export/verify_package.mjs` —— 72 必需文件 / 全 .mjs `node --check` / 源仓库路径零泄漏（机器产物绝对路径构建时改写为包内相对） / 依赖四件套在位（ffmpeg、libvosk.dll、vosk 模型、playwright 包内自持）。
- 新写文档：包根 README（30 秒上手 + 摘要写法）、Idea/Idea.md（含 CC BY-NC-ND 红线，待人终审）、Tool/Tool.md（三条最短路径）、CircleLog 模板、样例 README、.gitignore。

### `[x]` WP4 · 包内冒烟
- 随包 spec 原地重渲染摘要（227s 跑完）：170.90s 成片，与随包成片 170.9s 一致。
- kb_audit：新渲染 sd=0.2952 ↔ 随包成片 sd=0.2978（同一条合格基线，差异来自 TTS 重合成的毫秒级抖动）。
- 抽帧目检：片头卡 / 章节角标 / 右上原片时间角标 / 中文字幕 / 片尾导流卡全部正常。
- 产物留证：`TalkFactory/Workspace/tmp/_smoke_digest/`（final.mp4 + check_strip.jpg；.work 中间件已清）。
- 验收线全部达成：渲染零失败、sd ≤ 0.30、音画时长差 < 0.05s（实测 0.02s）。

### `[x]` WP5 · 交付与留痕
- 包结构快照写回源仓库（本文件 + publish_log 不涉及）；CircleLog 15 轮条目。
- 已知边界记录：素材源片（254MB）不入包（CC BY-NC-ND 再分发 + 体积），冒烟用临时拷贝。

## 交付实测（2026-11-01 15:15）

- 落点：`F:/AgentWorkArea/WorkBuddy/TalkFactory/`，**631 MB / 443 文件**。
  构成：Tool 352K（32 文件）· History 406K（loop14 档案 16 文件）· Idea 4K ·
  Prototype 267M（EP-A 长片 238M + 摘要 29M + 全部物料）· Workspace 364M（deps 331M 离线自持 + 冒烟留证 32M）。
- 静态校验 `verify_package.mjs`：72/72 必需文件、全部 .mjs 语法过、源仓库路径零泄漏、依赖四件套在位。
- 冒烟校验：随包 spec 重渲染摘要成功（227s），质量与随包成片一致（sd 0.295 vs 0.298）。

## 遗留 / 风险

- Idea/Idea.md 为代拟稿，**包的红线最终以人改写为准**。
- 样例成片 278MB 随包：若走 git 托管需另议（.gitignore 默认忽略 mp4，磁盘保留）。
- B 站发布环节仍需扫码登录（账号安全边界，不可离线预置）。
