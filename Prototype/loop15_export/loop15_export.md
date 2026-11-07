# loop15_export/ — 能力迁移：TalkFactory 独立包

> 把「素材 → 双语逐词高亮长片 → 3 分钟摘要 → 双向导航」整条能力打包出去，落到同级新目录 `F:/AgentWorkArea/WorkBuddy/TalkFactory/`。
> 关键结果：631MB / 443 文件，静态校验 72/72、语法全过、路径零泄漏；包内冒烟重渲染摘要 227s（sd 0.295，与随包成片 0.298 同一基线）。
> 回链：[AGENTS.md §3.3](../../AGENTS.md) · [循环日志 #loop15](../../History/CircleLog/log.md#loop15) · [Prototype 索引](../Prototype.md)

## 目录内容

| 条目 | 职责 |
|---|---|
| `build_package.mjs` | 从本仓库重建整包：复制 `Tool/`、生成 seed 文档、带入 EP-A 完整样例、收 deps 以便离线即跑 |
| `verify_package.mjs` | 静态校验：文件数、语法、路径泄漏（不得指向本仓库）、样例完整性 |
| `seed/` | 包内文档骨架（**导出产物，不是本仓库的导航结构**；含 `seed/README.md`、`seed/Idea/Idea.md`、`seed/Tool/Tool.md`、`seed/History/CircleLog/log.md`、`seed/Prototype/sample_ep_a/README.md`） |

按 §3.3，`seed/` 属豁免类型（导出包/骨架副本），不在本仓库索引导航里逐层展开。

## 这轮得到的结论

- **两条缺口补上了**：`ted_fetch.mjs`（`--pm` → 视频 + 字幕 + meta 一条命令）、`trace_text.mjs`（cue → 分桶全文，写稿原料）。两工具先落源仓库 `Tool/ops/` 再随包分发，源仓库是唯一真源。
- **坑 16**：本机带 `http_proxy` 时 ffmpeg `-protocol_whitelist` 必须含 `httpproxy`，否则 HLS 输入直接打不开（已固化进 `ted_fetch`）。
- **素材源片不入包**（CC BY-NC-ND 再分发风险 + 体积），换机重跑需经 `ted_fetch` 重抓。
- 方法论已沉淀为 [Skills/capability-packaging/SKILL.md](../../Skills/capability-packaging/SKILL.md)（见 loop16）。

## 复现

```bash
node Prototype/loop15_export/build_package.mjs     # 重建包到 ../../TalkFactory（同级目录）
node Prototype/loop15_export/verify_package.mjs    # 静态校验
```

档案：`History/loops/loop15/plan.md`。遗留：包内 `Idea/Idea.md` 为代拟稿，待人终审。
