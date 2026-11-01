# EP-A · 李飞飞 TED2024《With spatial intelligence, AI will understand the real world》双语版

> 小循环 14 WP3 产物。**对标公式验证之作**：名人 AI 演讲 × 双语逐词高亮字幕。
> 授权：TED CC BY-NC-ND，人于 2026-11-01 08:50 授权先行（见 `History/loops/loop14/net_probe.md`）。

## 产物

| 文件 | 说明 |
| --- | --- |
| `final.mp4` | 901.8s（15:02）1280×720，TED 原声 + 双语逐词高亮卡拉OK字幕（高亮 #33E6C8，与对标同风格） |
| `cover.jpg` | 对标式封面：3D 空间智能演示帧 + 烧录双语字幕（取自成片 560s） |
| `edits.json` / `report.md` 等 | vfactory 交付包（剪掉 10s 黑场/冻帧，12 段拼接） |

## 复现步骤（一条不落）

```powershell
# 1) 素材下载（HLS 1080p 清单开放，直链 403）
ffmpeg -i "https://hls.ted.com/project_masters/9260/index-f11-v1.m3u8?intro_master_id=9294" `
       -i "https://hls.ted.com/project_masters/9260/index-f12-a1.m3u8?intro_master_id=9294" `
       -map 0:v -map 1:a -c copy -bsf:a aac_adtstoasc talk_720p.mp4
# 2) 官方字幕（en/zh-cn 各 32 段 vtt，恒定偏移 +3.504s 合并去重）→ cues_en/zh.json
#    ⚠ 时间轴坑：段内 cue 时间相对片头预卷，不相对段起点（ASR 词流验证，见 ops.md）
# 3) 词级时间轴
node Tool/subtitle/asr_vosk.mjs talk_720p.mp4 --out tr.json --af "highpass=f=100,lowpass=f=6000"
# 4) 官方 en 做真值强制对齐（237 句，0 词未分配）
node Tool/subtitle/align_script.mjs tr.json gt.json --out aligned.json
# 5) 官方 zh 按时间窗映射 → 精译字典（237 句 0 缺失）
# 6) 字幕（跳过机翻，官方中译直灌）
node Tool/subtitle/make_subs.mjs aligned.json --out subs --punct --mt agent --zh-file zh_official.json --cps 22
# 7) 卡拉OK ASS（先按无剪辑出，成片 EDL 出来后重映射）
node Tool/subtitle/make_ass.mjs subs/cues.json --edl <edits.json> --out karaoke_remap.ass --hl 33E6C8 --zh-margin-mode fixed
# 8) 烧录（全程语音保护=不剪内容）
node Tool/edit/vfactory.mjs talk_720p.mp4 --out ep_a --protect tr.json --srt karaoke_remap.ass --max-cut 100
# 9) 封面：从 final.mp4 抽双语字幕正显示的强帧
```

## 验收记录

| 项 | 结果 |
| --- | --- |
| ASR | 1854 词 / conf 0.9413（TED 干净音质，远好于影视混音 0.55–0.65） |
| 对齐 | 237 句，覆盖 1854/1854 词，未分配 0 |
| 译文 | TED 官方 zh-cn（> 机翻），237 句 0 缺失 0 冲突 |
| 时间轴 | 探针帧 ×2（63.5s / 896.5s）：字幕与语音同步、逐词高亮正常、无漂移（重映射版） |
| 烧录 | final.mp4 可播放，中文在上英文在下，"simply/better" 等词青色高亮 |

## 关键坑（复现者必读）

1. **TED 字幕段时间轴**：vtt 段内 cue 时间是相对片头预卷（本片 3.504s）的恒定偏移，不是相对段起点。按 EXTINF 累加会每段错 30s。用 ASR 词流当真值定偏移。
2. 直链 `py.tedcdn.com/*.mp4` 403，但 `hls.ted.com` 清单与分段全开放——用 ffmpeg 拉 HLS。
3. TED 搜索 307 回首页不可用；slug 用外部搜索拿。
4. 字幕重映射必须在成片 EDL 出来后重做一次 ASS（首烧版按原时间轴，剪 12 处会累计漂移）。
