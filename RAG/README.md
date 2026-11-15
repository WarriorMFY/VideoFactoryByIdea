# RAG · 入库规则

> 只收入库卡：出图／出片验证 + 用户口头确认，两条缺一不可。草稿留在 `Log/`。
> 卡片格式归 `Doc/Cards/spec.md`；本文件只管入库、存证、失效。

## 一、目录

```text
RAG/<类型复数>/<卡片名>/
  ├─ card.md                  唯一副本，检索入口
  ├─ evidence.md              运行时指纹 + 逐项判定
  ├─ prompt.txt               送验 Prompt 原文
  ├─ 01-pass-<载体>.<png|mp4> 通过证据
  └─ 02-fail-<问题>.<png|mp4> 已知偏差，可选
```

目录名按卡片类型起复数，**不设枚举**（spec 已取消 `type` 约束）。现有 `actions/`、`styles/`；派生镜头卡进基础卡下 `cameras/`（§六）。`card.md` 内 `name` 须等于所在目录名。

## 二、准入

| 条件 | 说明 |
| --- | --- |
| 出片／出图验证 | 实跑并逐项判定，不得只看静帧推断动态 |
| 口头确认 | 用户明确说通过 |

`spec.md` 符合性**只自检、不拦截**——入库前跑一次，结果记进 `evidence.md`。库内已有不符项且不能改：

- `actions/execution-shield-bash-throat-thrust-3f`：`description` 的竖线块内容未缩进，严格 YAML 取不到值。Circle3 定「逐字复制、不改一字」，改则破 `E9DD877F4114`。
- `styles/style-dark-fantasy` 与上卡：带 `type`／`scope`／`level`／`source` 额外键。spec 允许，但 `Skill/interactive-action-card-validation` 格式项 5 仍要「恰好 2 键」，用它校验动作卡会 FAIL——**待对齐**。

原「结构关 `validate.ps1`」「编译自检 `check_prompt.py`」两条已停用且失效：前者随 `00-spec/` 在 Circle7 删除，后者仓库中本就不存在。恢复须用户单独发话。

## 三、证据

`evidence.md` 缺任一项即无效：平台与应用、webappId、实例类型（lite／default／plus）、出图／出片时间、Task ID、结果 URL、Prompt 文件名与段数、卡片 hash（SHA256 前 12 位）。

媒体不入 git（§四末），这些指纹是唯一能重建证据的凭据。

## 四、版本与失效

**卡片任何一行改动，hash 即变，旧证据自动失效**，必须重跑重确认。这是防止「卡 v3 配 v1 的图」的唯一手段。

```bash
python -c "import hashlib,pathlib;print(hashlib.sha256(pathlib.Path('RAG/<路径>/card.md').read_bytes()).hexdigest()[:12].upper())"
```

必须按**字节**算：库内多数 `card.md` 是 CRLF，`read_text()` 再 encode 会得到不同值（实测 `81404DCD4E58` 与 `7018DEDFAB75`）。

媒体命名：`pass-` 不可删，`fail-` 只留代表性一张，视频沿用同一前缀与序号。**2026-11-15 起图片与视频不入 git**，根 `.gitignore` 已屏蔽，`pass-`／`fail-` 只留本地磁盘。

## 五、单一副本

`Doc/Cards` 自 Circle7 起只有 `spec.md` 与 `Template/`，不存实例卡，故 `RAG` 的 `card.md` 是唯一持久形态。

入库前原件在 `Log/` 的，**不原地加标注**（加行即破 hash），由 `Log/Circle<N>/` 的 `Circle.md`（摘要）与 `log.md`（全文）记路径，`evidence.md` 留一行。原件被删（如 Circle7 删掉的镜头卡 `Doc/` 副本），在 `evidence.md` 末尾加追记、写历史提交号，不动正文。

## 六、派生卡与独立卡

一对一派生卡收在基础卡子目录，不建顶层目录——路径即声明绑定，顶层默认「可复用通用资产」；检索只收基础卡 `card.md`，派生卡为附件；基础卡 hash 一变，派生卡全废。目录名与派生卡 `name` 一致、不随版本改名；库内只留当前版，历史版归档 `Log/Circle<N>/archive/`，在 `evidence.md`「派生链」表留痕。

```text
RAG/<类型复数>/<基础卡名>/
  ├─ card.md / evidence.md / prompt.txt / 01-pass-…
  └─ cameras/<派生卡名>/
      └─ card.md / evidence.md / prompt.txt / 01-pass-…
```

**判据看内容不看命名**：引用某张基础卡的具体帧号／动作节点／接触点 → 派生卡；只描述自身维度、换动作换镜头都不必改本卡 → 独立卡，进顶层。Circle6 实测支持后者：场景卡环境五要素 3/3 条兑现 5/5、动作链 3/3 全过，属独立卡，将来入库开 `RAG/scenes/`（未入库，目录暂不建）。顶层 `cameras/` 同理暂不建。

首个派生实例：`actions/execution-counter-straight-strike-v2/cameras/camera-aux-counter-straight-strike-v2/`（`EDB11AB333B3`，实测件产自 v3.1 `6839884B436B`）。

## 七、入库清单

| 路径 | 卡 | hash |
| --- | --- | --- |
| `actions/execution-counter-straight-strike-v2/` | 防反·拨开推掌 v2（5 帧） | `3292E2510FB9` |
| `actions/execution-counter-straight-strike-v2/cameras/camera-aux-counter-straight-strike-v2/` | 派生镜头卡 v3.2 | `EDB11AB333B3` |
| `actions/execution-shield-bash-throat-thrust-3f/` | 盾击·锁喉·贯胸（3 帧） | `E9DD877F4114` |
| `styles/style-dark-fantasy/` | 暗黑奇幻（画风） | `81404DCD4E58` |

hash 以实际文件为准，不符先重算再改表。

## 八、检索（暂缓）

索引只收 `card.md`，`evidence.md`、`prompt.txt`、媒体均为附件，不参与语义检索。方案待建。
