# State.md — 通道（走到哪、下一步）

> 用途：这条链每次跑一条片子，就是走一遍这里的格子。当前停在哪一格、下一步建议走哪，看这张表。
> 建议只是建议，人可以改；改了就留在表里，别删。

| # | 格 | 进入条件 | 退出判据（可复核） | 产物 |
|---|---|---|---|---|
| 1 | 采源片 | 有 BV 号 | `dl_bili_hd` 退出码 0，ffprobe 1920×1080@60 | `Workspace/run/<bv>.mp4` |
| 2 | 切单位 | 源片在位 | `exec_extract export` 结构自检 3N+2 通过；`material_layout` F3–F5 无错 | `Material/<题材>/处决镜头/` |
| 3 | 选链 | 单位 ≥ 10 | 每条缝有 `grid_tail/open` 目验结论，0 条"未看" | 有序单位链 |
| 4 | 速度语法 | 链定 | 四查全过（时长 ≤1 帧 / 切点相接 / hit 窗不越界 / 0.3x ≤35%） | `cfg/*.json` + `out_uNN.mp4` |
| 5 | 拼片 | 单位渲染完 | `exec_stitch --check` 时长差 ≤0.1s | 无声成片 |
| 6 | BGM | 成片在 | `bgm_fit` 报告最优 offset，PASS 数记录在案 | BGM 版成片 |
| 7 | 封面文案 | BGM 版过目 | 封面 1920×1080、文案含署名 | `cover.jpg` + `desc.txt` |
| 8 | 投稿 | 人放行 | `publish_bilibili verify` 在线且标题/封面/时长一致 | 稿件 BV 号 |
| 9 | 读数 | 发布 24h+ | `collect_feedback` / `collect_creator_stats` 落盘 | `History/runs/feedback/` |

**当前**：包内样例已走完 5（格子 1–4 由合成素材替代，见 `Prototype/sample_exec_ep/`）。

**建议下一步**：在目标环境跑一遍格子 1–2（真源片），验证 `dl_bili_hd` 的登录态与清晰度降级分支。
