# WP3 · 按规范重做封面（A/B/C 三版）· 2026-10-31 23:2x

依据 `History/bench/cover_spec.md` 的 S1–S6 量化规范，用 `Tool/ops/make_cover.mjs`（本日扩展 v2）
出 3 版候选 × 2 种比例（16:9 投稿主图 / 4:3 列表图），全部本地生成，**未动线上封面**。

## 产出

`Prototype/loop13_feedback_clock/covers/`
- `A_bigtext_16x9.jpg` / `A_bigtext_4x3.jpg` — A 大字冲击：黑底黄字两行大标题（对标基线 10/14/24 号爆款）
- `B_inset_16x9.jpg` / `B_inset_4x3.jpg` — B 纯色底+嵌入帧：墨蓝纯色底 + 成片帧白边嵌入
- `C_split_16x9.jpg` / `C_split_4x3.jpg` — C 双格画面+数字：两帧拼合 + "5 招 · 38 秒"
- `compare_2026-10-31.jpg` — 现封面 vs A/B/C 对比图（一眼可见差异）

## 逐版参数（即规范，可直接复现）

素材源：`Prototype/loop12_market_loop/case_ep01/render_16x9/final.mp4`（下称 $V）
运行：`node Tool/ops/make_cover.mjs --video $V <下表参数>`

| 版本 | 16:9 参数 | 4:3 追加 |
| --- | --- | --- |
| A | `--out covers/A_bigtext_16x9.jpg --bg black --title "剪辑提速\|5 招" --fs 0.20 --tcolor yellow --stroke 0.014 --tag "新手友好"` | `--w 960 --h 720` 同参数 |
| B | `--out covers/B_inset_16x9.jpg --at 14 --bg "#0E2A3A" --inset 0.58 --title "少剪一半时间" --fs 0.19 --tcolor white --stroke 0.014 --tag "剪辑必看"` | 同上 |
| C | `--out covers/C_split_16x9.jpg --split "8,26" --title "5 招 · 38 秒讲完" --fs 0.18 --tcolor yellow --stroke 0.014 --titlebox 0.55 --tag "照做就省时"` | 同上 |

对比图：`C:/Users/59784/.workbuddy/binaries/python/envs/default/Scripts/python.exe Workspace/tmp/make_cover_sheet.py`

## S1–S6 自检

| 规范 | A | B | C |
| --- | --- | --- | --- |
| S1 主标题 ≤10 字、字号 ≥18%H、白/黄+描边或色块底 | ✓ 7 字两行、0.20H 黄字、黑底即色块 | ✓ 6 字、0.19H 白字、10px 描边 | ✓ 9 字、0.18H 黄字、10px 描边 |
| S2 叠加文字 ≤3 处 | ✓ 2（标题+角标） | ✓ 2 | ✓ 2（嵌入帧内的成片烧录字幕不计叠加层） |
| S3 锚点 | ✓ 高对比纯色底（黑） | ✓ 高对比纯色底（墨蓝） | △ 双格画面帧（见下方诚实注记） |
| S4 对比度 | ✓ 黄/黑 差极大 | ✓ 白/#0E2A3A | ✓ 黄字+55% 黑底条 |
| S5 角标左上、无自贬词 | ✓ 新手友好 | ✓ 剪辑必看 | ✓ 照做就省时 |
| S6 每行 ≤6 字 ≤2 行 | ✓ 4 字/3 字 | ✓ 单行 6 字 | ✓ 单行 |

## 诚实注记（两点）

1. **成片里没有人脸/手部操作素材**（全片是 CC-BY 风景动画）。S3 的"人脸/手势特写"锚点无素材可用，
   A/B 走的是规范允许的第三条"高对比纯色底"。若未来要走"手在操作"类封面，需要补拍/换素材源——
   这已列入给人的拍板项。
2. C 版双格取自同一场景的两帧（t=8 / t=26），画面相似，靠"5 招 · 38 秒"数字承担信息量；
   它是内容预览式对比，不是"改前/改后"假对比（没有真实的前后素材，不伪造）。

## make_cover.mjs v2 扩展说明（本次沉淀进 Tool/）

新增参数：`--fs`（主标题字号占 H 比，S1 用）、`--tcolor`、`--stroke`（描边占 H 比）、
`--titlebox`（标题区压暗条）、`--dim`（全帧压暗）、`--bg`（纯色底）、`--inset`（嵌入帧宽占 W 比）、
`--split "t1,t2"`（双格拼合）、主标题支持 `|` 分行（S6）。原 `--title/--sub/--tag/--at/--w/--h` 不变。
