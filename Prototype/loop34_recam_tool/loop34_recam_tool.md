# loop34_recam_tool/ — recam 重摄影工具化

> 把 loop33 的「数字重摄影」实验固化成配置驱动工具：**动作零改动，只改镜头语言**（景别、运镜、变速、拖影、调色、遮幅、标注）。
> 关键结果：`Tool/ops/recam.mjs` 成为仓库级工具；三份配置覆盖 full / crop（固定窗·摇移）/ zoom（推拉·缓动）× speed 变速 × tmix 拖影 × 逐镜调色。
> 回链：[AGENTS.md §3.3](../../AGENTS.md) · [循环日志 #loop34](../../History/CircleLog/log.md#loop34) · [Prototype 索引](../Prototype.md)

## 目录内容

| 条目 | 内容 |
|---|---|
| `recam_ramp.json` | 变速斜坡 + 推近示例：① 原速起手（full）→ ② 0.35× 斜坡 + zoom 100,150→250,420 + 冷调 9500K/饱和 0.82 → ③ 原速收势；含 2.39 遮幅与逐镜 ASS 标注 |
| `recam_multicam.json` | 多机位版式示例：按角色轨迹标定的多个 crop 窗轮切（loop33 结论：单机位素材无真视差，crop 窗必须跟人走） |
| `recam_hk_yen.json` | 第三个实拍样本的配置（验证配置的通用性，不是只对一条片有效） |
| `out_ramp.mp4` / `out_multicam.mp4` / `out_hk_yen.mp4` | 三份配置的成片 |
| `qc_*.jpg` / `qc2_*.jpg` | 抽帧 QC：变速斜坡关键点（0.30/0.75/0.90/1.15/1.55/1.80）与 crop 窗跟人情况 |
| `recam_build/` | **渲染中间产物**：逐镜 `seg_NN.mp4` 切片、`concat.txt`、`fg.txt`、`clip_clean.mp4`。可随时重建，不属交付 |

## 工具契约

```bash
node Tool/ops/recam.mjs <input> <shots.json> [out.mp4]
```

配置形状：`source{in,dur}` + `out{w,h,fps,crf}` + `look{letterbox,temperature,saturation,vignette}` + `shots[]`，每个 shot 有 `t[a,b]`、`cam{type:full|crop|zoom}`、可选 `speed` / `tmix`（拖影）/ `label`（逐镜 ASS 标注）。

## 这轮踩到的坑

- **变速必须放在相机链之前**：`zoompan` 后接 `setpts` + `fps` 会 OOM；
- **逐镜拆独立中间文件再 concat demuxer**，不要用 `filter_complex` 混拼（内存与容错都更差）；
- 中文标注一律走 ASS 文件滤镜，cwd 切到 build 目录执行。

## 复现

```bash
node Tool/ops/recam.mjs Workspace/tmp/loop33_rephoto/source.mp4 Prototype/loop34_recam_tool/recam_ramp.json out.mp4
```

方法论：[Skills/versus-edit/SKILL.md](../../Skills/versus-edit/SKILL.md)（对比/重摄影版式与对位清单）。
