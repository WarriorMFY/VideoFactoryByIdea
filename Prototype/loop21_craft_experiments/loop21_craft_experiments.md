# loop21_craft_experiments/ — edit-craft-scouting 首跑：金句卡流派移植

> edit-craft-scouting 首跑：金句卡流派移植。关键结果：金句卡流派移植成功
> 回链：[AGENTS.md §3.3](../../AGENTS.md) · [循环日志 #loop21](../../History/CircleLog/log.md#loop21) · [Prototype 索引](../Prototype.md)

## 目录内容

| 子目录 | 类型 | 内容量 |
|---|---|---|
| `.sheet_tmp/` | 子目录 | 5 项 |
| `b1_kw25/` | 子目录 | 7 项 |
| `b2_quotecard/` | 子目录 | 7 项 |

根目录另有 7 个数据产物文件（.mp4×4 · .jpg×2 · .json×1），均为本轮产物，不单列。

## 报告（原 `REPORT.md` 正文）

### loop21 判卷与交付报告（S5–S7）

> 按 `Skills/edit-craft-scouting/SKILL.md` 流程执行的第一个完整循环。
> 基线：EP-A v2（`Prototype/loop18_digest_v2/ep_a_v2/final.mp4`，209.40s）。同源单变量，纯叠加层改动。

#### S5 判卷结果

##### E1 · 关键词停留 1.6s → 2.5s（--kw-dur 2.5）

| 指标 | 基线 | 变体 | 判定 |
|---|---|---|---|
| KW 停留 | 1.6s | **2.5s**（抽帧实证：103.3s 在屏、2.6s hook 在屏） | ✅ 参数生效 |
| 可读性商数（停留×8÷字数） | 4–6.4 | 5–10 | ⚠️ 见下 |
| 成片时长 | 209.40s | 209.40s | ✅ 零漂移 |
| 目验（遮挡/冲突） | — | 无遮挡，角标/字幕/进度条完好 | ✅ |

**结论：支持**（无副作用 + 停留更长 + 目验干净）。
**诚实记录一个指标设计缺陷**：可读性商数对 2–3 字短词在基线就饱和（≥4），区分度不足——该指标只能否决长词问题，不能量化短词收益。下轮若继续验"停留时长"应换指标（如人主观盲测 A/B）。
**人主观判定**：待闸门（demo_b1_kw25.mp4 vs demo_base_kw.mp4）。

##### E2 · 章节金句锚点卡（--quote-card，1.8s 压暗+居中白字）

| 指标 | 基线 | 变体 | 判定 |
|---|---|---|---|
| 章节卡覆盖 | 0/7（仅 ◆ 角标） | **7/7 全命中**，文字完整可读 | ✅ |
| 底部解说字幕 | 保留 | 保留（对齐雷军版语法） | ✅ |
| 成片时长/音画 | 209.40s | 209.40s（视频流校验过，无静默截断） | ✅ 零漂移 |
| 目验 | — | 压暗均匀，第3章图片墙背景下金字仍可读 | ✅ |

**结论：支持**（客观指标全过）。
**人主观判定**：待闸门（demo_b2_quotecard.mp4 vs demo_base_quote.mp4）。

#### S6 工具化状态

| 工具 | 状态 | 说明 |
|---|---|---|
| `Tool/ops/digest_v2.mjs` 新增 `--kw-dur` / `--quote-card` / `--quote-dur` | **参数化扩展，默认行为零改动**（默认 1.6s / 关闭） | 已满足可重复/参数化/失败可诊断三条，但按纪律**升格与否待人批**：这是对既有稳定工具的直接扩展而非轮次目录新脚本，理由=不改默认值即不改变任何已发布产线行为；若你不同意此处理，可回退为轮次目录 fork |
| 采样/下载脚本 | 沿用 loop19 临时脚本（未升格） | 仍待人批 |

**本轮新坑（已固化 ops.md 坑 18）**：`--reuse-tts` 按输出目录隔离（`.work/` 在 OUT 下），跨输出目录复用会静默退化为全量 TTS 甚至失败；跨目录复用需先拷 wav。

#### S7 交付清单（看到了什么 / 学到了什么 / 值不值得留）

- **看到了什么**：B站演讲赛道混剪流派的真实语法——素材 1–2s 快切 + 金句/数据大字卡 2–4s 当节奏锚点，大字与语音同步；6 选 4 中 2 条 882w/153w"伪混剪"被三判据剔除（882w 冠军零剪辑，再次证明播放量≠技术分）。
- **学到了什么**：我们 v2 与头部手法的差距收敛为两个数字——信息停留 1.6s（别人 2–4s）、章节切换无锚点（别人有"收"的卡）。两个假设实验均获客观支持。
- **值不值得留**：`--kw-dur` / `--quote-card` 两个参数（工具三判据已满足，待人批）；judge 指标缺陷教训（商数对短词饱和）。

#### 人闸门（等你裁决）

1. **E1**：`--kw-dur 2.5` 是否成为产线默认值？（看 demo_b1 vs demo_base）
2. **E2**：金句锚点卡是否进入正式 spec 模板（每章配 quote）？（看 demo_b2 vs demo_base）
3. 对"直接参数化扩展 Tool/ops/digest_v2.mjs 而非落轮次目录"的处理是否认可？
4. 两个 demo 均未发布；v2 正式版发布决策仍在 loop18 闸门挂起。

#### 复现

```bash
node Tool/ops/make_digest.mjs --spec Prototype/loop21_craft_experiments/ep_a_spec_quotes.json \
  --out Prototype/loop21_craft_experiments/b1_kw25 --v2 --reuse-tts --kw-dur 2.5
node Tool/ops/make_digest.mjs --spec Prototype/loop21_craft_experiments/ep_a_spec_quotes.json \
  --out Prototype/loop21_craft_experiments/b2_quotecard --v2 --reuse-tts --quote-card
# 判卷抽帧
node Tool/ops/frame_sheet.mjs --video .../b2_quotecard/final.mp4 --times "10.9,33.4,46.5,73.1,99.5,127.1,171.5" --cols 4
```
