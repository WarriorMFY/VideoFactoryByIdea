---
name: smoke-test
description: 无费用冒烟测试：跑通工线各段（依赖、Prompt 一致性、L3/L4 送验替身、抽帧拼图、可选在线查账），不发起任何付费生成。改完东西想确认「还能不能跑」时用；想验证一张卡好不好、想真出图出视频时不用。
---

# 冒烟测试

**验收对象是工线本身，不是卡片内容。**

## 跑法

```bash
python Skill/meta/smoke-test/scripts/smoke_test.py
python Skill/meta/smoke-test/scripts/smoke_test.py --online   # 加查余额与通道节点
python Skill/meta/smoke-test/scripts/check_utf8.py            # 另：查改动文件编码
```

从任意目录可调用，内部自动切到仓库根。

## 检查项

| 项 | 验什么 | 零成本机制 |
| --- | --- | --- |
| `deps` | cv2／Pillow／numpy 可导入 | 只 import |
| `prompt_consistency` | 卡 K0–K4 与 prompt 逐字一致 | 纯文本比对 |
| `l3_stub`／`l4_stub`／`l4_bare_stub` | 参数构造与默认节点覆盖 | `--runner stub_runner.py`，只记录不请求 |
| `draw_sheet` | 抽帧拼图可出图 | 本地 OpenCV |
| `account`／`info_l3`／`info_l4`（仅 `--online`） | 余额与节点真名 | 只读接口 |

`check_utf8.py` 是独立脚本，不并入上表：它查 `git status` 里的 `.md`／`.py` 是否为合法 UTF-8、有无 U+FFFD 替换符。

## 边界

- 样本在 `fixtures/`（`prompt.txt` + `card-v2.md`），随技能分发。
- `draw_sheet` 需要 `fixtures/draw_sheet.mp4`，该媒体不入库；放一段进去才会跑，否则 `SKIP`。
- 只验证「跑得通」，不判卡片好坏；判卡走 `Skill/chain/card-experiment/` 或 `Skill/other/interactive-action-card-validation/`。
- 不发起付费请求；真出图出视频用 `Skill/chain/card-experiment/scripts/run_still.py`／`run_video.py`。
