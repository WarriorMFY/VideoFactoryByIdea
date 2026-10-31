# Workspace/ — 临时工作区（可随时清空重建，不入库）

> AGENTS.md 的口径：**临时进 Workspace**。这里所有东西都能删，删完按下面的命令补回来；
> 整个目录已在 `.gitignore` 里，不会污染仓库，也不该放任何交付物。

## 结构

```text
Workspace/                          475MB（2026-10-31 实测）
├── deps/                           依赖：删了要重跑 Tool/setup/*（下载约 300MB）
│   ├── ffmpeg/                     ffmpeg.exe / ffprobe.exe 6.1.1 + SOURCE.txt（来源、版本、许可）
│   ├── asr/                        koffi + vosk + @andresaya/edge-tts 解包依赖、models/ 离线模型、index.cjs
│   └── node_modules/               playwright（只装 Node 包，不下载浏览器；浏览器用系统 Edge）
├── assets/                         素材：CC-BY 片源（Big Buck Bunny / Sintel / ToS 抽段）
├── cache/                          下载缓存：npm-tarballs、vosk 模型 zip、fontconfig、gitnet 端点状态
└── run/                            运行时临时（最安全删）
    ├── bili_profile/               B 站登录态（Edge 持久化 profile，删了要重新扫码）
    └── ffmpeg_intermediate/        ffmpeg 分段/中间件（loop12 渲染残留，20MB）
```

原则：**deps = 装出来的，assets = 下下来的，cache = 下载过程的缓存，run = 跑出来的临时件。**
要腾空间按 `run → cache → assets → deps` 的顺序删，越靠前越安全。

## 谁在用（改路径时按这张表全局搜）

| 路径 | 使用方 |
| --- | --- |
| `deps/ffmpeg/ffmpeg.exe` `ffprobe.exe` | `Tool/lib/ff.mjs` 导出的 `FF` / `FP`（所有剪辑、质检、验收脚本） |
| `deps/asr/index.cjs` | `Tool/lib/vosk.mjs`、`Tool/ops/make_episode.mjs`、`Tool/bench/make_l2_bench.mjs`、`Tool/setup/make_speech4_tts.mjs` |
| `deps/asr/models/` | `Tool/lib/vosk.mjs` 默认模型、`Tool/setup/fetch_vosk_model.mjs` 落点 |
| `deps/node_modules/` | `Tool/lib/pw.mjs` 模块解析第 1 候选、`Tool/setup/bootstrap_playwright.mjs` |
| `assets/` | `Tool/setup/fetch_*.mjs`（下载落点）、各 acceptance 的输入片源 |
| `cache/` | `Tool/lib/ff.mjs`（fontconfig）、`Tool/Git/gitnet.mjs`（端点状态）、`bootstrap_asr` / `fetch_vosk_model` |
| `run/bili_profile/` | `Tool/lib/pw.mjs` 的 `PROFILE_DIR`、`Tool/ops/publish_bilibili.mjs` |

## 从零重建

```powershell
node Tool\setup\bootstrap_ffmpeg.mjs      # ffmpeg + ffprobe → deps/ffmpeg/（npmmirror，约 160MB）
node Tool\setup\bootstrap_asr.mjs         # koffi/vosk/edge-tts 解包 → deps/asr/node_modules/（约 82MB）
node Tool\setup\fetch_vosk_model.mjs      # 离线模型 → deps/asr/models/（39MB，6 线程分段续传）
node Tool\setup\bootstrap_playwright.mjs  # playwright Node 包 → deps/node_modules/（约 25MB，不下载浏览器）
```

素材按需再跑 `Tool\setup\fetch_*.mjs`（`fetch_real_footage` / `fetch_realspeech` / `fetch_more_speech` / `fetch_tos_movie`）。

## 已知事实（别踩）

- **playwright 目前是从宿主托管运行时解析的**（`~/.workbuddy/binaries/node/workspace/node_modules`），`deps/node_modules/` 现在是空的；
  换机器、换宿主 Node 时要先跑一次 `bootstrap_playwright.mjs`，否则发布脚本报 `PLAYWRIGHT_MISSING`。
- `run/bili_profile/` 是浏览器 profile（67MB，含 `SESSDATA` 等 cookie）：**属于凭证**，别提交、别外发；删掉等于退出登录。
- `cache/vosk-model-small-en-us-0.15.zip` 留着是为了免二次下载（源站 10–17KB/s）；`vosk_parts/` 分片缓存在 zip 完整后已删。
- 这里的东西**一律不算交付**：成品/反馈在 `Prototype/`，过程留痕在 `History/`，稳定脚本在 `Tool/`。
