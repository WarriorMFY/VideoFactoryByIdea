# TalkFactory — TED 名人演讲 → 双语逐词高亮长片 + 3 分钟中文摘要 + 双向导航

> 从 VideoFactory 小循环 14（2026-11-01）整体迁移出来的能力包。
> 一条 TED 演讲进去，两个成品出来：**完整版双语长片**（沉淀用户）+ **3 分钟中文摘要**（吸引观看），
> 两者之间自动建立「快速导航通道」。

## 能力全景

```text
TED 演讲（project_masters id）
   │
   ① ted_fetch          素材入袋：f11 视频 + f12 音频 → talk_720p.mp4；官方 en/zh-cn 字幕 → cues_*.json
   │
   ② ted_episode        长片一条命令（约 10 分钟/条）：
   │                    ASR 词级时间轴 → 预卷偏移标定 → 官方字幕强制对齐
   │                    → 官方中译直灌（缺句并回碎片重算）→ 句级双语字幕
   │                    → 逐词高亮卡拉OK ASS → 自动删减 EDL → 字幕重映射 → 一次编码渲染
   │
   ③ make_digest        摘要一条命令（约 4 分钟/条）：
   │                    写好的 digest.json（30 段解说 × 原片帧位）→ Edge TTS 中文解说
   │                    × Ken Burns 动效 × 章节角标 × 右上「原片 mm:ss」→ 摘要片 + 章节跳转表
   │
   ④ make_cover / frame_sheet / kb_audit    封面（嵌入帧版式）/ 选帧复核拼图 / 抖动审计
   │
   ⑤ publish_bilibili / bili_comment        发布（扫码登录）+ 双向导航置顶评论
```

## 30 秒上手

```powershell
# 依赖已随包带好（Workspace/deps/）；若被清空，三条命令重装：
node Tool\setup\bootstrap_ffmpeg.mjs
node Tool\setup\bootstrap_asr.mjs
node Tool\setup\bootstrap_playwright.mjs

# ① 素材入袋（视频 + 官方双语字幕）
node Tool\ops\ted_fetch.mjs --pm 9260 --out Workspace\tmp\ted_feifei

# ② 长片（双语逐词高亮，一条命令约 10 分钟）
node Tool\ops\ted_episode.mjs --dir Workspace\tmp\ted_feifei --out Prototype\ep_feifei

# ③ 摘要（先照 Prototype\sample_ep_a\digest.json 写一份 30 段解说稿，见下「摘要怎么写」）
node Tool\ops\make_digest.mjs --spec Prototype\ep_feifei\digest.json --out Prototype\ep_feifei_digest

# ④ 封面 + 抖动审计（不合格就重跑）
node Tool\ops\make_cover.mjs --video <素材mp4> --out Prototype\ep_feifei_digest\cover.jpg --at 100 --bg "#3A1C47" --inset 0.87 --tag "摘要报告" --tagcolor "#E64980" --title "标题|3分钟摘要" --tcolor yellow --fs 0.20 --sub "讲者 · TED｜完整版 mm:ss"
bash Tool\ops\kb_audit.sh Prototype\ep_feifei_digest\final.mp4

# ⑤（可选）发布 + 双向导航：先扫码，再投稿，再互挂置顶评论
node Tool\ops\publish_bilibili.mjs status
node Tool\ops\publish_bilibili.mjs publish --video Prototype\ep_feifei\final.mp4 --cover <jpg> --title "..." --zone 人工智能 --tags "AI,人工智能"
node Tool\ops\bili_comment.mjs add --bvid BVxxxx --pin --text-file pin_comment.txt
```

## 摘要怎么写（唯一的手工环节）

1. **读稿**：`node Tool\ops\trace_text.mjs --dir Workspace\tmp\ted_feifei --bucket 45` —— 官方中文
   字幕导成带时间戳的分桶全文（`--bilingual` 可中英并排），通读后按叙事切成 6–8 章。
2. **选帧**：`node Tool\ops\frame_sheet.mjs --video <素材mp4> --out survey.jpg --every 40` ——
   一张拼图看全片画面构成，避开黑帧/转场/观众席，给每段解说挑一个 `src` 秒数。
   挑完用 `--times` 出一张复核拼图再确认一遍。
3. **写 spec**：照 `Prototype\sample_ep_a\digest.json` 的格式，每段一句解说（15–40 字）配一个
   `src` 帧位；片头卡、片尾卡、简介头尾文案一并写好。
4. **渲染**：`make_digest` 跑完会产出 `manifest.json`（章节 → 原片时间映射），用仓库里的
   `History\loops\loop14\` 例子生成「章节跳转表」置顶评论，贴回长片一侧即完成双向导航。

## 样例

`Prototype\sample_ep_a\` —— 李飞飞 TED2024 完整样例：长片 15:02、摘要 2:51、封面、spec、
章节导航表、抽检条。两条成片与线上发布版（BV113xW6VEv6 / BV1yvxs61Eaw）逐字节同源。

## 目录约定（与源仓库一致，见 AGENTS.md）

`Idea\` 想法与红线（仅人可写）· `Tool\` 稳定工具 · `Prototype\` 样例与每轮反馈 ·
`History\` 过程留痕 · `Workspace\` 临时区（deps 可删可重建，tmp 素材随手清）。

## 遇到问题先看

- `Tool\ops\ops.md` —— 16 条实战坑（TED 字幕预卷段、封面嵌帧丢失、抖动审计阈值、代理白名单…）
- `Tool\env.md` —— 环境类（出网/管道/字体/模型源）
- 各子目录 `.md` —— 每个脚本的参数表与设计动机

## 授权边界（重要）

TED 内容为 **CC BY-NC-ND**：署名、非商业、禁衍生。烧双语字幕属于「衍生」——使用本包发布前
必须获得内容权利人授权或确认你的用法合规；包内不做自动合规判断。发布链接需带原片署名。
