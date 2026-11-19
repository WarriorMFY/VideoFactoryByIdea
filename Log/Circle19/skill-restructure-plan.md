# 技能库重排方案 · 第三版（成员 ≥2 才建层）

> 状态：已执行（2026-11-19，Circle19，用户授权）。执行记录与验证结果见 `Circle.md`。
> 实际与方案的差异：无结构差异；额外补了 6 处遗漏引用（run_l3/run_l4 的 DEFAULT_RUNNER、skill-viewer SKILL.md、Circle3/4 三个 runner）。
> 判据唯一真相源将落在 `Skill/README.md` 与 `Skill/hub/README.md`，本文件只是施工图。

## 一、定稿结构

```
Skill/
├── README.md                        新建：四桶定义 + 判定树 + 铁律
├── meta/
│   ├── README.md                    ← 原 Skill/Meta/README.md（5 条规则原文）+ 追加「本桶清单」
│   └── skill-viewer/                ← 原 Skill/SkillViewer/
├── hub/
│   ├── README.md                    新建：生成/剪辑分界 + 切合量转 + 本桶清单
│   ├── generation/
│   │   └── runninghub/              ← 原 Skill/RHClaw/（拍平，LICENSE/README/.gitignore 一并进）
│   └── editing/
│       ├── cut/                     新建（成员=2）
│       │   ├── image-matte/         ← 原 Skill/image-matte/
│       │   └── fetch-video-frame/   ← 原 Skill/FetchVideoFrame/
│       └── pixel-anchor/            ← 原 Skill/pixel-anchor/（members=1，不建 compose/）
├── chain/
│   ├── README.md                    新建
│   ├── card-experiment/             ← 原 Skill/card-experiment-chain-v2/
│   ├── card-experiment-v1/          ← 原 Skill/card-experiment-chain/（退役）
│   └── shot-repaint/                ← 原 Skill/shot-repaint-chain/
└── other/
    ├── README.md                    新建
    ├── interactive-action-card-validation/
    ├── action-card-validation/      （已废除）
    └── desc-to-spec/
```

技能数 11，分布 meta 1 / hub 4 / chain 3 / other 3。

## 二、判据（写进 README，作为唯一真相）

1. **生成 vs 剪辑**：同一输入、同一命令重跑，输出是否唯一？
   - 不唯一 → `generation/`（采样）
   - 唯一 → `editing/`（确定性重组）
   - 看「是否采样」，不看「是否用了模型」：本地离线模型（抠图）确定性成立，归剪辑。
2. **剪辑侧动作字母表**：切 `cut` / 合 `compose` / 量 `measure` / 转 `convert`，四类穷尽。
3. **建层规则**：同一父目录下成员 ≥2 才建子层；单孩子链与空桶都不建。
4. **深度**：脚本找仓库根一律向上遍历（含 `Skill` + `Tool` 的目录），不用 `parents[n]`。

## 三、git mv 清单（12 条）

> Windows 大小写不敏感，`Skill/Meta` → `Skill/meta` 必须走文件级移动，不能整目录改名。

```powershell
# 0 先建父目录（git mv 不自动建多级目标）
New-Item -ItemType Directory -Force `
  Skill/meta, Skill/hub/generation, Skill/hub/editing/cut, Skill/chain, Skill/other | Out-Null

# 1 meta
git mv Skill/Meta/README.md Skill/meta/README.md
Remove-Item Skill/Meta -Force            # 空目录，不入库

# 2 meta
git mv Skill/SkillViewer Skill/meta/skill-viewer

# 3 hub/generation（两层层级拍平）
git mv Skill/RHClaw Skill/hub/generation/runninghub

# 4-6 hub/editing
git mv Skill/image-matte      Skill/hub/editing/cut/image-matte
git mv Skill/FetchVideoFrame  Skill/hub/editing/cut/fetch-video-frame
git mv Skill/pixel-anchor     Skill/hub/editing/pixel-anchor

# 7-9 chain
git mv Skill/card-experiment-chain-v2 Skill/chain/card-experiment
git mv Skill/card-experiment-chain    Skill/chain/card-experiment-v1
git mv Skill/shot-repaint-chain       Skill/chain/shot-repaint

# 10-12 other
git mv Skill/interactive-action-card-validation Skill/other/interactive-action-card-validation
git mv Skill/action-card-validation              Skill/other/action-card-validation
git mv Skill/desc-to-spec                        Skill/other/desc-to-spec
```

改名带来的 `name:` 同步（`SKILL.md` frontmatter）：

| 技能 | 旧 name | 新 name |
| --- | --- | --- |
| skill-viewer | `SkillViewer` | `skill-viewer` |
| runninghub | `runninghub` | 不变 |
| image-matte | `image-matte` | 不变 |
| fetch-video-frame | `FetchVideoFrame` | `fetch-video-frame` |
| pixel-anchor | 无 frontmatter | 建议补 `name: pixel-anchor` |
| card-experiment | `card-experiment-chain-v2` | `card-experiment` |
| card-experiment-v1 | `card-experiment-chain` | `card-experiment-v1` |
| shot-repaint | `shot-repaint-chain` | `shot-repaint` |
| 其余 | — | 不变 |

## 四、必改的代码路径（不做就断）

### 4.1 找仓库根的方式（层次变了，`parents[n]` 全错位）

| 文件 | 现写法 | 处置 |
| --- | --- | --- |
| `chain/card-experiment/scripts/run_video.py:15` | `parents[3]` | 换 `_repo_root()` |
| `chain/card-experiment/scripts/run_still.py:15` | `parents[3]` | 同上 |
| `chain/card-experiment/scripts/ledger.py:19` | `parents[3]` | 同上 |
| `chain/card-experiment/scripts/new_chain.py:17` | `parents[3]` | 同上（:18 `parents[1]` 保留） |
| `chain/card-experiment-v1/scripts/run_video.py:17` | `parents[3]` | 同上 |
| `chain/card-experiment-v1/scripts/run_still.py:15` | `parents[3]` | 同上 |
| `chain/card-experiment-v1/scripts/ledger.py:19` | `parents[3]` | 同上 |
| `chain/card-experiment-v1/scripts/new_chain.py:17` | `parents[3]` | 同上 |
| `meta/skill-viewer/scripts/view_tree.py:20` | `parents[3]` | 同上；另需支持 `hub/editing/cut/image-matte` 这类带桶路径 |
| `hub/editing/cut/fetch-video-frame/scripts/prepare.py:19` | `parents[3]` | 同上 |
| `hub/editing/cut/fetch-video-frame/scripts/extract.py:19` | `parents[3]` | 同上 |

统一实现（已在 `image-matte/scripts/matte.py:18` 落地，复制即用）：

```python
def _repo_root(start: Path) -> Path:
    for p in [start, *start.parents]:
        if (p / "Skill").is_dir() and (p / "Tool").is_dir():
            return p
    raise SystemExit("找不到仓库根（需同时含 Skill/ 与 Tool/）")
```

`image-matte/scripts/{matte,matte_models}.py` 与 `pixel-anchor/scripts/anchor.py` 的 `_repo_root` 兜底 `return start.parents[3]` 顺手改成抛错，避免静默指向错误目录。

### 4.2 Tool 薄壳与工具

| 文件:行 | 改成 |
| --- | --- |
| `Tool/matte.py:12` | `Skill/hub/editing/cut/image-matte/scripts/matte.py`（docstring 2、5 行同步） |
| `Tool/matte_models.py:8` | `Skill/hub/editing/cut/image-matte/scripts/matte_models.py`（docstring 2 行） |
| `Tool/anchor.py:12` | `Skill/hub/editing/pixel-anchor/scripts/anchor.py`（docstring 2、5 行） |
| `Tool/account.py:14` | `Skill/hub/generation/runninghub/scripts`（docstring 3 行） |
| `Tool/smoke_test.py:20` | `Skill/other/action-card-validation/scripts` |
| `Tool/smoke_test.py:21` | `Skill/hub/generation/runninghub/scripts` |

### 4.3 文档（顺带修正本已指错版本的引用）

| 文件:行 | 现状 | 改成 |
| --- | --- | --- |
| `Doc/RunningHub/APP/README.md:4` | `Skill/RHClaw/runninghub/scripts/runninghub_app.py` | `Skill/hub/generation/runninghub/scripts/runninghub_app.py` |
| `Doc/Cards/spec.md:4,5,11,35` | `Skill/card-experiment-chain/`（**v1**） | `Skill/chain/card-experiment/`（现役 v2） |
| `RAG/README.md:24,37,55` | `Skill/card-experiment-chain/`（**v1**） | `Skill/chain/card-experiment/` |

`Doc/RunningHub接口价格调研与最佳性价比验证方案-2026-11-15.md:18` 属历史记录（含日期版本号），不改，保留当时路径的事实。

### 4.4 技能内示例命令与跨技能引用

| 文件 | 内容 |
| --- | --- |
| `hub/editing/cut/image-matte/SKILL.md:20`、`scripts/matte.py:7`、`scripts/matte_models.py:7-9,77` | 命令路径 |
| `hub/editing/cut/fetch-video-frame/SKILL.md:22,24` | 命令路径 |
| `hub/editing/pixel-anchor/SKILL.md:22-25`、`scripts/anchor.py:6-9` | 命令路径 |
| `hub/editing/pixel-anchor/SKILL.md:28` | 跨技能引用改 `Skill/hub/editing/cut/image-matte` |

### 4.5 Log 下的脚本（不是日志正文，必须改）

| 文件:行 | 改成 |
| --- | --- |
| `Log/Circle10/runway/run_variant.py:14` | `Skill/hub/generation/runninghub/scripts` |
| `Log/Circle14/Tool/credit.py:13` | 同上（原写 `RHclaw` 小写，Windows 容忍、Linux 会崩，一并修正） |
| `Log/Circle14/Tool/credit.py:27` | `Skill/chain/card-experiment/credential.txt` |
| `Log/Circle15/seg/gen.py:11` | `Skill/chain/card-experiment/scripts` |
| `Log/Circle15/seg/run_one.py:13` | 同上 |
| `Log/Circle15/i2v-anchor/test_anchor.py:18` | 同上 |

Log 中的 `.md` 日志正文一律不改（历史事实）。

## 五、五份 README 草稿

### 5.1 `Skill/README.md`（新建）

```markdown
# 技能库

> 四个桶，一个判定树。技能内部结构（SKILL.md / reference / scripts / templates / evidence / stages）
> 四桶一致，不因桶不同而变形。

## 四桶

| 桶 | 收什么 | 判据 |
| --- | --- | --- |
| `meta/` | 作用于技能与规范本身的工具 | 不产媒体、不调通道 |
| `hub/` | 被链直接调用的共用底座 | 单命令或单 CLI，无 stages |
| `chain/` | 多阶段流水线 | 有 stages/ 子技能，上阶段产物喂下阶段 |
| `other/` | 验收口径、退役技能 | 不参与编排 |

## 判定树

```
有 stages/ 子技能、上阶段产物是下阶段输入？
├── 是 → chain/
└── 否
    ├── 产出媒体像素或调通道？
    │   ├── 是 → 同输入重跑结果唯一？ 是 → hub/editing/ ｜ 否 → hub/generation/
    │   └── 否 → 作用于技能/规范本身？ 是 → meta/ ｜ 否 → other/
```

## 铁律

1. 生成与剪辑的分界看「采样」不看「模型」。
2. 同一父目录下成员 ≥2 才建子层；单孩子链与空桶都不建。
3. 技能目录名 = `SKILL.md` 的 `name`；一律 kebab-case。
4. 技能内部只引用本技能树内的文件（`meta/README.md` 规则 5）。
5. 每桶一个 README 作唯一清单，本文件不列技能。

## 下钻

`meta/README.md` · `hub/README.md` · `chain/README.md` · `other/README.md`
```

### 5.2 `Skill/meta/README.md`（原文 5 条不动，末尾追加）

```markdown
## 本桶清单

| 技能 | 一句话 | 何时用 |
| --- | --- | --- |
| `skill-viewer/` | 只读输出任一技能挂载树，每个文件附一句摘自其自身的描述 | 想看清某技能由哪些文件组成 |
```

### 5.3 `Skill/hub/README.md`（新建）

```markdown
# hub · 共用底座

被链直接调用、自身不编排阶段的技能放这里。分两层：生成与剪辑。

## 分界（唯一判据）

> 同一输入、同一命令重跑，输出是否唯一？
> 不唯一 → `generation/`（采样）　唯一 → `editing/`（确定性重组）

看「是否采样」，不看「是否用了模型」：本地离线模型的推理若确定，归剪辑。

## generation/ · 采样

| 二级 | 判据 | 纪律 | 成员 |
| --- | --- | --- | --- |
| `cloud/` | 远端采样、按次计费 | 留 task 号、prompt 快照、实扣，记 `ledger.json` | `runninghub/` |
| `local/` | 本机采样、免费 | 留种子与模型版本，不记账 | 暂无（成员 ≥2 才建） |

## editing/ · 确定性重组

四个动词穷尽剪辑侧。

| 动作 | 做什么 | 成员 |
| --- | --- | --- |
| `cut/` | 按形状或时间分离已有像素 | `image-matte/`、`fetch-video-frame/` |
| `compose/` | 把分离的像素放回或拼起来 | `pixel-anchor/`（兼 measure） |
| `measure/` | 只读量测，产出数字 | 暂无 |
| `convert/` | 编码与容器搬运 | 暂无（`Tool/ffmpeg.py` 现为二进制转发壳） |

## 备注

- `pixel-anchor` 的 `masks` 与 `score --rematte` 借本地抠图模型，输出确定，仍属 `editing/`，不跨桶。
- `compose/` 暂不建：`pixel-anchor` 是 editing 侧唯一的"合+量"，成员不足 2。
- 出图出片一律经 `generation/cloud/runninghub`，这是全库唯一网络出口。
```

### 5.4 `Skill/chain/README.md`（新建）

```markdown
# chain · 流水线

一条链 = 有阶段顺序、上一阶段产物是下一阶段输入的技能。阶段各自独立，只靠落盘产物衔接。

## 共同契约

1. 阶段表写在各链 `SKILL.md`；前一阶段未过线不得进入下一阶段。
2. 每阶段产物落盘（prompt 快照、`run.json`、`manifest.json`），链内可离线复现。
3. 整卡／整提示词直送：脚本只拼接，不抽字段、不改写、不调语序。
4. 人工验收：PASS 与入库必须用户点头，AI 不自判。
5. 退役链留在原位、目录加 `-vN`，正文不改，仅供追溯。

## 本桶清单

| 链 | 阶段 | 状态 |
| --- | --- | --- |
| `card-experiment/` | 定轴选元卡 → 填实例卡 → 出图 → 出视频 | 现役（v2） |
| `card-experiment-v1/` | G0–G6 七道闸门 | 退役，仅追溯 |
| `shot-repaint/` | 切段 → 取帧配卡 → 重绘 → 验收拼回 | 现役 |
```

### 5.5 `Skill/other/README.md`（新建）

```markdown
# other · 兜底

不属于 `meta/` `hub/` `chain/` 的东西放这里。当前两类：验收口径、需求转译。

## 准入

- 不产媒体、不调通道、不参与编排，且不作用于技能或规范本身。
- 同类东西出现到第 3 个时，应当新开桶，而不是继续塞。

## 本桶清单

| 技能 | 一句话 | 状态 |
| --- | --- | --- |
| `interactive-action-card-validation/` | 交互动作卡验收：触发判定 → L1 格式 → L2 语义时序 → L3 图 → L4 视频 | 现役 |
| `action-card-validation/` | 老的四级漏斗验收（L1–L4） | 已废除 2026-11-14，仅追溯 |
| `desc-to-spec/` | 模糊需求 → 可量化规格（Desc→Spec） | 现役 |
```

## 六、三步提交

| 步 | 内容 | 验证 |
| --- | --- | --- |
| ① 只搬家 | 12 条 `git mv` + 4 份新 README + meta README 追加 + `name:` 同步 | `git status` 无未跟踪残留；`git log --follow` 能追到旧路径 |
| ② 修引用 | 第 4 节全部条目；`parents[3]` 统一换 `_repo_root()` | `python Tool/anchor.py --help`、`python Tool/matte.py --help`、`python Skill/meta/skill-viewer/scripts/view_tree.py hub` 三条全通；全库 grep 旧路径为零 |
| ③ 内容整理 | 凭据收归（两份 `credential.txt` → `hub/generation/runninghub/`，加 `.gitignore` + 模板）、v1 加 `status: retired`、`interactive-...` 98 行瘦身、通道参数唯一真相源 | 需用户逐项拍板，不并入①② |

## 七、风险与回滚

- 全部为 rename，git 可 `git reset --hard` 回到重排前；`Skill/` 无未提交改动时风险为零。
- 风险集中在 ② 之后：路径写错会静默指向旧目录。故 ② 必须以「旧路径 grep 为零」为收口条件。
- Windows 大小写：`Meta` → `meta` 用文件级移动，避免大小写不敏感导致的 no-op。
