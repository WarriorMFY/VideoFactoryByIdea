# setup/ — 第一次跑要准备的东西

> 只在**新机器**或**清空 Workspace 后**需要。全部脚本幂等：已装好的会跳过。
> 依赖一律落在 `Workspace/`（可随时删），不污染仓库、不装系统级软件（本机也装不了，见 [`../env.md`](../env.md)）。

## 文件

| 脚本 | 作用 | 体积/耗时 |
| --- | --- | --- |
| `bootstrap_ffmpeg.mjs` | 下载 ffmpeg/ffprobe（npmmirror 镜像的 ffmpeg 6.1.1 essentials，GPLv3）→ `Workspace/bin/ffmpeg/`，并写 `SOURCE.txt` 记录来源与许可 | 约 160MB / 20 秒 |
| `bootstrap_asr.mjs` | 解包 koffi、@koromix/koffi-win32-x64、vosk、@andresaya/edge-tts、ws → `Workspace/asr/node_modules/`（**替代 npm install**），写 `DEPENDENCIES.md` | 约 82MB / 2 分钟 |
| `fetch_vosk_model.mjs` | 下载 Vosk 离线模型（默认 `vosk-model-small-en-us-0.15`，39MB）→ `Workspace/asr/models/`；**6 线程分段 + 续传** | 39MB / 约 15 分钟（源站限速） |
| `fetch_real_footage.mjs` | 真实素材 A：Big Buck Bunny 片段（CC-BY 3.0，**无音轨**）→ `Workspace/assets/` | 5MB / 15 秒 |
| `fetch_realspeech.mjs` | 真实素材 B：**带真人说话**的 Sintel 预告片（CC-BY 3.0）→ `Workspace/assets/realspeech/` | 4MB / 2 秒 |
| `npm_fetch.mjs` | 通用兜底：给包名就从 npmmirror 拉 tarball 并解包到指定目录（`npm install` 失败时用） | 按包大小 |

## 一次性安装顺序

```powershell
node Tool\setup\bootstrap_ffmpeg.mjs     # 必须最先（后面全依赖 ffmpeg/ffprobe）
node Tool\setup\bootstrap_asr.mjs        # 只有做字幕/识别才需要
node Tool\setup\fetch_vosk_model.mjs     # 只有做识别才需要（可换语种模型）
node Tool\setup\fetch_realspeech.mjs     # 只有要复现小循环 3 才需要
```

## 注意

- **不要用 `npm install`**：本机大包必失败（ECONNRESET / operation was rejected）。要加 npm 依赖就写进 `bootstrap_asr.mjs` 的清单，或临时用 `npm_fetch.mjs`。
- `fetch_vosk_model.mjs` 支持传模型名（如 `vosk-model-en-us-0.22-lgraph`，128MB）；实测**大模型在影视混音素材上反而更差**（见 `History/loops/loop03/model_compare.md`），默认仍用小模型。
- 换语种：`fetch_vosk_model.mjs <模型名>` 下对应模型，再给 `asr_vosk.mjs` 传 `--model`。
- 所有外部依赖的来源/版本/许可记录在落盘目录的 `SOURCE.txt` / `DEPENDENCIES.md` 里，便于合规追溯。
