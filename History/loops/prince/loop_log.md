# 小循环：最新名人演讲全链路实测（2026-11-01 16:11 发起）

人指令：开一轮新循环，发布 1 条"最新名人演讲视频"，跑通整个链路实际测验。
→ 发布为本人显式发起；TED CC BY-NC-ND 授权状态沿用 loop14 的记录（net_probe.md），
  风险由人承担（与 2026-11-01 08:50 授权变更同口径）。

## 选片过程（探测数据见本目录探测脚本输出）

1. `www.ted.com/talks?sort=newest` → `__NEXT_DATA__.props.pageProps.talks` 可解析（24 条）
2. 最新 24 条里仅 1 条有官方 zh-cn 字幕（Philip Jameson，心理学题材，偏离账号定位）
3. `topics/ai?sort=newest` 16 条里 4 条有官方 zh-cn：
   - Sajan Saini 6min（09-29）、Ari Matusiak 13min（09-17）
   - **Matthew Prince 13min（08-18）← 选它：讲者最知名（Cloudflare CEO），AI 主题**
   - Reed Hastings + Sal Khan 16min（07-20）无官方中译，需全篇自译，本轮不选
4. pm=11955，素材 88MB / 761s，en 296 cue / zh-cn 278 cue

## 链路执行记录

| 步骤 | 结果 |
| --- | --- |
| ted_fetch | ✓ 88MB talk_720p.mp4 + 双语 cues（+264s） |
| trace_text（新建） | ✓ 补齐 README 引用但缺失的脚本；修了桶内中文重复拼接 bug |
| ted_episode | ✓ 413s 全流程：ASR 2386 词（conf 0.955）→ 偏移 3.449s → 中译 276/276 命中 → 删减 6 处 → final.mp4 756.4s |
| kb_audit 长片 | sd=0.326 CV=82.3% 顿挫 1507（已发布样例长片基线 sd=0.297 CV=134.9% 顿挫 6655 → 同水平，合格） |
| 目检 | 250s 帧：中文行 + 英文逐词高亮均正常（spot_250.jpg） |
| make_cover | ✓ 第 3 版合格（前两版标题溢出：fs 对两行统一生效，latin+CJK 长行必溢出——改两行纯中文短句） |
| publish | 进行中（127MB 上传） |
| digest | spec 已写（30 段 7 章，帧位经 frame_sheet 30 格复核无黑帧），待长片 BV 回填后渲染 |

## 过程新发现（待沉淀）

- `frame_sheet --times` 每格带时间戳，30 帧一次目检可行，效率高。
- 封面标题宽度公式：CJK≈fontsize，latin≈0.55×fontsize；fs 0.16 时单行 CJK 上限约 11 字。

## 发布与质检（16:30 收尾）

| 项 | 值 |
| --- | --- |
| 投稿 | **BV1wFxs66EpB**《Cloudflare CEO：AI 正在杀死互联网的流量生意》 |
| 回执 | aid=117540235773594，add 接口 code=0；tid=231 + htype=1011 请求体留痕 ✓ |
| 回读 | state=0 开放浏览，时长 757s（与成片 756.4s 吻合 → 上传完整），tid=231 ✓ |
| 标签 | 互联网/AI/人工智能/Cloudflare/TED/科技（B 站自动补的「流量」被删） |
| 摘要 | ep_prince_digest/final.mp4 2:56，kb_audit sd=0.224 合格，片尾卡正确显示原片 BV |
| 风险 | publish 日志「表单就绪(0s)」竞态：本轮靠回读兜底证实完整；此信号必须始终回读校验 |

## 本轮耗时

16:11 发起 → 16:30 收尾，全链路约 19 分钟（选片 6 + 素材 4.5 + 长片 7 + 摘要 4 + 发布 1 + 质检 2 并行穿插）。

## 摘要片发布（16:42，人指令「摘要也发」）

| 项 | 值 |
| --- | --- |
| 投稿 | **BV1cwxs6uECu**《Cloudflare CEO TED 3分钟摘要：AI 正在杀死互联网的流量生意》2:56 |
| 回执 | aid=117540286105122，add code=0；回读 state=0 / 176s / tid=231 ✓ |
| 封面 | make_cover 第 1 版合格（TED 红舞台全景 + 黄字两行，沿用长片第 3 版的排版规律） |
| 双向导航 | ① 摘要置顶 = 7 章节跳转表（rpid 322595763280）② 长片置顶 = 摘要导流（rpid 322595768304） |
| 导流文案 | 沿用 ep_a 格式；置顶表由 manifest.json chapters 自动生成（digest_t → src 映射） |
