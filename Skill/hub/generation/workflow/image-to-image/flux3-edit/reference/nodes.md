# Flux3图像编辑 · 节点与参数实况

`--info 2114585366186516481` 回读（2026-11-21，6 个节点，不消耗积分）：

| nodeId | nodeName | fieldName | 说明 | 本技能 |
| --- | --- | --- | --- | --- |
| 30 | LoadImage | `image` | 图1（必填） | `30:image` |
| 31 | LoadImage | `image` | 图2（没有则不传） | 不传 |
| 71 | LoadImage | `image` | 图3（没有则不传） | 不传 |
| 36 | CR Prompt Text | `prompt` | 提示词（多行） | `36:prompt` |
| 72 | PrimitiveInt | `value` | 生图数量，**默认 2** | `72:value` |
| 34 | ResolutionSelector | `aspect_ratio` | 8 档全名，默认 `9:16` | `34:aspect_ratio` |

## 比例档（全名，短名不认）

`1:1 (Square)`／`2:3 (Portrait Photo)`／`3:2 (Photo)`／`3:4 (Portrait Standard)`／`4:3 (Standard)`／`9:16 (Portrait Widescreen)`／`16:9 (Widescreen)`／`21:9 (Ultrawide)`

输出像素随比例变（3:4 输入 307×235 时出 1664×1248）。

## 实扣（本账号）

| 次 | 请求 n | 实际出图 | 实扣 | 均价 |
| --- | --- | --- | --- | --- |
| V1 | 1 | **2** | **20.06** | 10.03／张 |

- 积分走 `usage.chargedPoint`（`consumeMoney` 为 null），`runninghub_app.py` 已回落读取。
- **按提交计费，不按张**：多出的那张不额外扣。
- 应用标题里的「实测3毛4」是别家账号报价，与本账号无关。

## 待验

1. `72:value=1` 为何不生效——是节点被工作流忽略，还是必须传字符串 `"1"`。验证法：`--n 1` 跑一条，看 `run.json.files` 长度与实际扣费是否同步减半。
2. 扣费是否随比例／面积变化（V1 只有 3:4 一档样本）。
3. 输入分辨率高低对 `sharp` 与 ssim 的斜率——目前只有 307×235 一个输入。
