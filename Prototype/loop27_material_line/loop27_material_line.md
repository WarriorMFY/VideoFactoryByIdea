# loop27_material_line/ — 素材采集线 collect_material

> 素材采集线 collect_material。关键结果：采集线可用
> 回链：[AGENTS.md §3.3](../../AGENTS.md) · [循环日志 #loop27](../../History/CircleLog/log.md#loop27) · [Prototype 索引](../Prototype.md)

## 目录内容

根目录另有 1 个数据产物文件（.jpg×1），均为本轮产物，不单列。

## 说明（原 `README.md` 正文）

### loop27 · 素材采集线（collect_material.mjs）

> 目标：为工厂建立**稳定、可灵活选择代价层级**的素材采集入口，服务内容创造。
> 人说「我想查看一些重史诗感的作品」，采集器给出不同代价下的方案，人选完再**最大限速采集**。

#### 交互模型（方案卡即闸门）

```
node Tool/ops/collect_material.mjs plan --need "重史诗感" --type any
```

输出四级方案，**不选不动**：

| 层级 | 代价 | 内容 | 产物去向 |
| --- | --- | --- | --- |
| L0 库内复用 | 0 积分 / 0 流量 | 先查 manifest 再谈采集 | — |
| L1 开放授权网采 | 0 积分（耗时=带宽） | NASA(PD)、Wikimedia Commons（转码/缩略） | `Material/library/`，授权+署名自动登记 |
| L2 待核授权网采 | 0 积分 + 人工核授权 | NC/ND/未知授权候选 | `Material/quarantine/`，**promote 前不得用于发布** |
| L3 AI 生成 | 消耗积分 | `brief` 出采集简报 → agent 执行 ImageGen/VideoGen → `register` | `Material/library/`，强制 `ai_generated=true` |

选好后执行（例）：

```
node Tool/ops/collect_material.mjs fetch --need "重史诗感" --type any --limit 6
node Tool/ops/collect_material.mjs list --need "重史诗感"
```

#### 本次实测（重史诗感）

- `plan`：NASA(PD) 命中 332；Openverse 本网络不可达（自动降级标注）
- 图片 ×6：5 张 NASA 星云（PD/CC0，最大 2920²）入库 + 1 张 Wikimedia 航拍（CC BY-SA）进隔离区
- 视频 ×2：NASA 猎户座星云红外影像 1080p/128s（PD）+ Wikimedia Desolation Creek 航拍 1080p/174s（CC BY）入库；NASA 其余候选 320p 被画质地板（540p）拦下
- `brief`：4 条 L3 简报（epic landscape aerial / mountain clouds aerial / …）
- `register`：B站头像 avC_final.png 以 L3 登记入库（ai_generated=true 演示 AI 声明纪律）
- 库预览：`library_sheet.jpg`（4×2，本目录）

#### 复现步骤

1. `node Tool/ops/collect_material.mjs plan --need "重史诗感" --type any`
2. `node Tool/ops/collect_material.mjs fetch --need "重史诗感" --type image --limit 6 --max-mb 40`
3. `node Tool/ops/collect_material.mjs fetch --need "重史诗感" --type video --limit 2 --max-mb 200`
4. `node Tool/ops/collect_material.mjs list`
5. `node Tool/ops/collect_material.mjs brief --need "重史诗感" --count 4`
6. `node Tool/ops/collect_material.mjs register --path <文件> --tags a,b --cost L3`

数据结构：`Material/manifest.jsonl`（总账，一行一素材，入库）/ `Material/library|quarantine|inbox`（实体，gitignore）/
采集回执 `History/runs/materials/<run_id>.json`（候选/入库/隔离/去重/失败/中止 全计数）。

#### 已知边界与坑

- **免费视频源的真实画质水位**：NASA 存档视频多为 320p（历史素材），能过 540p 地板的少数是 1080p；
  Wikimedia 有 4K 原片（GB 级），走官方转码档可拿 1080p（几十~几百 MB）。高画质视频 L1 能覆盖但**体积与耗时线性涨**；
  精确风格（如赛博朋克夜景）L1 覆盖弱 → 该走 L3。
- NASA 教育图常自带标题字幕（见预览图第 4 格），发布前需过目。
- Openverse 在当前网络不可达，代码保留为可选源（`--source nasa,wiki,ov`）。
- 坑 25/26/27 详见 `Tool/ops/ops.md`。

#### 反馈点（等人裁决）

1. 代价层级划分与命名（L0-L3）是否合适？要不要把「积分」显式量化进方案卡？
2. L2 隔离区的 promote 流程目前是人工核授权后 `register --cost L1` 重登，要不要做 `promote` 子命令？
3. 需要接 Pexels/Pixabay（要 API key，1080p 免费视频主力源）吗？key 由人申请后进 env。
4. L3 简报的 prompt 模板风格是否符合口味（现在偏通用 cinematic）？
