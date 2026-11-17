# 链目录与 manifest

## 目录

```
Log/Circle<id>/<卡片家族>/chain-<NN>-<tag>/
├─ card-instance.md     主卡快照
├─ card-fixed.md        固定变量卡（可缺省）
├─ card-anti.md         反向卡（可缺省）
├─ image/
│  ├─ prompt-image.txt
│  ├─ <tag>.png
│  └─ <tag>.png.prompt.txt
├─ video/
│  ├─ prompt-video.txt
│  ├─ <tag>.mp4
│  └─ <tag>.mp4.prompt.txt
├─ _diag/               抽帧、拼条、diff 输出
└─ manifest.json
```

规则：

- 一条 chain = 一次「卡 → 图 → 视频」的完整记录，链内自带卡快照，不跨链引用。
- `NN` 两位、按族内顺序递增；`tag` 只用小写字母、数字、连字符。
- 旧卡不删：改卡就新开 chain，或把旧卡复制进新链。
- 从未提交过任务的 prompt 变体不入链，直接删。

## manifest.json

| 字段 | 含义 |
| --- | --- |
| `circle` / `family` / `chain` | 定位 |
| `cards[]` | `role`（main/fixed/anti）、`file`、`sha1`、`chars` |
| `delivery` | `mode`（full/main）、`file`、`chars`、`aux_share`、`order` |
| `runs[]` | `stage`、`app`、`nodes`、`task_id`、`charged`、`bal_before`、`bal_after` |
| `outputs[]` | `file`、`bytes`、`sha256`、`fps`、`frames`、`dur` |
| `cuts[]` | `t`、`frame`、`delta` |
| `verdict` | `coverage`、`pass`、`graded_by`（固定 `human`）、`notes` |

约束：

- `verdict.pass` 只能由人填；AI 填 `null`。
- `cards[].sha1` 与链内文件必须一致；卡改了就开新链，不改旧 manifest。
- `runs[].charged` 优先取任务回传；否则用 `bal_before - bal_after` 补记，并在 `notes` 注明。

## 全轮产物

| 文件 | 位置 |
| --- | --- |
| 循环摘要 | `Log/Circle<id>/Circle.md` |
| 观察与候选 | `Log/Circle<id>/log.md`（判读暂存层，见 `experience.md` §三级存放） |
| 全轮预览 | `Log/Circle<id>/preview-*.png`（跨链，不属于任何单链） |
| 账本 | `Log/Circle<id>/ledger.json` |

## RAG 交接

- 技能只产出「候选」：实例卡 + 证据链 + 判读。
- 入库动作（复制卡到 `RAG/<类>/<name>/`、登记、提交 git）必须用户明确验收后才做。
