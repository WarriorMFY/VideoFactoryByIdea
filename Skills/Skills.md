# Skills — 作业指导书

> 只写"怎么算做对"，不放代码；执行体一律在 `Tool/`，命令都可复制。

| 技能 | 解决什么 | 触发话 |
|---|---|---|
| [exec-extract](exec-extract/SKILL.md) | 从源片里切出可引用的处决单位（边界判据 + 3N+2 结构） | 「切处决」「抽单位」「这片子有哪些处决」 |
| [exec-seam-stitch](exec-seam-stitch/SKILL.md) | 选序与拼接：尾手帧库目验、逐缝分级 | 「拼一条」「选哪几个单位」「接缝怎么样」 |
| [exec-speed-grammar](exec-speed-grammar/SKILL.md) | 逐镜速率分层（起手 1.0 / 蓄势 0.65 / 命中 0.3 / 余韵 1.8） | 「变速」「慢放重击」「卡点节奏」 |

## 依赖关系

```
exec-extract  →  exec-seam-stitch  →  exec-speed-grammar
（切单位）        （选序拼接）          （逐镜配速）
```

顺序不可倒：先有单位才能选序，选完序才知道每个单位在链里的角色。

## 判据归属

- "哪几个单位" = seam-stitch 的事
- "每个单位内部怎么变速" = speed-grammar 的事
- "切在哪一帧" = extract 的事

越界即为错：speed-grammar 不改顺序，seam-stitch 不改速率。
