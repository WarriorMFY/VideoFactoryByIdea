# git-rewrite/ — 历史重写留档（loop46，2026-11-08）

**这一册只回答一件事：重写前后提交哈希怎么换算。读到这里就够，除非你要回溯旧提交或核对备份。**

## 一、发生了什么

2026-11-08 23:28，人工定「彻底挡位，只留 K 级」。仓库从 **1.6 GB** 重写为 **39 MB**：
把「取证图 / 关键帧 / 对照片 / 录制片 / ASR 中间件」共 **1214 个文件、1201.6 MB** 从全历史剔除，
只保留 K 级（代码、文档、清单、回执、索引）**2323 个文件 / 49.75 MB**。

- 手段：`git clone --mirror` → `git filter-repo`（两遍：先按移出清单 `--invert-paths`，再按保留清单 `--paths-from-file`）
- 提交数：**114 → 108**（6 个只动媒体的提交被剪空）
- 工作区**未删任何文件**：那 1201.6 MB 实体仍在磁盘原位，只是不再被 git 跟踪，`.gitignore` 已接管
- 备份：`F:\AgentWorkArea\WorkBuddy\_git_backup_before_rewrite46`（旧 `.git` 整份，验证后可删）

## 二、旧哈希怎么查

[`commit-map.tsv`](commit-map.tsv) 是 `filter-repo` 生成的**旧→新对照表**（120 行，含 119 个提交）：

| 列 | 含义 |
|---|---|
| `old` | 重写前哈希 |
| `new` | 重写后哈希 |

用法：`grep <旧哈希前 8 位> commit-map.tsv`，第二列即位新哈希；新哈希为全 0 表示该提交被剪掉（只含被剔除文件）。

**文档里出现的旧短哈希因此全部失效**，典型三处：

| 旧 | 现在 | 说明 |
|---|---|---|
| `1fcd615` | `2566ebf` | 分支 `backup/local-publish-1fcd615` 的 tip（分支名里的旧哈希刻意保留，作历史坐标） |
| `f3c03be` | `f559c9f` | 分支 `main` 的 tip，同时也是远端 `origin/main` 最后一次已知位置 |
| `24cbe25` | `d0a6ecc` | loop43 收工提交，重写前 `browser-publish` 的 tip |

## 三、远端状态（重要）

- 远端 `main` 仍停在旧世界（`f3c03be`，loop13 时期，1058 文件 / 29.3 MB），**从未收到过这 1.2 GB**
- 本地 `browser-publish` 与远端 `main` 本就分叉，所以重写不存在「别人基于此开发」的连带伤害
- 重写后本地无 `refs/remotes/*`（换 .git 时一并清空），`git branch -vv` 会显示 `[origin/main: gone]`，属正常；下次 fetch 会重建

## 四、遗留

1. 旧 `.git` 备份 1.6 GB 还在 `WorkBuddy\_git_backup_before_rewrite46`，确认无碍后手动删
2. `History/` 下多处 md 记着旧哈希（`1fcd615` 6 处、`f3c03be` 2 处等），未逐条改写——按本表换算即可，改文档会污染历史记录的原貌
3. 若将来要推远端：`main` 与 `browser-publish` 都得重新对齐，远端旧分支建议直接删后重推
