# EP-B 素材档案 · 李开复 TED2018「How AI can save our humanity」

> 2026-11-01 09:52–10:05。小循环 14 WP4.5（新增：同公式第二条，拿样本量）。
> 授权沿用 WP1 决议：人于 08:50 明确授权 TED 先行（见 `../net_probe.md`）。

## 选题理由（对标公式第二节）

1. **人物名气取最大值**：对标公式的自变量是"人物名气"（同 UP 同格式下播放 47 → 18178 三级跳）。李开复在中文互联网的认知度高于李飞飞，是"名气 → 播放"这条假设的最强检验点。
2. **断言足够硬**："AI 会取代大量工作，但取代不了爱"——天然带冲突与情绪，符合对标标题的悬念结构。
3. **长度对位**：14:40 ≈ EP-A 15:02，控制变量（长度、格式、分区全部一致，只换人）。
4. 官方 en/zh-cn 双语字幕齐备，zh 翻译质量高于机翻，可继续走"官方中译直灌"路线。

## 来源与落袋

| 物 | 来源 | 落袋 |
| --- | --- | --- |
| 元数据 | `ted.com/talks/kai_fu_lee_how_ai_can_save_our_humanity`（talkId 177633，duration 880s） | `Workspace/tmp/ted_epb/kaifu.html` |
| 视频 720p | `hls.ted.com/project_masters/3235/index-f11-v1.m3u8?intro_master_id=9294` + 音频 `index-f12-a1.m3u8` | `Workspace/tmp/ted_epb/talk_720p.mp4` |
| en 字幕（31 段合并，267 cue） | `subtitles/en.m3u8` | `Workspace/tmp/ted_epb/full_en.vtt` / `cues_en.json` |
| zh-cn 字幕（31 段合并，255 cue） | `subtitles/zh-cn.m3u8` | `Workspace/tmp/ted_epb/full_zh-cn.vtt` / `cues_zh.json` |

- 段落边界重复 cue 已去重（en 31 / zh 31 条边界重影，脚本内按"同文本 + 起点差 <1s"判重）。
- 时间跨度：原始 0.640 → 875.840s，与 880s 片长吻合（**本片无 EP-A 那种 30 分钟尾巴**，31 段即全片）。

## 与 EP-A 的差异（复现要点）

| 项 | EP-A（李飞飞） | EP-B（李开复） |
| --- | --- | --- |
| project_masters | 9260 | **3235** |
| 字幕段数 | 32（合并后跨到 30:10，需窗口裁剪） | **31（正好全片，无需裁剪）** |
| 片长 | 15:11 | 14:40 |
| 预卷偏移 | +3.504s | **待 ASR 标定**（intro_master_id 同为 9294，预期一致，仍须实测） |

## 下一步

- [x] 1. ASR 词级时间轴（1997 词 / conf 0.9531）→ `estimate_offset.mjs` 标定偏移 **+3.567s** → 重生成带偏移 vtt
- [x] 2. `align_script.mjs` 强制对齐（253 句）→ `build_zh_map.mjs` v2（clause 级分配）→ `merge_fragments.mjs` 并回 13 碎片 → **240 句 0 缺失**
- [x] 3. `make_subs` → `make_ass`（237 句 / 1433 词级事件）→ vfactory 二跑烧录 → 探针帧 ×2 验证无漂移
- [x] 4. 封面 = 成片 100s 人物近景帧（双语字幕正显示，对标式）
- [ ] 5. `publish_bilibili.mjs publish --tid 231 --htype 1011` + 回读（10:11 启动）
