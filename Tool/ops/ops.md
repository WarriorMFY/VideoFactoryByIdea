# Tool/ops/ — 主链执行体

| 脚本 | 做什么 | 关键参数 |
|---|---|---|
| `dl_bili_hd.mjs` | 下 B 站源片，缺省 qn=116（1080p60），流式 + 备用源回退 | `BV out.mp4 [qn]`；`BILI_PROFILE` 选账号 |
| `exec_extract.mjs` | 处决单位抽取：`scan` 动势曲线 / `sheets` 网格 / `strip` 条带 / `refine` 收敛 / `export` 导出 / `archive` 入账 | `export <catalog.json> <dir> [1920x1080]`；结构自检 3N+2 |
| `exec_seamlib.mjs` | 尾手帧库：每单位 `uNN_open.png` / `uNN_tail.png` + `grid_open` / `grid_tail` 两张总网格 | `<unitsDir> [--units u03,u38] [--out seam_lib]` |
| `exec_stitch.mjs` | 按链序 concat 直拼（不加过渡），拼后时长核算 | `<out.mp4> --units u03,u38 [--dir X] [--check]` |
| `recam.mjs` | 速度语法渲染：按 cfg 逐层改速率（也可做 crop/zoom 重构图） | `<src.mp4> <cfg.json> <out.mp4>` |
| `make_cover.mjs` | 从成片抽帧出封面 | `--video <mp4> --out cover.jpg` |
| `publish_bilibili.mjs` | 投稿全流程：`status` / `login` / `publish` / `verify` | `publish --video --cover --title [--desc-file] [--decl]`；`--dry-run` 不点投稿 |
| `collect_feedback.mjs` | 稿件公开数据（播放/互动/弹幕）快照 | `[--bvid BV] [--csv path]` |
| `collect_creator_stats.mjs` | 创作中心深数据（完播率等，需登录态） | `[--size 30] [--headless 0]` |
| `exec_bound.mjs` | 运动曲线提议切点边界（辅助切单位） | 见脚本头 |
| `frame_sheet.mjs` | 抽帧拼图（普查/复核） | 见脚本头 |
| `shot_profile.mjs` | 镜头节奏量化（ASL / 切点 / 运动能量） | 见脚本头 |

## 账号分工（硬约束）

| 用途 | 账号 | 怎么指定 |
|---|---|---|
| 采集 | 采集号 | `BILI_PROFILE=Workspace/run/bili_profile_<uid>` |
| 发布 | 发布号 | `Workspace/run/bili_profile`（publish_bilibili 硬编码，换号=换目录） |

换号后先 `node Tool/ops/publish_bilibili.mjs status` 核对 UID。

## 坑位

1. **投稿"创作声明"必填**：不传 `--decl` 时 dry-run 会过、真投稿被拦；常用值「内容无需标注」。
2. **B 站自动补 3 个推荐标签**，提交前核对删掉不属于自己的。
3. **残留草稿**：进投稿页先点「不用了」，否则表单是上次的。
4. **删除稿件接口已失效**（2026-11）：走有头窗口人工过滑块，别硬刚。
5. `dl_bili_hd` 拿不到 1080p60 时会降级并告警——降级即视为采集失败，先查登录态。
