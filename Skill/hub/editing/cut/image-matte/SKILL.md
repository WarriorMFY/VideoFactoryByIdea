---
name: image-matte
description: 从一张图里抠出主体、去掉背景，出透明底 PNG。用户说「抠图/去背景/把X抠出来/换背景/做透明贴图/批量去底」时用；只改画幅的裁剪、要模型重画内容、视频逐帧抠像时不用。
---
# image-matte · 抠图

把画面拆成「主体」和「背景」两张皮，输出带 alpha 的 PNG。全自动，不用手画选区。

## 何时用
- 已有图片，要把某个主体单独拿出来：透明贴图、换背景、素材入库。
- 批量：一整个目录统一去背景。

## 何时不用
- 只要改取景框（crop）：那是裁剪，不涉及透明。
- 要模型「重新画一个主体」：那是生成，不是抠图。
- 视频逐帧抠：本技能不保证时序一致（逐帧独立会闪）。

## 怎么调
```bash
python Skill/hub/editing/cut/image-matte/scripts/matte.py <图或目录> [-o 输出] [--model isnet-general-use] [--bg white|#RRGGBB] [--crop] [--json]
```
参数与模型选择见 `reference/models.md`；边界与必失败场景见 `reference/limits.md`。

## 通过线
1. **无背景色残留**：边缘没有白边、绿边、灰边。
2. **主体不缺块**：手、脚、道具、装备都在。
3. **软硬得当**：发丝／纱／烟是渐变过渡，不是锯齿硬边。

任一条不过：先换模型重跑，再不行交人审。**不得自行修边**——改像素不是抠图，是另一件事。

## 资产
| 文件 | 用途 |
| --- | --- |
| `scripts/matte.py` | 实现本体：抠图 CLI（rembg + ONNX） |
| `scripts/matte_models.py` | 从国内镜像拉取模型权重（`list` / `fetch`） |
| `reference/models.md` | 七类模型的体积、速度、擅长与不擅长 |
| `reference/limits.md` | 必失败场景与处置口径 |

**自包含口径**：技能只引用本技能树内的文件；依赖（rembg / onnxruntime）与模型权重属运行时缓存，
由仓库 `Tool/_deps_matte/` 提供（可用环境变量 `CARDSTUDIO_MATTE_DEPS` 覆盖），不算对技能外源码的引用。
