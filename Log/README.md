# Log 目录纪律

> 只规定两件事：一个循环目录内部怎么摆产物；什么算一次记录。
> 循环本身的规则（开始／结束、Circle.md 必填项、摘要与提交）见仓库 `AGENTS.md`。

## 分层

```
Circle<id>/
├─ <卡片 name>/               第一层：一次试验的卡片家族
│  └─ chain-<NN>-<tag>/       第二层：一次完整流水链（一条记录）
│     ├─ card*.md             该次送验用到的全部卡（快照）
│     ├─ image/               该链的图段（没有就不建）
│     │  ├─ prompt-image.txt
│     │  ├─ <tag>.png
│     │  └─ <tag>.png.prompt.txt
│     ├─ video/               该链的视频段
│     │  ├─ prompt-video.txt
│     │  ├─ <tag>.mp4
│     │  └─ <tag>.mp4.prompt.txt
│     └─ _diag/               诊断帧
└─ Circle.md / log.md / report.md / ledger.json
|——Tool\放临时工具脚本
```

1. **一个 `chain-<NN>-<tag>/` 就是一次「固定卡 → 生图 → 生视频」的完整记录**：链内自带本次用到的卡快照和每一步的 prompt 快照，不跨链引用文件。(可以只是文生图或文生视频或者组合)
2. **旧卡不删**：卡改版就另开一条 chain，或把旧卡复制进新链；确实要删卡，必须用户明确说。
3. 链内样本按提交顺序编号：`01-`、`02-`……；一条链只有一个 tag，所有产物共用。
4. 图段、视频段分开放 `image/`、`video/`，方便一眼看出这条链走到哪一步。

## 循环根目录只留

- 记录：`Circle.md`、`log.md`、`report.md`、`spec.md`、`ledger.json`、`pipeline-*.md`
- 全轮预览：`preview-*.png`（跨链对照，不属于任何单链）

## Tool
- 脚本：`make_prompt*.py`、`run_still.py`、`run_video.py`、`credit.py`、`frames.py`、`make_preview*.py` 放Tool下

## 禁止

- 不在循环根目录建 `output/`、`archive/`、`frames/` 一类通用倾倒目录。
- 不把未送验的 prompt 变体与送验过的快照混放；从未提交过任务的变体直接删除。
- 不在族目录（`<卡片 name>/`）下直接放样本或卡：族目录只装 chain。
