---
name: FetchVideoFrame
description: 输入一个视频链接和一个关键词，抽帧拼图后由视觉判读定位命中时间窗，导出关键帧 PNG 与分段 MP4。当用户说「从这个视频里找/截取 XX 画面」「按关键词抽关键帧或片段」时使用；要判定 0.1–0.2 秒级快速动作是否发生、或要转码加字幕时不用。
---

# FetchVideoFrame · 按关键词取视频帧与片段

关键词不交给脚本识别：脚本只管抽帧与导出，命中由 agent 看拼图判定（画面是唯一真相源）。

## 何时用

- 有一段视频（链接或本地文件），要找「出现某物／某画面」的时间点与片段。
- 要给命中处留一张关键帧 PNG，或裁一小段 MP4 作后续素材。

## 何时不用

- 要判定 0.1–0.2 秒级快速动作是否发生：抽帧拼图必然漏帧，须通看全片，本技能不做动作判定。
- 要逐帧精修、转码、加字幕、改原视频。

## 步骤

1. 准备：`python Skill/FetchVideoFrame/scripts/prepare.py <链接|本地路径> --out <目录>`，默认每 0.5 秒一帧；长视频调大 `--step`。
2. 判读：打开 `<目录>/sheet-*.png`，按关键词找出命中时间区间；看不清就缩小 `--step` 重抽（细则见 `reference/judging.md`）。
3. 导出：`python Skill/FetchVideoFrame/scripts/extract.py <目录> --windows '[{"start":1.2,"end":2.0,"label":"关键词"}]'`，读 `extract.json` 汇报产物。

## 输出与边界

- 产物：`video.mp4`、`frames/`、`sheet-*.png`、`keyframes/`、`clips/`、`extract.json`。
- 只读源视频；片段是 mp4v 重编码、时间对齐帧边界，非无损流拷贝；无命中就如实说没有。
- 依赖 cv2/Pillow，脚本自行定位本机依赖缓存；抽样与切片细则见 `reference/`。
