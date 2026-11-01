# EP-B · 李开复 TED2018《How AI can save our humanity》双语版

> 小循环 14 WP4.5 产物。**与 EP-A 同格式、同分区、同长度档，只换人** —— 把"人物名气"这个自变量单独拎出来检验。
> 授权：TED CC BY-NC-ND，人于 2026-11-01 08:50 授权先行（见 `History/loops/loop14/net_probe.md`）。

## 产物

| 文件 | 说明 |
| --- | --- |
| `final.mp4` | 872.0s（14:32）1280×720，TED 原声 + 双语逐词高亮卡拉OK字幕（高亮 #33E6C8，与 EP-A/对标同风格） |
| `cover.jpg` | 对标式封面：成片 100s 人物近景帧（双语字幕正显示） |
| `edits.json` / `report.md` | vfactory 交付包（剪 10 处停顿间隙，共 8.3s，全程语音保护） |

## 复现步骤（与 EP-A 同链路，差异点见 manifest.md）

```powershell
# 1) 素材：ffmpeg 拉 HLS（project_masters/3235，f11 视频 + f12 音频）
# 2) 字幕：node Tool/ops/ted_subs.mjs --pm 3235 --lang en,zh-cn --out Workspace/tmp/ted_epb --offset 3.567
# 3) ASR：node Tool/subtitle/asr_vosk.mjs <视频> --out tr.json --af "highpass=f=100,lowpass=f=6000"
# 4) 偏移标定：node Tool/subtitle/estimate_offset.mjs tr.json gt_raw.json   # → 3.567s（171 句 3.5s 桶强峰）
# 5) 对齐：node Tool/subtitle/align_script.mjs tr.json gt.json --out aligned.json
# 6) 官方中译直灌：node Tool/subtitle/build_zh_map.mjs aligned.json cues_zh-cn.json --out zh.json
#    ↓ 若有缺失句，先并回碎片再重算：
#    node Tool/subtitle/merge_fragments.mjs aligned.json zh.json --out aligned_m.json
#    node Tool/subtitle/build_zh_map.mjs aligned_m.json cues_zh-cn.json --out zh_m.json
# 7) 字幕：node Tool/subtitle/make_subs.mjs aligned_m.json --out subs --punct --mt agent --zh-file zh_m.json --cps 22
# 8) 卡拉OK：node Tool/subtitle/make_ass.mjs subs/cues.json --out karaoke.ass --hl 33E6C8 --zh-margin-mode fixed
# 9) 首跑剪辑拿 EDL → make_ass --edl plan/edits.json 重映射 → 二跑 vfactory --srt 烧录
# 10) 封面：成片强帧（双语字幕正显示）
```

## 验收记录

| 项 | 结果 |
| --- | --- |
| ASR | 1997 词 / conf 0.9531（TED 干净音质） |
| 偏移标定 | **+3.567s**（183 句 3-gram 命中，171 句集中在 3.5s 桶；EP-A 为 3.504s，同 intro 不同批次） |
| 对齐 | 253 句，覆盖 1939/1997 词（未分配 58 = 掌声/笑声段） |
| 中译直灌 | clause 级分配（v2）后 240 句 **0 缺失**；253→240 由 merge_fragments 并回 13 个碎片 |
| 字幕 | 237 句 / 1433 词级事件（vfactory 剪切后 237；合并句拆 cue 所致），覆盖到 868.6s |
| 时间轴 | 探针帧 ×2（300s / 500s）：双语同步、逐词高亮正常、无漂移 |
| 剪辑 | 10 处 0.3–0.85s 停顿间隙，880.4s → 872.0s，语音零损伤 |
| 封面 | 成片 100s 帧：李开复近景 + 双语字幕 + 青色高亮（对标式） |

## 关键坑（相对 EP-A 新增）

1. **预卷偏移按片标定，不要复用上一片的值**：同为 intro_master_id=9294，李飞飞片 3.504s、李开复片 3.567s（差 63ms，肉眼无感但 align 分词会错位）。`estimate_offset.mjs` 用 ASR 词流自动标。
2. **官方中文是"逗号级"短 cue**：一个 cue 横跨两句英文时，唯一归属会让另一句拿不到中文，或整段错位（"9am to 9pm, six days a week" 只配到"每周六天"）。v2 按 clause 切分 + 时间比例分配解决。
3. **中文缺失句的正确修法是"英文并回前句"**，不是补翻——那半句的语义已在前句译文里，补翻会出现重复字幕。
