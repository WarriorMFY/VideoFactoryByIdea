# RAG · 入库规则

> 只收入库卡：出图／出片验证 + 用户口头确认，两条缺一不可。草稿留在 `Log/`。
> 本文件只管归档规则：入库、存证、失效、目录判据。卡片内部怎么写不归这里管。

## 一、目录

```text
RAG/<类型复数>/<卡片名>/
  ├─ card.md                  唯一副本，检索入口
  ├─ evidence.md              运行时指纹 + 逐项判定
  ├─ prompt.txt               送验 Prompt 原文
  ├─ 01-pass-<载体>.<png|mp4> 通过证据
  └─ 02-fail-<问题>.<png|mp4> 已知偏差，可选
```

目录名按卡片类型起复数，**不设枚举**。现有 `actions/`、`styles/`、`portraits/`（只写脸）、`stylings/`（造型：服装＋体态＋构图＋机位＋动作，判据见 §六）；派生镜头卡进基础卡下 `cameras/`（§六）。`card.md` 内 `name` 须等于所在目录名。

## 二、准入

| 条件 | 说明 |
| --- | --- |
| 出片／出图验证 | 实跑并逐项判定，不得只看静帧推断动态 |
| 口头确认 | 用户明确说通过（不接受 AI 自判） |

格式自检**只记录、不拦截**——入库时由制卡方对一遍，结果记进 `evidence.md`。库内已有已知偏差且不能改（改则破 hash）：

- `actions/execution-shield-bash-throat-thrust-3f`：`description` 的竖线块内容未缩进，严格 YAML 取不到值。Circle3 定「逐字复制、不改一字」，改则破 `E9DD877F4114`。
- `styles/style-dark-fantasy` 与上卡：带 `type`／`scope`／`level`／`source` 额外键，验收侧已接受为白名单（2026-11-19 对齐）。

原「结构关 `validate.ps1`」「编译自检 `check_prompt.py`」两条已停用且失效：前者随 `00-spec/` 在 Circle7 删除，后者仓库中本就不存在。恢复须用户单独发话。

## 三、证据

`evidence.md` 缺任一项即无效：平台与应用、webappId、实例类型（lite／default／plus）、出图／出片时间、Task ID、结果 URL、Prompt 文件名与段数、卡片 hash（SHA256 前 12 位）。

入库前的运行记录留在实验链自己的 `manifest.json` 里；本节只规定入库本自己的 `evidence.md`。

媒体自 2026-11-16 起随卡片一并入库（§四末）；指纹仍逐项保留，用于在换机、换克隆后核对媒体是否被替换。

## 四、版本与失效

**卡片任何一行改动，hash 即变，旧证据自动失效**，必须重跑重确认。这是防止「卡 v3 配 v1 的图」的唯一手段。

```bash
python -c "import hashlib,pathlib;print(hashlib.sha256(pathlib.Path('RAG/<路径>/card.md').read_bytes()).hexdigest()[:12].upper())"
```

必须按**字节**算：库内多数 `card.md` 是 CRLF，`read_text()` 再 encode 会得到不同值（实测 `81404DCD4E58` 与 `7018DEDFAB75`）。

媒体命名：`pass-` 不可删，`fail-` 只留代表性一张，视频沿用同一前缀与序号。**2026-11-16 起 RAG 内所有文件都入 git**（含图片与视频），根 `.gitignore` 已加 `!RAG/**` 例外；`Log/`、`Workspace/` 下的媒体仍不入库。

## 五、单一副本

`Doc/` 不存实例卡，故 `RAG` 的 `card.md` 是唯一持久形态。

入库前原件在 `Log/` 的，**不原地加标注**（加行即破 hash），由 `Log/Circle<N>/` 的 `Circle.md`（摘要）与 `log.md`（全文）记路径，`evidence.md` 留一行。原件被删（如 Circle7 删掉的镜头卡 `Doc/` 副本），在 `evidence.md` 末尾加追记、写历史提交号，不动正文。

存量卡内对已删路径的历史引用（`stylings/figure-fullbody-pretty-casual` 的 `card.md:25` 与 `evidence.md:44`）**不追改**——改则破 hash。

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

**一对一主副卡不收进 `cameras/`**：不设中间分组目录，副卡目录直接挂在主卡下，目录名即副卡 `name`。首个主副实例：`portraits/figure-symmetric-cartographer/portrait-fixed-variables/`（副卡 `21903F58A6EB`，主卡 `631A7C6F1914`），两者共用同一份 `prompt.txt` 与同一批样张。

**肖像卡与造型卡分家（2026-11-17）**：只写脸的进 `portraits/`——骨相、比例、五官、肤质，脸以外一条不写；卡面只要出现**服装、体态、构图、机位、动作**中任何一项，就进 `stylings/`。这五项都是「造型怎么呈现」，机位尤其如此：同一个人换机位就是另一套造型效果，把它判出卡外等于让「造型」只剩衣服。两个实例正好卡在两侧：`portraits/figure-symmetric-cartographer/` 六行全是部位，无一字服装机位；`stylings/figure-fullbody-pretty-casual/` 里服装三行、体态、构图、机位、动作各一行。

## 七、入库清单

| 路径 | 卡 | hash |
| --- | --- | --- |
| `actions/execution-counter-straight-strike-v2/` | 防反·拨开推掌 v2（5 帧） | `3292E2510FB9` |
| `actions/execution-counter-straight-strike-v2/cameras/camera-aux-counter-straight-strike-v2/` | 派生镜头卡 v3.2 | `EDB11AB333B3` |
| `actions/execution-shield-bash-throat-thrust-3f/` | 盾击·锁喉·贯胸（3 帧） | `E9DD877F4114` |
| `styles/style-dark-fantasy/` | 暗黑奇幻（画风） | `81404DCD4E58` |
| `portraits/figure-symmetric-cartographer/` | 对称正脸肖像（主，6 行）+ `portrait-fixed-variables/` 固定变量（副，11 条） | `631A7C6F1914` / `21903F58A6EB` |
| `stylings/figure-fullbody-pretty-casual/` | 全身站姿造型（服装＋体态＋构图＋机位＋动作；desc 内含「肤白貌美大长腿」的量化定义） | `BE7673985F89` |

hash 以实际文件为准，不符先重算再改表。

## 八、检索（暂缓）

索引只收 `card.md`，`evidence.md`、`prompt.txt`、媒体均为附件，不参与语义检索。方案待建。
