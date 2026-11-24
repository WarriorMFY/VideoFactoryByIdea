# Tool · 公共层

> 本目录只放**与系统、第三方包打交道**的公共工具——它们不知道 `Skill/` 的存在。
> 单技能专用的工具一律放该技能自己的 `scripts/`。分层与引用规则见根 `AGENTS.md`。

| 工具 | 用途 | 命令 |
| --- | --- | --- |
| `ffmpeg.py` | FFmpeg 静态二进制入口（无损流拷贝切段、转码、格式探测） | `python Tool/ffmpeg.py -version` |
| `setup_deps.py` | 重建 `_deps`（cv2 / Pillow / numpy / FFmpeg） | `python Tool/setup_deps.py` |

所有脚本都从仓库根解析路径，可在任意目录调用。

## 应用（非依赖层，例外登记）

| 应用 | 用途 | 启动 |
| --- | --- | --- |
| `director-editor/` | 导演编辑台：网页控制台，按项目目录读写 `project.json`，挂图 / 上锁 / 走 t2i 通道 | `cd Tool/director-editor && python script/serve.py`（默认 8347） |

它按用户令放在 `Tool/` 下长期开发（2026-11-24 由 `Workspace/director-editor/` 迁入）。
内部按 `html/`（前端）/ `script/`（服务端与测试）/ `doc/`（设计文档）三分，设计说明见 `director-editor/doc/前端设计.md` 与 `doc/后端设计.md`。
**注意它并不符合上面的分层约束**：`serve.py` 会调 `Skill/hub/generation/...` 的 t2i 通道脚本，
是有意为之的例外，不要再拿“公共层不得引用 Skill”去套它。

## 缓存

`_deps/` 与 `_deps_matte/` 是本机依赖缓存，**不入库**（见 `.gitignore`），换机器跑一次 `setup_deps.py` 即可。

`_deps_matte/` 装 rembg / onnxruntime 与抠图模型（约 340MB），重建方式：
`python -m pip install --target Tool/_deps_matte rembg onnxruntime`，再用
`Skill/hub/editing/cut/image-matte/scripts/matte_models.py fetch all` 拉权重。

## 已迁出（2026-11-19）

按分层规则（公共层不得引用 Skill），原在 `Tool/` 的 6 个脚本已归位：

| 原路径 | 现位置 |
| --- | --- |
| `smoke_test.py`、`stub_runner.py` | `Skill/meta/smoke-test/scripts/`（作用于技能本身，归 meta 桶） |
| `account.py` | `Skill/hub/generation/runninghub/scripts/`（单通道账户接口） |
| `anchor.py` | 删除；实现本就在 `Skill/hub/editing/pixel-anchor/scripts/` |
| `matte.py`、`matte_models.py` | 删除；实现本就在 `Skill/hub/editing/cut/image-matte/scripts/` |

## 已知事实

`runninghub_app.py --check` 以 `remainMoney`（钱包现金）判余额，会误报 `no_balance`；
真实可用额度看 `Skill/hub/generation/runninghub/scripts/account.py` 打印的 `remainPoint`。
`--run` 不调用 `--check`，不受影响。
