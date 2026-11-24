# hub · 共用底座

被链直接调用、自身不编排阶段的技能放这里。分两层：生成与剪辑。

## 分界（唯一判据）

> 同一输入、同一命令重跑，输出是否唯一？
> 不唯一 → `generation/`（采样）　唯一 → `editing/`（确定性重组）

看「是否采样」，不看「是否用了模型」：本地离线模型的推理若确定，归剪辑。

## generation/ · 采样

`cloud/`（远端采样、按次计费）与 `local/`（本机采样、免费）是预留分类，成员满 2 才落地为目录。当前 `runninghub/` 直挂 `generation/` 下。

| 归属 | 纪律 | 成员 |
| --- | --- | --- |
| cloud（远端采样、按次计费） | 留 task 号、prompt 快照、实扣，记 `ledger.json` | `runninghub/` |
| local（本机采样、免费） | 留种子与模型版本，不记账 | 暂无 |

## editing/ · 确定性重组

四个动词穷尽剪辑侧。职责表、ffmpeg 用法、剪辑边界见 `editing/README.md`。

| 动作 | 做什么 | 成员 |
| --- | --- | --- |
| `cut/` | 按形状或时间分离已有像素 | `image-matte/`、`fetch-video-frame/` |
| `compose/` | 把分离的像素放回或拼起来 | `pixel-anchor/`（兼 measure） |
| `measure/` | 只读量测，产出数字 | 暂无 |
| `convert/` | 编码与容器搬运 | 暂无（暂用 `Tool/ffmpeg.py` 直接下命令） |

## 接口（生成↔剪辑）

| 方向 | 内容 |
| --- | --- |
| 生成→剪辑 | mp4／png、prompt 快照、任务号、实扣、实测帧数与黑边 |
| 剪辑→生成 | 缺口清单（缺哪个事件／景别／时长），指明需重生成的片段 |
| 共同纪律 | 整卡直送、脚本只拼接、测量先行、全程留痕 |

## 备注

- `pixel-anchor/` 挂在 `editing/` 根：它是 editing 侧唯一的「合 + 量」，成员不足 2，不建 `compose/`。
- `pixel-anchor` 的 `masks` 与 `score --rematte` 借本地抠图模型，输出确定，仍属 `editing/`，不跨桶。
- 出图出片一律经 `generation/runninghub/`，这是全库唯一网络出口。
- `generation/workflow/image-to-video/i2v-probe/` 挂在 `generation/workflow/` 功能子树：只做「首帧+提示词→视频」的单步对照实验与度量，**不是第二个网络出口**——提交仍转发给 `runninghub/scripts/runninghub_app.py`。
- `generation/workflow/image-to-video/wf-firstlast/` 挂在 `generation/workflow/` 功能子树：自带整份工作流图直跑「首帧+尾帧→视频」，**不是第二个网络出口**——凭证复用 `runninghub/scripts/rh_credential.py`；它是唯一一条不经 webapp 的生成路径，改图/改参数写在图里而非常量里。
- `generation/workflow/image-to-image/flux3-edit/` 挂在 `generation/workflow/` 功能子树：只做「参考图+编辑提示词→图」的单步对照实验与度量（保真 vs 改动量），**不是第二个网络出口**——提交仍转发给 `runninghub/scripts/runninghub_app.py`，webappId `2114585366186516481`。
- `generation/workflow/` 挂在 `generation/` 根：按功能归类的总目录——接口菜单与判据（五类，234 端点；架构×权重归属三象限、价格带、本账号通道）+ 实验台技能（`text-to-image/`：t2i-probe；`image-to-image/`：i2i-probe、flux3-edit；`text-to-video/`：t2v-probe；`image-to-video/`：i2v-probe、wf-firstlast；`video-to-video/`：仅菜单，调研态无技能），**不是网络出口**。
