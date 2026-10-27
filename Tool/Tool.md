# Tool/ — 稳定脚本（入口，30 秒版）

> 这里只放**沉淀后可复用的脚本与配置**。过程留痕在 `History/`，交付快照在 `Prototype/`，第三方依赖在 `Workspace/`。
> 组织方式：**渐进式披露**——本文件只回答"我现在要干什么、该进哪个目录"；每个子目录有自己的 `.md` 讲细节；环境坑单独放在 `env.md`。

## 四条最短路径

```powershell
# ① 剪一条片子（自动删减 + 转场 + 响度 + 标题）
node Tool\setup\bootstrap_ffmpeg.mjs                                   # 首次：装 ffmpeg
node Tool\edit\vfactory.mjs "你的视频.mp4" --out out\cut --title "标题"

# ② 外语视频加中文字幕（识别 → 翻译 → 随剪辑重映射 → 烧入）
node Tool\subtitle\asr_vosk.mjs "你的外语视频.mp4" --out work\tr.json
node Tool\edit\vfactory.mjs "你的外语视频.mp4" --out out\cut --protect work\tr.json
node Tool\subtitle\make_subs.mjs work\tr.json --out work\subs --mt mymemory
node Tool\subtitle\remap_subs.mjs work\subs\cues.json out\cut\edits.json --out work\subs\remap
node Tool\edit\vfactory.mjs "你的外语视频.mp4" --out out\final --protect work\tr.json --srt work\subs\remap\out_bilingual.srt

# ③ 一键验收（不用手动一步步跑，直接复现全部结论）
node Tool\acceptance\run_acceptance.mjs        # 小循环 1
node Tool\acceptance\run_subs_acceptance.mjs   # 小循环 2
node Tool\acceptance\run_real_acceptance.mjs   # 小循环 3

# ④ 同步/克隆仓库（网络时通时不通，交给脚本管超时与换端点）
node Tool\Git\gitnet.mjs pull --check          # 只看差距
node Tool\Git\gitnet.mjs pull                  # fetch + 快进合并
node Tool\Git\gitnet.mjs clone WarriorMFY/VideoFactoryByIdea
```

## 目录地图（点进去看细节）

| 目录 | 什么时候进 | 说明文件 |
| --- | --- | --- |
| `setup/` | 第一次跑、或换机器 | [`setup/setup.md`](setup/setup.md) — 装 ffmpeg / ASR 依赖、下模型与素材 |
| `bench/` | 想造"带真值"的测试素材 | [`bench/bench.md`](bench/bench.md) — 合成素材、真实素材+已知废镜头、外语语音素材 |
| `edit/` | 要做剪辑/出片 | [`edit/edit.md`](edit/edit.md) — 主流水线 `vfactory.mjs`、决策时间轴图 |
| `subtitle/` | 要做识别/翻译/字幕 | [`subtitle/subtitle.md`](subtitle/subtitle.md) — ASR、字幕生成、时间轴重映射、字幕验收 |
| `acceptance/` | 要"证明它是对的" | [`acceptance/acceptance.md`](acceptance/acceptance.md) — 三个一键验收 + 真值比对 + 成片质检 |
| `lib/` | 要改脚本的公共层 | [`lib/lib.md`](lib/lib.md) — 子进程调用封装（fd 重定向）、fontconfig |
| `Git/` | clone/pull 卡住、克隆第三方项目 | [`Git/Git.md`](Git/Git.md) — `gitnet.mjs`：端点学习 + 无进展看门狗 + 镜像回退 |
| 环境约束 | 遇到"为什么跑不通" | [`env.md`](env.md) — 出网/管道/字体/模型源等 14 条实测坑 |

## 记住这四条

1. **本机网络只有 Node 能出网**：PowerShell/curl 被封；npm install 不可靠（用 `setup/` 里的 tarball 解包）。
2. **子进程不能用管道**：`spawnSync` 默认 `stdio:'pipe'` 会 `EPERM`，统一走 `lib/ff.mjs` 的 fd 重定向。
3. **判定数据不靠嘴**：决策对不对看 `verify_edl`，成片合不合格看 `qa_report`，字幕看 `verify_subs`。
4. **git 出网不稳，别手工干等**：`git clone/pull` 直连要 21–56s 才失败（TCP 通≠git 能跑），一律走
   `node Tool\Git\gitnet.mjs <clone|pull>`；镜像/端点学习/超时它都管了。

细节、参数表、各脚本的坑 → 进对应子目录的 `.md`；环境类问题 → [`env.md`](env.md)。
