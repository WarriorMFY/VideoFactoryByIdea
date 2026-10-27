# 阴性对照：Big Buck Bunny 预告片（CC-BY 3.0）

素材只有音乐 + 5.1 声道，**没有对白**。本轮把它当阴性对照：

- ASR（两种预处理）都只识别出 **0 个词** → 符合预期
- 因此不产出任何字幕（`out_bilingual.srt` 为 0 字节），成片照常输出（`final.mp4`，无烧入）
- 判据：**没有对白就不该凭空造字幕**；这一条通过

数据来源：`History/runs/multi/bbb_trailer/`、`History/asr/multi/bbb_trailer.*.json`
