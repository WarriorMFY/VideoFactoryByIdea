# loop18_digest_v2/ — P1-P5 并入摘要主链 + EP-A v2 成片

> 把 loop17 调研出的 P1–P5 手法（真机位 / 硬切 / whoosh / 冷开场 / 关键词弹出 / 进度条）并入摘要生产主链，产出 EP-A v2 成片。
> 关键结果：`digest_v2.mjs --v2` 上线；ASL 85.45s → 5.66s、切点 0.35 → 10.32/min（反超 TED 原片 8.85s）；渲染 155s → 63s。
> 回链：[AGENTS.md §3.3](../../AGENTS.md) · [循环日志 #loop18](../../History/CircleLog/log.md#loop18) · [Prototype 索引](../Prototype.md)

## 目录内容

| 条目 | 内容 |
|---|---|
| `ep_a_v2/` | EP-A v2 成片产出：`final.mp4`（209.40s）、`digest.ass`、`zh.srt`、`manifest.json`、`frames/`（QC 抽帧）、`desc_publish.txt` |
| `ep_a_digest_v2.json` | v2 渲染 spec（章节、quote 卡、关键词与时长） |
| `qc_v2.jpg` / `qc_kw_hook.jpg` / `qc_kw_ch5.jpg` | QC 拼图：整体 19 格、hook 段、第 5 章关键词弹出 |

## 这轮得到的结论

- **手法能落到主链**：`Tool/ops/digest_v2.mjs` 以 `--v2` 模式并入 `make_digest.mjs` 入口，默认行为零改动。
- **坑 17（会毁片）**：单图 × 33 个 trim 分支并行解码把内存打爆 → 视频流**静默截断且退出码 0**。修法 = 串行切片 + 音频预混 + 终混只带 M+1 路输入；成片校验必须查**视频流时长**而非容器时长。附带教训：ffmpeg 管道每处必带 `-y`，否则拿旧文件校验出假象。
- **本轮未发布**：人裁决「不需要发布」（11-02 23:27），EP-A 线上保持 v1；成片与 spec/manifest 留档作为可复用能力。状态 `closed`。

## 复现

```bash
node Tool/ops/make_digest.mjs Prototype/loop18_digest_v2/ep_a_digest_v2.json --v2 --out out
```
