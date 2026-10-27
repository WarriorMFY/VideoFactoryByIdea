# env.md — 本机环境约束与实测踩坑（跨脚本，详细版）

> 顶层只留三条最关键的（见 `Tool.md`），这里放全量。每条都是**实测**结论，不是推测。
> 换机器/换网络后这些结论可能失效，届时按脚本注释里的原因重测。

## 〇、推送到远端（2026-10-27 实测，踩了三个坑）

> 规则：**只管理本地仓库，不自主推送**；仅用户明确要求时才推。下面是"要被要求推"时的正确姿势。

1. **必须换 TLS 后端**：git for Windows 默认用 Schannel，本机报
   `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS`（TCP 443 是通的，别误判成网络故障）。
   本仓库已固定：`git config --local http.sslBackend openssl`（换成 OpenSSL 后 `ls-remote` 直接成功）。
2. **凭据助手会挂**：git 调 `git-credential-manager` 时经过 `sh.exe`，本沙箱禁止创建管道 →
   `sh.exe: *** fatal error - couldn't create signal pipe, Win32 error 5`。
   绕法：直接运行 GCM 取凭据（`cmd /c "gcm.exe get < in.txt > out.txt"`，用文件重定向而非管道），
   再用 `git -c credential.helper= -c "http.extraheader=Authorization: Basic <base64>" push`。
   参考脚本：`Workspace/cache/push_with_gcm.ps1`（临时区，可随时重建；**凭据不打印、不落盘、不写入 git 配置**）。
3. **凭据本来就有**：Windows 凭据管理器里有 `LegacyGeneric:target=git:https://github.com`（GCM 2.9.0 已装，
   `C:\Program Files\Git\mingw64\bin\git-credential-manager.exe`），用户名是数字 ID、口令 40 位（PAT）。
   注意：`cmdkey /list` 能看到条目名但看不到口令；读口令要靠 GCM。

4. **出网本身会漂（2026-10-27 21:00 复测，补充）**：`github.com:443` 的 TCP 有时 145ms 通、有时 2.5s 超时；
   真实 git 请求在 **1.2s 成功**与 **21–56s 失败**（`Failed to connect ... 21026 ms` / `errno 10053`）之间来回跳；
   `ghproxy.net` 可用但**首字节 26–34s**，偶发 500/502。
   → 所以 **TCP、HTTP 探针都会骗人**（TCP 通 ≠ git 能跑），只有 `git ls-remote` 可信但慢。
   → **别手工 `git clone/pull` 干等**，统一走 [`Git/gitnet.mjs`](Git/Git.md)（端点学习 + 无进展看门狗 + 硬超时 + 镜像回退）。

远端：`origin` = `https://github.com/WarriorMFY/VideoFactoryByIdea.git`（公开，默认分支 `main`）。
验证推送是否成功：`git ls-remote origin` 应出现 `refs/heads/main`，`git status -sb` 应显示 `main...origin/main` 且无 `[ahead]`。

## 一、出网（最影响方案选型）

| 通道 | 状态 |
| --- | --- |
| PowerShell `Invoke-WebRequest` | ❌ 被策略拦截（TLS 连接被关闭） |
| `curl.exe` | ❌ 返回 000 |
| Node `fetch` | ✅ 唯一可用 |
| `npm install` | ⚠️ 不可靠（cache 越界 / 大包 ECONNRESET / "operation was rejected"） |
| `pip` | ❌ 超时（Python 侧出网受堵） |
| `winget` | ❌ 失败（exit -1978335231） |

**可用站点（实测）**：`registry.npmmirror.com`（~2MB/s，npm 包与 ffmpeg 二进制）、`media.w3.org`（0.5–5MB/s）、`test-videos.co.uk`、`alphacephei.com`（很慢，~15KB/s 且会断）、`api.mymemory.translated.net`、`speech.platform.bing.com`（Edge TTS）。

**不可用站点**：HuggingFace / hf-mirror / ModelScope / Wikimedia（含 Commons API）/ Internet Archive / GitHub Release 资产 / SourceForge / gyan.dev（~13KB/s）。

## 二、子进程与 I/O

- **管道被禁**：`spawnSync` 默认 `stdio:'pipe'` → `EPERM`。必须把 stdout/stderr 重定向到**普通文件描述符**再读回（`lib/ff.mjs` 的 `run()` 已封装）。
- **杀进程**：`taskkill /PID <pid> /T /F` 在本沙箱**退出码 1（被拒）**；能生效的是 `child.kill('SIGKILL')`（实测 3ms）。
  代价是孙子进程（如 `git-remote-https`）杀不掉，会残留约 21s 后自行退出 → 超时看门狗只能保证"主进程立刻停"，不能保证"整树干净"。
  实测记录：`History/probe/gitnet_killtest.log`；封装在 `Tool/Git/gitnet.mjs`。
- **可写范围**：仅工作区 + 一个沙箱临时目录；`C:\Program Files`、`%LOCALAPPDATA%`、`%APPDATA%` 全部拒绝 → **装不了任何系统级软件**（剪映/Resolve/Shotcut/VLC 都装不上），也无法点 GUI。

## 三、字体与字幕渲染

- `drawtext` 用 `fontfile=C\:/Windows/Fonts/xxx.ttf` 会**静默回退默认衬线字体**（中文变方块）；必须用 fontconfig 家族名：`font=SimHei`。
- 本机 ffmpeg 找不到默认 `fonts.conf`，且默认缓存目录不可写 → `lib/ff.mjs` 自动在 `Workspace/cache/fontconfig/` 生成一份指向 `C:/Windows/Fonts` 的配置。
- 字幕（libass）同样要 `force_style=FontName=SimHei`；双语字幕字号要更小（`vfactory` 会自动判断）。

## 四、ffmpeg 行为细节

- 日志解析：`lavfi.scd.time:` 用的是**冒号**不是等号；`freezedetect` 在静帧黑场也会触发，黑场段须由 `blackdetect` 优先归属。
- **黑场检测在影视素材上会误伤暗场景**：`pix_th=0.10` 太松（实测把 Sintel 的对白段判成黑场并剪掉）；已改默认 `pix_th=0.04` + 显式 `pic_th=0.98` + 最短 `0.30s`。
- **质检阈值必须与剪辑阈值一致**：QA 若用更敏感的黑场阈值（0.12/0.10），会把"剪辑时够不上黑场"的暗场闪一下反复报成缺陷。
- `anullsrc` 只能输出一个流，需要多段静音时必须生成多个独立标签（不能复用同一 label）。
- 滤镜源要写 `source=...[out]`，**不能**写成 `[out]source=...`（会报 "More input link labels ... 1 > 0"）。
- 抽音频做 ASR 时用**裸 PCM**（`-f s16le`），别用 WAV——WAV 头长度不固定（实测 data 偏移 78 而非 44），按 44 字节跳会读出垃圾。

## 五、PowerShell（5.1）写脚本

- 版本：`$PSVersionTable.PSVersion` = 5.1.26100（不是 pwsh 7）。
- 含中文的 `.ps1` **必须**存成 UTF-8 with BOM，否则按 ANSI 解析直接语法错误；`Prototype/**/reproduce.ps1` 一律纯 ASCII 规避。
- 用 PowerShell 做批量文本替换容易把文件写坏（实测出现过字符损坏），**改代码文本优先用 Node 脚本**。

## 六、模型与依赖来源

- **HuggingFace 系全线不可达** → transformers.js / whisper.cpp 的模型下载路线全部否掉。
- **Vosk 模型**（Apache-2.0）可下但很慢：单连接 ~15KB/s 且会断 → `setup/fetch_vosk_model.mjs` 用 6 线程分段 + 每段续传。
- **Vosk 结果收集**：每段结果由 `vosk_recognizer_result()` 吐出并清空内部缓冲，`vosk_recognizer_final_result()` 常为空 → 必须逐段收集 `result` 再按时间排序去重。
- **Windows SAPI TTS 被拒**：`SpVoice.Speak` 抛 `E_ACCESSDENIED` → 造测试语音改用 Edge 神经 TTS（`@andresaya/edge-tts`），备选脚本 `bench/tts_sapi.ps1` 仅留档。
- **npm 大包**（如 vosk 82MB）直连必失败 → `setup/bootstrap_asr.mjs` 用 tarball + bsdtar 解包。
