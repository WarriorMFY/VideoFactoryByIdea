# Log 目录纪律

> 只规定一件事：一个循环目录内部怎么摆产物。
> 循环本身的规则（开始／结束、Circle.md 必填项、摘要与提交）见仓库 `AGENTS.md`。

## 分层

```
Circle<id>/
├─ 文生图/<卡片 name>/v1|v2|v3/…
└─ 文生视频/<卡片 name>/v1|v2|… 或 01-<tag>/
```

1. 第一层按段分：`文生图/`、`文生视频/`，互不混放。
2. 第二层按单卡流水线分，目录名 = 卡片 `name`（如 `terrain-huangfeng-valley`）。
3. 第三层按版本分：`v1/`、`v2/`…；一个版本对应该版卡片文本的全部样本。

## 每版目录内放什么

| 文件 | 说明 |
| --- | --- |
| `card.md` | 该版卡片全文，旧版不删，保留可追溯 |
| `prompt-image.txt` / `prompt-video.txt` | 该版送验 prompt 正文 |
| `NN-<tag>.png`／`NN-<tag>.mp4` | 样本，按提交顺序编号 |
| `NN-<tag>.png.prompt.txt`／`NN-<tag>.mp4.prompt.txt` | 该样本实际发送的 prompt 快照 |

同一版本内文本完全相同的 prompt 快照可以只留一份正文（`prompt-*.txt`），但每个样本仍必须留自己的 `.prompt.txt`。

## 循环根目录只留

- 记录：`Circle.md`、`log.md`、`report.md`、`spec.md`、`ledger.json`
- 脚本：`make_prompt.py`、`run_still.py`、`run_video.py`、`credit.py`、`frames.py` 等流水线工具
- 单卡目录内的诊断帧放该卡下的 `_diag/`，不放根目录

## 禁止

- 不在循环根目录建 `output/`、`archive/`、`frames/` 一类通用倾倒目录；产物一律落到「段／卡片／版本」三级之内。
- 不把未送验的 prompt 变体与送验过的快照混放；从未提交过任务的变体直接删除。
