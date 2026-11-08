# review/ — 循环评审页生成器

> 一句话用途：把一轮小循环的产物组织成一个**可在线看、可分享、可下载**的单页站点——「人验证」的固定物料。由 loop42 手工搭站提炼（三轮手写 `index.html` + 手工硬链接 + 手工抽封面后提炼成配置驱动）。

## 何时用

- 人说「给我看 / 给个链接 / 我再看看」——需要把本轮产物发给人评审时
- 发布动作本身（`workbuddy_sites_deploy`）在**页面生成完之后**由 agent 执行，需人工授权

## 用法（两条命令）

```bash
# ① 写一份 review.json（放在循环目录下，file 字段相对该目录）
# ② 生成
node Tool/review/review_page.mjs --config Prototype/loopNN_xxx/review.json [--out site] [--clean]
# ③ 发布（agent 调用，需人工发话）
workbuddy_sites_deploy(directory=<out>, language="static")
```

`--out` 相对**当前工作目录**；`--clean` 重跑前清空输出目录（slug 改名后旧文件不会自动消失，换结构重发必用）。

## 配置字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `title` | ✓ | 页面大标题 |
| `kicker` / `lead` / `tags[]` | | 眉题 / 一句话导语 / 顶部徽标条 |
| `hero` | | 主推大卡：`file` `title` `desc` `posterAt`（秒）`steps[]`（`{text, kind: hit\|fast\|slow}`）`slug` |
| `heroKicker` | | 主推区标题，默认「主推」 |
| `sections[]` | ✓（与 hero 至少其一） | `{name, items[]}`，每个 item 同 hero 字段 + `accent: A\|B\|C\|D`（顶部色条） |
| `notes` | | `{summary, items[], open}` 折叠说明区；**items 是 HTML 片段**（可用 `<b>`），其余字段一律转义 |
| `footer` | | 页脚 HTML；缺省为生成器署名 + 时间 |
| `shareLink` | | 上次发布链接，回填后工具生成的清单会带上 |

**不用手写的**：时长/分辨率（ffprobe 自动）、体积（自动）、封面（`posterAt` 缺省取 35% 处，避开片头黑场）。

## 设计决策（为什么这样做）

- **硬链接不复制**：同盘 `linkSync`，151MB 页面目录实际近零增量；跨盘自动退化为复制并告警
- **slug 用 ASCII**：URL 里的中文文件名靠编码碰运气；页面显示 `title`，`download` 属性保留原中文文件名
- **同一文件多处引用只链接一次**：hero 与对比卡放同一条片时共用同一 slug，不重复抽帧占盘
- **缺文件整体失败**：任何 `file` 不存在即退出，不生成半成品页面
- **不发布**：脚本只到「本地 site 就绪」，发布是唯一对外动作，归人工闸门（§1.4 精神）；manifest 会打印下一步命令
- **`execFileSync` 数组传参**：不经 shell，中文/空格路径无引号坑（recam 踩过的）

## 坑位

1. **`--out` 相对 cwd 不相对配置目录**——在仓库根执行时写相对路径即可
2. 重跑换 slug 必带 `--clean`，否则 media/ 里新旧文件混存、体积翻倍
3. `notes.items` 是 HTML 片段（不转义），别把用户输入直接塞进去
4. 发布覆盖是**同一目录同一应用**：`site/` 改了内容必须重新 deploy 才生效

## 产物清单

| 文件 | 职责 |
|---|---|
| `review_page.mjs` | 生成器主脚本（探测/抽帧/硬链接/渲染一气呵成） |
| `example.review.json` | 最小可用配置示例 |
| `review.md` | 本文件 |

上级回链：[Tool/Tool.md](../Tool.md) · [AGENTS.md §3.2](../../AGENTS.md)
