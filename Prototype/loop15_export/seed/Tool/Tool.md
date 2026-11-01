# Tool/ — 稳定脚本（入口，30 秒版）

> 这里只放这条能力链路的沉淀脚本：**一条 TED 演讲 → 双语长片 + 3 分钟摘要 + 双向导航**。
> 过程留痕在 `History/`，样例在 `Prototype/sample_ep_a/`，第三方依赖在 `Workspace/`。
> 每个子目录有自己的 `.md` 讲细节；环境坑在 `env.md`；实战坑集中在 `ops/ops.md`（16 条）。

## 三条最短路径

```powershell
# ① 长片：一条命令，约 10 分钟
node Tool\ops\ted_fetch.mjs --pm 9260 --out Workspace\tmp\ted_feifei     # 素材入袋（视频+官方双语字幕）
node Tool\ops\ted_episode.mjs --dir Workspace\tmp\ted_feifei --out Prototype\ep_feifei

# ② 摘要：写 spec（照 Prototype\sample_ep_a\digest.json），约 4 分钟
node Tool\ops\trace_text.mjs --dir Workspace\tmp\ted_feifei --bucket 45  # 导出写稿原料
node Tool\ops\frame_sheet.mjs --video Workspace\tmp\ted_feifei\talk_720p.mp4 --out survey.jpg --every 40
node Tool\ops\make_digest.mjs --spec Prototype\ep_feifei\digest.json --out Prototype\ep_feifei_digest

# ③ 发布（可选）：登录 → 投稿 → 双向导航置顶
node Tool\ops\publish_bilibili.mjs login
node Tool\ops\publish_bilibili.mjs publish --video Prototype\ep_feifei\final.mp4 --cover cover.jpg --title "..." --zone 人工智能
node Tool\ops\bili_comment.mjs add --bvid BVxxxx --pin --text-file pin_comment.txt
```

## 目录地图

| 目录 | 什么时候进 | 说明文件 |
| --- | --- | --- |
| `ops/` | 跑链路 | [`ops/ops.md`](ops/ops.md) — `ted_fetch`（素材入袋）、`ted_episode`（长片一条命令）、`make_digest`（摘要）、`make_cover`（封面）、`frame_sheet`（选帧复核）、`kb_audit.sh`（抖动审计）、`ted_subs`（字幕抓取）、`publish_bilibili`（投稿）、`bili_comment`（评论置顶）＋ **16 条实战坑** |
| `subtitle/` | 改字幕逻辑 | [`subtitle/subtitle.md`](subtitle/subtitle.md) — ASR、偏移标定、强制对齐、官方中译直灌、句级双语、卡拉OK ASS |
| `edit/` | 改剪辑/渲染 | [`edit/edit.md`](edit/edit.md) — 主流水线 `vfactory.mjs`（`--plan-only` / `--protect` / `--srt`） |
| `lib/` | 改公共层 | [`lib/lib.md`](lib/lib.md) — 子进程 fd 重定向封装、fontconfig、SRT/CSV/单位 |
| `setup/` | 换机器重装 | [`setup/setup.md`](setup/setup.md) — 三条 bootstrap（ffmpeg / asr / playwright） |
| 环境约束 | 跑不通时 | [`env.md`](env.md) — 出网/管道/字体/模型源等实测坑 |

**依赖落在哪**：`Workspace/deps/`（`ffmpeg/` 二进制、`asr/` 的 koffi/vosk/edge-tts + 模型、
`node_modules/` 的 playwright），素材在 `Workspace/tmp/<talk>/`，运行时临时在 `Workspace/run/`
（含 B 站登录态）。每层谁在用、删了怎么补 → `Workspace/README.md`。

## 记住这四条

1. **本机网络只有 Node 能出网**：PowerShell/curl 被封；npm install 不可靠（用 `setup/` 里的 tarball 解包）。
   ffmpeg 拉 TED HLS 时必须带 `httpproxy` 白名单（已固化进 `ted_fetch.mjs`，见 ops.md 坑 16）。
2. **子进程不能用管道**：`spawnSync` 默认 `stdio:'pipe'` 会 `EPERM`，统一走 `lib/ff.mjs` 的 fd 重定向。
3. **TED 字幕有 3.5s 预卷占位段**：抓字幕一律 `--offset 0`，偏移由 `estimate_offset` 按片标定后
   统一施加（ops.md 坑 11/12）。直接按下标猜段号会整段丢 cue。
4. **判定数据不靠嘴**：字幕对不对看 `verify_subs`（上游仓库），成片抖不抖看 `kb_audit.sh`，
   摘要音画齐不齐看 `make_digest` 的时长校验（>0.05s 直接拒绝渲染）。

细节、参数表、各脚本的坑 → 进对应子目录的 `.md`；环境类问题 → `env.md`。
