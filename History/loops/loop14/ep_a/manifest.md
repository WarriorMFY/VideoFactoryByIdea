# EP-A 素材档案 · 李飞飞 TED2024「With spatial intelligence, AI will understand the real world」

> 2026-11-01 08:55–09:05。授权记录见 `../net_probe.md`（人授权 TED 先行）。

## 选题理由

1. **与对标同人物**：对标爆款 BV1a1HW6LEXN 就是李飞飞采访翻译——名人 × AI 议题已被同赛道验证。
2. 官方素材完备：1080p HLS、官方 en/zh-cn 字幕（翻译质量 > 机翻）。
3. 15:11 长度适合 B 站完整版；金句段落（Sora/GPU 部分）可切短片。

## 来源与落袋

| 物 | 来源 | 落袋 |
| --- | --- | --- |
| 视频 720p（15:11.7，254MB，23.974fps） | `hls.ted.com/project_masters/9260/index-f11-v1.m3u8` + 音频 f12 | `Workspace/tmp/ted_feifei/talk_720p.mp4` |
| en 字幕（WEBVTT，32 段合并） | `subtitles/en.m3u8` | `Workspace/tmp/ted_feifei/full_en.vtt` |
| zh-cn 字幕（WEBVTT，32 段合并） | `subtitles/zh-cn.m3u8` | `Workspace/tmp/ted_feifei/full_zh-cn.vtt` |
| 演讲页元数据（talkId 130471，duration 911s） | `ted.com/talks/fei_fei_li_with_spatial_intelligence_ai_will_understand_the_real_world` | `Workspace/tmp/ted_talk.html` |

## 授权状态

- TED 官方许可 **CC BY-NC-ND**：署名/非商用/禁衍生。
- 烧录双语字幕属于「衍生」——**人已明确授权先跑一轮**（08:50），后续再评估合规；发布简介将带署名与原文链接。
- 本条不参与任何商业化。

## 下一步（WP3）

1. `asr_vosk.mjs` 跑词级时间轴（TED 演讲音质干净，vosk 小模型预期好于影视混音）
2. `align_script.mjs` 用官方 en 字幕做强制对齐
3. 官方 zh-cn cue 按时间对齐到我们的句子 → 当 `--mt agent --zh-file` 精译输入
4. `make_ass.mjs` 双语逐词高亮 → `vfactory` 烧录 → 封面=强帧+烧字幕（复刻对标式）
