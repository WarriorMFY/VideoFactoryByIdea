# 模型选择 · 实测与下载

## 一、30 秒决策

| 需求 | 用哪个 |
| --- | --- |
| 不确定，只求稳 + 边缘细 | `isnet-general-use` |
| 求快、硬盘紧 | `u2netp`（4.7MB）或 `silueta`（43MB） |
| 人像/半身照 | `u2net_human_seg` |
| 二次元插画 | `isnet-anime` |
| 服装分区（上装/下装/全身） | `u2net_cloth_seg` |
| 毛发、纱、羽饰等软边 | 任意模型 + `--alpha` |

## 二、实测（本机，图 1564×758，onnxruntime 1.32 CPU）

| 模型 | 体积 | 载入 | 单张推理 | 前景占比 | 边缘表现 |
| --- | --- | --- | --- | --- | --- |
| `u2net` | 176MB | 1.3s | 1.13s | 27.5% | 干净，指缝无残白，边略软 |
| `isnet-general-use` | 170MB | 1.0s | 1.9s | 27.5% | 最干净，指尖轮廓最准 |
| GrabCut（传统 CV，仅对照） | — | — | 10–20s | 31.2% | 指缝留白块、硬边、把右下飞机带进来 |

同一张图、同一区域放大 3× 对比：GrabCut 在手指之间的缝隙留下整块白色残留，u2net/isnet 没有；
isnet 的指尖形状比 u2net 更贴原图。**结论：物体抠图一律用模型档，不用 GrabCut。**

## 三、下载

本机 GitHub 直连不通，rembg 内置下载源会卡在 0MB。统一走镜像：

```bash
python Skill/hub/editing/cut/image-matte/scripts/matte_models.py list                          # 看已装/未装
python Skill/hub/editing/cut/image-matte/scripts/matte_models.py fetch isnet-general-use       # 拉单个
python Skill/hub/editing/cut/image-matte/scripts/matte_models.py fetch all                     # 拉全部（约 700MB）
```

镜像：`https://hf-mirror.com/tomjackson2023/rembg/resolve/main/<name>.onnx`。
文件落在 `Tool/_deps_matte/models/`（可用环境变量 `CARDSTUDIO_MATTE_DEPS` 覆盖），rembg 从该目录直读（`U2NET_HOME`），不再联网。

**先 fetch 再跑**：模型缺失时 rembg 会自动回 GitHub 重下，表现为长时间无输出。

## 四、alpha matting

加 `--alpha` 会走 pymatting 做软边，边缘过渡更自然，代价是耗时涨 2–4 倍。
只对毛发、纱、烟雾这类「本应有半透明边」的主体开；硬边主体开了反而变糊。
