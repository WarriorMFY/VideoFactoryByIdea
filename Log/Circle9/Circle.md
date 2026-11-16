# Circle9

| 项 | 值 |
| --- | --- |
| 开始时间 | 2026-11-16 18:56 |
| 结束时间 | 进行中 |
| 目标 | 仓库收口：把索引与既有规则对齐——`Workspace` 出库、垃圾文件清理、RAG 媒体政策落地 |
| 起点 | `HEAD 0744748`；上一步 `git rm --cached Workspace` 已执行但未提交，82 个文件停在暂存区 |

## 0 · 本轮要收的三个口子

| # | 事项 | 来源 |
| --- | --- | --- |
| 1 | `Workspace/` 82 个文件（探查脚本、`_*_out.txt`）已入库 | 用户 18:55「Workspace 从库中清理掉」 |
| 2 | `Log/Circle8/__pycache__/run_portrait.cpython-312.pyc` 已入库 | 字节码文件，随 Circle8 误入 |
| 3 | 本地 10 个 RAG 媒体（约 9 MB）未入库 | 2026-11-16 新规「RAG 内所有文件都入 git」后，索引未跟上 |

## 1 · 中间过程

| 时点 | 动作 | 结果 |
| --- | --- | --- |
| 18:56 | 新建目录，记录起点 | 本文件 |
| 18:57 | 确认上一步中断遗留的 `git rm --cached Workspace` | 82 个文件已离开索引，磁盘 83 个保留 |
| 18:57 | 改 `.gitignore` | 首行注释改为「本地临时工作区，不入库」并加 `Workspace/`；新增 `__pycache__/`、`*.pyc` |
| 18:57 | 删 `Log/Circle8/__pycache__/run_portrait.cpython-312.pyc` | 随 Circle8 误入的字节码清除 |
| 18:58 | 提交 `ad96466` | 82 D（Workspace）+ 1 D（pyc）+ `.gitignore`，无新增 |
| 18:59 | `git add RAG` 补 10 个媒体 | 4 条 mp4 + 6 张 png，约 9 MB，索引与 11-16「RAG 内全部入库」对齐 |
