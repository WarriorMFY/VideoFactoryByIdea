---
name: stage-04-verify
description: 对生成片做分区度量、裁回源段长、拼成整片并出对照，最后交人过目。当生成片已经落地、要判断「锚是否生效、内容变了多少、变在哪」时使用；只在需要跑通链路、不看内容时不适用。
---

# ④ 验收拼回

先量，再拼，最后人看。顺序不能颠倒：拼完再量，返工成本会被拼接掩盖。

## 步骤

1. **分区度量**：
   ```
   python scripts/measure_zones.py --video out/S1.mp4 --video out/S2.mp4 \
       --refdir keys --json metrics.json --diff out/S1-diff.png
   ```
   `--refdir` 按段名前缀自动找 `keys/S1-first-*.png`；只传 `--ref` 会让各段都对同一张图算锚，多段时必错。逐段看三件事：首帧锚是否过线、变化落在 3×3 的哪几格、片内直方图是否稳定。口径与阈值见 `reference/metrics.md`。
2. **裁回源长并拼整片**：
   ```
   python scripts/assemble.py --table segments.json --indir out --outdir trim \
       --compare 源片.mp4 --strip --font 字体.ttc
   ```
   一条命令完成：按段表裁到源长（`trim/<段>.mp4`）、拼成整片（`trim/all.mp4`）、出左右对照（`trim/sbs.mp4`，保留源片音轨）、出接触表（`trim/strip.png`）。裁长按段表算，不手填；命中关键帧会多出一两帧，属正常。
3. **交人**：把 `metrics.json`、`sbs.mp4`、`strip.png` 一起给用户，等明确结论。

## 判读

- 锚过线但「整片几乎没变」→ 内容落在锚允许的局部，属预期，改写要走 `reference/limits.md` 里「改首帧再送」。
- 锚没过线 → 别往下拼，先回 ③ 查首帧上传与分辨率档。
- 局部区差异显著、其余区接近 0 → 事件生效且不外溢，这是事件卡的标准形态。

## 通过线

- 每段都有 `metrics.json` 条目，缺段即未完成。
- `trim/all.mp4` 总时长与源片对应区间一致（±1 帧/段）。
- 用户明确回复「通过」或「不通过」；AI 不自判 PASS。

## 产物

`metrics.json`、`trim/<段>.mp4`、`trim/all.mp4`、`trim/sbs.mp4`、`trim/strip.png`、`trim/assemble.json`。
