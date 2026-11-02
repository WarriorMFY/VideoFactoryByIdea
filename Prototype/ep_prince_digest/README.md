# ep_prince — 小循环：最新名人演讲全链路实测（2026-11-01）

> 人指令：「开一轮新循环，发布 1 条'最新名人演讲视频'，跑通整个链路实际测验」。
> 选片：**Matthew Prince（Cloudflare 联合创始人兼 CEO）TED《How AI is breaking the internet (and what to do about it)》**，2026-08-18 上线，pm=11955。

## 成品

| 片 | 文件 | 时长 | 线上 |
| --- | --- | --- | --- |
| 长片（双语逐词高亮） | `../ep_prince/final.mp4` | 12:36 | **BV1wFxs66EpB**（tid=231，审核后开放浏览） |
| 摘要（中文解说） | `ep_prince_digest/final.mp4` | 2:56 | **未发布**（按"发布 1 条"指令，等人反馈） |
| 封面（长片） | `../ep_prince/cover.jpg` | — | 已随投稿上传 |

摘要抽检（本目录）：片头卡 `History/loops/prince/dg_1.jpg`、导航角标 `dg_40.jpg`、片尾卡 `dg_172.jpg`（正确显示原片 BV 号）。

## 质检记录

- 长片：ASR 2386 词（conf 0.955）；官方字幕偏移标定 3.449s；中译直灌 **276/276 全命中**；自动删减 6 处；250s 目检双语+卡拉OK正常；kb_audit sd=0.326（已发布样例长片基线 0.297，同水平）。
- 摘要：30 段解说 TTS 150.8s；帧对齐最大偏差 31ms；kb_audit **sd=0.224 < 0.30 合格**；帧位经 frame_sheet 30 格复核无黑帧。

## 复现（换一条新演讲照抄）

```bash
# 1) 选片：从 ted.com 拿 slug → 页面里解析 project_masters id（pm）
#    topics/ai?sort=newest 可按主题筛；注意大部分新片没有官方 zh-cn（本轮实测 16 条里仅 4 条）
# 2) 素材入袋
node Tool/ops/ted_fetch.mjs --pm 11955 --out Workspace/tmp/ted_prince
# 3) 长片（~7 分钟）
node Tool/ops/ted_episode.mjs --dir Workspace/tmp/ted_prince --out Prototype/ep_prince
# 4) 写稿原料（本轮新建的脚本，修了桶内中文重复 bug）
node Tool/ops/trace_text.mjs --dir Workspace/tmp/ted_prince --bucket 45 --bilingual --out History/loops/prince/trace_bilingual.md
# 5) 选帧两步法
node Tool/ops/frame_sheet.mjs --video Workspace/tmp/ted_prince/talk_720p.mp4 --out History/loops/prince/survey.jpg --every 40
node Tool/ops/frame_sheet.mjs --video Workspace/tmp/ted_prince/talk_720p.mp4 --out History/loops/prince/check_frames.jpg --times "<spec 里的 30 个 src>"
# 6) 摘要（spec 见本目录 digest.json，30 段 × 7 章）
node Tool/ops/make_digest.mjs --spec Prototype/ep_prince_digest/digest.json --out Prototype/ep_prince_digest
# 7) 封面（注意：fs 对两行标题统一生效，latin+CJK 混排行必溢出——两行都用纯中文短句）
node Tool/ops/make_cover.mjs --video Prototype/ep_prince/final.mp4 --out Prototype/ep_prince/cover.jpg \
  --at 250 --bg "#3A1C47" --inset 0.87 --tag "完整演讲" --tagcolor "#F59F00" \
  --title "AI 正在杀死互联网？|流量崩塌，谁来买单？" --tcolor yellow --fs 0.16 \
  --sub "Cloudflare CEO 马修·普林斯 · TED｜中英双语字幕"
# 8) 审计 + 发布（发布必须人发起）
bash Tool/ops/kb_audit.sh Prototype/ep_prince_digest/final.mp4
node Tool/ops/publish_bilibili.mjs publish --video Prototype/ep_prince/final.mp4 --cover Prototype/ep_prince/cover.jpg \
  --title "Cloudflare CEO：AI 正在杀死互联网的流量生意" --desc-file Prototype/ep_prince/desc_publish.txt \
  --tags "AI,人工智能,Cloudflare,TED,科技,互联网" --zone 人工智能 --tid 231 --htype 1011 --decl "含AI生成内容"
# 9) 发布后必须回读：verify + roster（确认 state / tid / 时长）
```

## 已知边界

- 摘要未发布：若要发，cover 还没做（`make_cover` 用 digest final.mp4 抽帧）；发布属写操作，等人指令。
- 发布日志里「表单就绪（0s）」是竞态信号（挂载即就绪），本轮实测恰好上传完成后才提交（回读时长 757s 吻合），但**这个信号必须始终用回读校验兜底**，不能靠运气。
- 摘要的「大奶酪奖」一段（src 412）画面与上一段（src 415）同屏幻灯片，观感略重复，下一轮可换帧位。

## 过程留痕

`History/loops/prince/`：loop_log.md（执行记录）、trace_bilingual.md（写稿原料）、survey.jpg / check_frames.jpg（选帧）、spot_*.jpg / dg_*.jpg（质检帧）。
