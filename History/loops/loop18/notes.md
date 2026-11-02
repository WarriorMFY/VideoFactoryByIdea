# loop18 技术记录

## 坑 17 · 单图多 trim 分支并行解码 → 解码器内存爆掉，视频流静默截断（已固化）

**现象**：`[0:v]trim=start=A...[x];[0:v]trim=start=B...[y];...concat=n=33` 单图 33 分支架构渲染，
退出码 0 零报错，但**视频流只有 177.33s**（应有 209.4s），音频满长撑住容器时长。
日志深处才有 `thread_get_buffer() failed` + `decode_slice_header error`（20 处）。

**根因**：33 个 trim 分支共享一个解码器实例，每分支各自缓冲解码帧序列（源 911s，每个分支要
从头解码到自己的窗口），叠加 x264 编码 + 97 路 amix，h264 解码器 picture buffer 分配失败 →
丢帧被 ffmpeg 当作可恢复错误吞掉 → concat 断流。

**修法（digest_v2.mjs 最终架构）**：
1. 逐单元串行切片段文件（-ss 输入 seek + -t + -an，crf 14），每片 durationOf 校验 ±0.15s
2. 音频单独预混成一条 wav（whoosh/impact + TTS adelay + amix + apad + loudnorm）
3. 终混只有 M+1 路输入：concat 切片 + subtitles + 预混音轨
4. **校验必须看视频流时长**（`-select_streams v:0 -show_entries stream=duration`），
   容器时长会被音频撑住掩盖截断——本坑能被发现全靠这条校验。

**附带教训**：重写渲染段时把 ffmpeg `-y` 弄丢 → 输出已存在时 ffmpeg 交互询问后退出 0，
后续校验跑在**旧文件**上，造成「新架构也截断」的假象，多绕了三轮排查。管道工具的每个
ffmpeg 调用必须带 `-y`（或显式检查目标文件不存在）。

## 量化数据（shot_profile.mjs，th=0.15）

| 指标 | TED 原片 | 我们 v1 摘要 | **v2 摘要（本轮）** |
| --- | --- | --- | --- |
| 时长 | 15:02 | 2:51 | **3:29** |
| ASL | 8.85s | 85.45s | **5.66s** |
| 切点/min | 6.71 | 0.35 | **10.32** |
| 短镜头(<3s)占比 | — | ~0 | 32.4% |

- v2 的 37 个检出镜头中含源片内部多机位切换（真机位窗口自带 TED 原生剪辑），是额外收益
- 运动能量 mean 2.775（v1 2.94，TED 4.41）：硬切带来的画面变化未被 scene 检出为运动，
  但切点密度已达标；后续若上 BGM/变速可再对齐

## spec v2 增量字段（ep_a_digest_v2.json 为样例）

```json
{
  "hook": { "src": 392, "min": 8, "text": "…", "kw": [[11, "看见"]] },
  "segments": [{ "src": 15, "text": "…", "kw": [[15, "眼睛"]], "min": 5.5 }]
}
```
- `hook`：冷开场段（可选），在标题卡之前；`min`=最短展示秒数
- `segments[i].kw`：`[文本字位, 词]`，按 字位/总长×TTS时长 估弹出时刻
- `segments[i].min`：该段最短展示秒数（默认 5.5）
