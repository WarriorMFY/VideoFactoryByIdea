# 像素锚点（pixel-anchor）

把互联网素材变成喂给生视频模型的**像素约束**：一个物体 → 一张可重组的透明底锚点 → 一张构图正确的首帧 → 一组可验收的分数。

## 触发

- 要给某个物体/角色/道具建"像素锚点"、做参考图、做首帧；
- 要把已有素材里的主体换到新场景、新背景、新机位；
- 要从一段视频里取"首帧/尾帧"当锚点，或判断某个生成结果"像不像锚点"；
- 拿到一张生成帧，需要用数字而不是肉眼判断它偏离锚点多少。

## 不触发

- 纯文字生成视频（没有像素证据可押）；
- 只是要"好看"的合成图、不需要给模型用（那是设计/修图）；
- 需要从零创作不存在的物体（锚点的前提是真实素材）；
- 抹水印、去标识——锚点必须保真，水印是来源凭证，不做去除。

## 一条命令

```
python Skill/pixel-anchor/scripts/anchor.py compose --anchor mecha.png --plate plate.png --out first.png
python Skill/pixel-anchor/scripts/anchor.py masks  --src shot.png --boxes '[{"name":"机甲","box":[0.25,0.04,0.76,1.0]}]' --outdir anchors
python Skill/pixel-anchor/scripts/anchor.py score  --anchor mecha.png --frame first.png --rematte
python Skill/pixel-anchor/scripts/anchor.py pair   --video shot.mp4 --outdir shots
```

坐标全部用 0–1 比例；换分辨率不用改参数。抠图本身走 `Skill/image-matte`。
`Tool/anchor.py` 只是兼容旧调用的薄启动器，实现与文档都在本技能内。

## 三条通过线

| 环节 | 通过线 | 不过怎么办 |
| --- | --- | --- |
| 锚点本身 | 主体完整、无缺块、`halo_ratio` ≤ 1.15 | 收紧阈值 / 换模型 / 先裁再抠 |
| 首帧合成 | `mask_iou` ≥ 0.90（合成后还能认回原轮廓） | 调 `--shrink/--rim`，重做光影 |
| 生成帧验收 | `mask_iou` ≥ 0.85 且 `halo_ratio` ≤ 1.15 | 加锚点、换首帧、降自由度 |

## 资产

- `scripts/anchor.py` — 实现本体（compose / masks / score / pair 四个子命令）
- `reference/anchors.md` — 四类锚点、优先级、锚点预算（硬锚/软锚）、冲突处理、合规
- `reference/measured.md` — 实测数字、失败案例、已知缺陷

**自包含口径**：技能只引用本技能树内的文件；第三方依赖（OpenCV/rembg/onnxruntime）与模型权重属运行时缓存，
由仓库 `Tool/_deps`、`Tool/_deps_matte` 提供（可用 `CARDSTUDIO_DEPS` / `CARDSTUDIO_MATTE_DEPS` 覆盖），不算对技能外源码的引用。
