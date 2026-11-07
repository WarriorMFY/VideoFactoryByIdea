# Material/ — 本地素材库

> 素材**实体**只存本机磁盘（可重采、可重建，`.gitignore` 排除）；**入库的只有账本与人读索引**——这是本目录与其它目录最大的不同：目录里多数文件不在 git 里。
> 回链：[AGENTS.md §3.1](../../AGENTS.md) · [Prototype 索引](../Prototype.md) · [工具 Tool/ops/](../Tool/ops/ops.md)

## 目录内容

| 条目 | 职责 | 入库 |
|---|---|---|
| `manifest.jsonl` | **总账**（唯一可信来源）：id（sha256 前 10 位）/ tier / kind / tags / 来源 / 授权 / 时长 / 路径 | ✅ |
| `INDEX-<主题>.md` | 账本的**人读视图**，一主题一份（当前 `INDEX-影零处决.md`）。属数据视图，不是本目录的说明文件 | ✅ |
| `library/video/` | 素材实体（视频），当前 49 项 / 902MB | ❌ gitignore |
| `library/image/` | 素材实体（图片），当前 144 项 / 312MB | ❌ gitignore |
| `briefs/` | 采集简报（`plan`/`brief` 子命令产出，供人挑方案） | ✅ |
| `inbox/` | 待处理区：刚下载、尚未 allot 到 library 的批次 | ❌ gitignore |
| `quarantine/` | **隔离区**：授权不明（NC/ND/未知）的素材，promote 前不得用于发布 | ❌ gitignore |

当前存量（2026-11-07 实测）：**194 条账本记录**，实体合计约 1.2GB。

## 代价分级（采什么、花多少）

| 级别 | 来源 | 代价 | 纪律 |
|---|---|---|---|
| L0 | 库内复用（先 `list` 再采） | 0 | 永远优先 |
| L1 | 开放授权网采（NASA PD / Wikimedia） | 0 积分 | 署名与授权自动登记进账本 |
| L2 | 待核授权（NC / ND / 未知） | 0 | **只进 quarantine**，promote 前不得发布 |
| L3 | AI 生成 | 积分 | 强制 `ai_generated=true`，成片须声明 |

## 怎么用

```bash
node Tool/ops/collect_material.mjs list --tag 仪式级        # L0 先查库里有没有
node Tool/ops/collect_material.mjs plan "重史诗感 星云"      # 出四级方案卡，人不选不动
node Tool/ops/collect_material.mjs fetch <planId>           # 采集（并发闸 + sha256 去重 + ffprobe 质检）
node Tool/ops/collect_material.mjs register --file x.png --tier L3 --ai  # 登记 AI 产物
node Tool/ops/collect_material.mjs brief <theme>            # 采集简报
```

## 铁律

1. **新增素材必须入账**（`fetch` / `register` 自动写），账本与实体一一对应，不允许"手放进 library 不记账"；
2. **sha256 幂等**：重复采集只跳过、不重复入库，可放心重跑；
3. **来源、授权、出处必须如实填**——这是唯一能让"能不能用/能不能发"被机器判断的字段；
4. 索引与账本必须同步：新增主题批次时补一份 `INDEX-<主题>.md`，供人快速翻查取用命令与区间。

## 现有主题索引

| 索引 | 内容 |
|---|---|
| [INDEX-影零处决.md](INDEX-影零处决.md) | 影之刃零处决全集（批次 `loop38_exec_archive`，185 条：源片 1 + 处决镜头 46 + 关键帧 138；来源 BV1ydx26rEWv，研究/评论引用） |
