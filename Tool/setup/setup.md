# setup/ — 第一次跑要准备的东西

> 只在**新机器**或**清空 Workspace 后**需要。全部脚本幂等：已装好的会跳过。
> 依赖一律落在 `Workspace/deps/`（`ffmpeg/`、`asr/`、`node_modules/`），素材落 `Workspace/assets/`，缓存在 `Workspace/cache/`，都可随时删、不污染仓库、不装系统级软件（本机也装不了，见 [`../env.md`](../env.md)）。

## 文件

| 脚本 | 作用 | 体积/耗时 |
| --- | --- | --- |
| `bootstrap_ffmpeg.mjs` | 下载 ffmpeg/ffprobe（npmmirror 镜像的 ffmpeg 6.1.1 essentials，GPLv3）→ `Workspace/deps/ffmpeg/`，并写 `SOURCE.txt` 记录来源与许可 | 约 160MB / 20 秒 |
| `bootstrap_asr.mjs` | 解包 koffi、@koromix/koffi-win32-x64、vosk、@andresaya/edge-tts、ws → `Workspace/deps/asr/node_modules/`（**替代 npm install**），写 `DEPENDENCIES.md` | 约 82MB / 2 分钟 |
| `fetch_vosk_model.mjs` | 下载 Vosk 离线模型（默认 `vosk-model-small-en-us-0.15`，39MB）→ `Workspace/deps/asr/models/`；**6 线程分段 + 续传** | 39MB / 约 15 分钟（源站限速） |
| `fetch_real_footage.mjs` | 真实素材 A：Big Buck Bunny 片段（CC-BY 3.0，**无音轨**）→ `Workspace/assets/` | 5MB / 15 秒 |
| `fetch_realspeech.mjs` | 真实素材 B：**带真人说话**的 Sintel 预告片（CC-BY 3.0）→ `Workspace/assets/realspeech/` | 4MB / 2 秒 |
| `fetch_more_speech.mjs` | **小循环 4**：多下几个带英文人声的公开素材（Sintel / BBB 预告与整片 / W3C 片段）→ `Workspace/assets/speech4/` | 约 260MB / 约 3 分钟 |
| `make_speech4_tts.mjs` | **小循环 4**：同一段讲稿换 4 种口音（US/GB/AU/IN）合成，**带逐句真值** → `Workspace/assets/speech4tts/` | 4×30s / 约 2 分钟 |
| `select_speech4_excerpts.mjs` | **小循环 4**：整片先识别 → 按 15s 步长滑 90s 窗 → 截取对白最密的片段 | 16–28× 实时（596s 片约 37s） |
| `fetch_tos_movie.mjs` | **小循环 4**：Tears of Steel 720p（真人实拍电影，**带官方英/中文字幕**，可算真实素材 WER）；6 线程分段 + 断点 | 355MB / 30–60 分钟（镜像限速 0.1–0.2MB/s） |
| `make_tos_excerpt.mjs` | **小循环 4**：按官方字幕密度选 90s 片段，并把字幕行平移成**真值** + 中文参考 | 几秒 |
| `npm_fetch.mjs` | 通用兜底：给包名就从 npmmirror 拉 tarball 并解包到指定目录（`npm install` 失败时用） | 按包大小 |
| `bootstrap_playwright.mjs` | **小循环 12**：装 playwright（只装 Node 包，**不下载浏览器**，用系统自带 Edge 当执行器）→ `Workspace/deps/node_modules/` | 约 25MB / 30 秒 |

## 一次性安装顺序

```powershell
node Tool\setup\bootstrap_ffmpeg.mjs     # 必须最先（后面全依赖 ffmpeg/ffprobe）
node Tool\setup\bootstrap_asr.mjs        # 只有做字幕/识别才需要
node Tool\setup\fetch_vosk_model.mjs     # 只有做识别才需要（可换语种模型）
node Tool\setup\bootstrap_playwright.mjs # 只有要登录/发布到 B 站才需要（不下载浏览器，走系统 Edge）
node Tool\setup\fetch_realspeech.mjs     # 只有要复现小循环 3 才需要

# 小循环 4（多样本英译中）：素材与真值
node Tool\setup\fetch_more_speech.mjs        # 4 段真实素材（含 237MB 整片；--small 跳过）
node Tool\setup\make_speech4_tts.mjs         # 4 种口音 TTS（带逐句真值）
node Tool\setup\fetch_tos_movie.mjs          # Tears of Steel 355MB（慢，30-60 分钟，可后台）
node Tool\setup\make_tos_excerpt.mjs         # 用官方字幕挑 90s 并生成真值（依赖上一步）
```

## 注意

- **不要用 `npm install`**：本机大包必失败（ECONNRESET / operation was rejected）。例外：`bootstrap_playwright.mjs` 走 npmmirror 镜像的 `npm install` 可以成功（25MB 级），若失败再用 `npm_fetch.mjs` 兜底。要加 npm 依赖就写进 `bootstrap_asr.mjs` 的清单，或临时用 `npm_fetch.mjs`。
- `fetch_vosk_model.mjs` 支持传模型名（如 `vosk-model-en-us-0.22-lgraph`，128MB）；实测**大模型在影视混音素材上反而更差**（见 `History/loops/loop03/model_compare.md`），默认仍用小模型。
- 换语种：`fetch_vosk_model.mjs <模型名>` 下对应模型，再给 `asr_vosk.mjs` 传 `--model`。
- 所有外部依赖的来源/版本/许可记录在落盘目录的 `SOURCE.txt` / `DEPENDENCIES.md` 里，便于合规追溯。
- **永远不要跑 `playwright install`**：浏览器 CDN 在本机不可达；本项目统一用 `channel: 'msedge'` 驱动系统 Edge（`Tool/lib/pw.mjs` 自动探测 msedge/chrome 路径）。
