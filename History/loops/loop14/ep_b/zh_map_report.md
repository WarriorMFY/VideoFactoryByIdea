# 官方中译直灌报告（v2 · clause 级分配）

- 输入：`Workspace/tmp/ted_epb/aligned_m.json`（240 句） + `Workspace/tmp/ted_epb/cues_zh-cn.json`（255 cue / 316 clause）
- 结果：**命中 240 / 240**，缺失 0，未归属 clause 14
- 分配规则：cue 按中文标点切 clause → clause 按字符数比例分时间子区间 → 归属重叠最多的 en 句（重叠 ≥ 0.08s）

## 缺失句（需补译）

（无）