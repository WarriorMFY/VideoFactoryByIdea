# AGENTS.md — ExecFactory 工作约定（精简版）

> 从 VideoFactory 的完整纪律里抽出的最小集：一条链、一个人、可验证优先。
> 完整版方法论见来源仓库；本包只保留执行这条链必须遵守的部分。

## 目录约定

| 目录 | 放什么 |
|---|---|
| `Tool/` | 能执行的代码。按域分目录（ops / audio / lib / check / setup），每目录一份同名 `.md` |
| `Skills/` | 作业指导书：判据、流程、坑位。**不放代码**，只引用 `Tool/` 路径 |
| `Material/` | 素材库：注册表 `kinds.json` + 六册规范 + 各题材目录。实体在磁盘、账本入库 |
| `Prototype/` | 一次性实验与样例。样例要能重跑，产出要留基准数字 |
| `History/` | 过程留痕：运行回执 `runs/`、发布回执 `publish/`、能力来源 `capability/`、日志 `CircleLog/log.md` |
| `Workspace/` | 依赖、缓存、登录态、临时文件。可清空，bootstrap 重建 |

## 三条硬纪律

1. **判据留根，做法下沉**：授权红线、账号纪律写在本文与 `Idea/Idea.md`；具体怎么做对，写在 `Skills/` 与各 `Tool/*.md`。
2. **数字先于形容词**：不写"效果不错"，写"0.3x 占比 33.6%（≤35%）、11 缝 0 转场级"。做不到量化就说"未测"。
3. **不伪造、不美化**：跑失败写失败；平台没给数就写 null，绝不用 0 冒充。

## 提交纪律

- 只有两种时刻提交：一轮工作收尾、或明确要提交。
- 提交前跑 `node Tool/check/material_layout.mjs`（动过素材库时）+ 语法自检。
- 提交信息写"做了什么 + 读数"，不写"update"。

## 素材纪律（摘要）

- 一题材一目录、一素材类一目录；母带放 `题材/源片/`，多类共用一份。
- 单位命名 `uNN`，三件套齐（mp4/jpg/ass），根目录 `catalog.csv` + `index.html`。
- 任何实体搬动都要同步账本 `Material/manifest.jsonl`，否则 `material_layout` 报 F1/F7。
- 授权判定只有 `Tool/lib/license.mjs`：`PUBLISHABLE_CLASSES` 之外的素材不进成片。

## 账号纪律（硬约束）

| 用途 | 账号 | 落点 |
|---|---|---|
| 采集（下载/取样） | 采集号 | `BILI_PROFILE=Workspace/run/bili_profile_<采集号>` 环境变量 |
| 发布（投稿） | 发布号 | 默认 `Workspace/run/bili_profile`（publish_bilibili 硬编码） |

> 换号 = 换 profile 目录，不是改参数。换完先 `publish_bilibili.mjs status` 核对 UID 再动。
