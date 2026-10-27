# bench/ — 造"带真值"的测试素材

> 为什么要造素材：真实视频没有逐帧人工标注，无法量化判断"该切的切了没有、不该切的误剪了没有"。
> 这里三种造法，都产出 **`source.mp4` + `ground_truth.json`**（机器可读真值），供 `acceptance/` 直接比对。

## 文件

| 脚本 | 造出来的素材 | 真值是什么 |
| --- | --- | --- |
| `make_bench_source.mjs` | **合成素材**（42s，7 段：运动/黑场/冻帧/静音/仅静音/仅冻帧/仅冻帧但有音轨） | 每段的起止与"该保留/该切除" |
| `make_real_bench.mjs` | **真实素材 + 已知废镜头**（BBB CC-BY 3.0，头 3s/中 2s/尾 2s 插入黑场+静音） | 插入的黑场区间 = 应切；真实片段 = 应保留 |
| `make_l2_bench.mjs` | **外语语音素材**（Edge 神经 TTS 逐句合成英文讲稿 + 真实画面，52s 左右） | 每句的起止时间（逐句合成再拼接，因此时间精确已知）+ 讲稿全文 + 人工精译参考 |
| `tts_sapi.ps1` | 备用 TTS：Windows SAPI 离线合成（**本机 `Speak` 被沙箱拒绝，仅留档**） | — |

## 用法

```powershell
node Tool\bench\make_bench_source.mjs                              # 默认输出 History/bench/synth/
node Tool\bench\make_real_bench.mjs                                # 默认输出 History/bench/real/
node Tool\bench\make_l2_bench.mjs                                  # 默认输出 History/bench/l2_en/
node Tool\bench\make_l2_bench.mjs --voice en-GB-SoniaNeural --out History\bench\l2_gb   # 换音色/语种音源
```

## 真值文件格式

```jsonc
{
  "duration_s": 42.0,
  "sections": [{ "id": "A", "start": 0, "end": 8, "expect": "keep", "why": "..." }],
  "kept":    [[0, 14], [24, 42]],      // 应保留
  "dropped": [[14, 24]]                // 应切除
}
```
外语素材的 `ground_truth.json` 额外带 `sentences[]`（逐句起止 + 原文）与 `script`；人工精译在 `reference_zh.json`。
真实素材另有 `reference_free: true` 标记（无讲稿，验收时自动切 reference-free 模式）。

## 坑

- **TTS 每句首尾自带约 0.8s 静音**，必须 `silenceremove` 再去测时长，否则"真值句时长"混入静音，覆盖率指标会虚低（实测从 82.9% 修到 99.8%）。
- TTS 合成要**幂等**（`make_l2_bench.mjs` 会复用已存在的 mp3）：Edge TTS 偶发网络抖动，重跑时不该从零开始。
- `anullsrc` 多段静音必须用不同标签（见 [`../env.md`](../env.md)）。
- 合成素材里"黑场+静音""冻帧+静音"要成对设计，否则测不出"两路都无信息才剪"的分界。
