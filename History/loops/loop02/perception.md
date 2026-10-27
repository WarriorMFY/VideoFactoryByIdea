# 小循环 2 · 感知与规划（外语视频 → 中文字幕）

开始：2026-10-27 13:56（承接小循环 1 的人工反馈）

## 1. 人反馈与本轮响应

人反馈原话：**"那先做「外语视频加中文字幕吧」，其他你看着来。"**（并要求新增循环日志规则，见 AGENTS.md 全局规则 5）

拆解：
- "外语视频加中文字幕" = 需要 **ASR（外语→文本）+ 翻译（外语→中文）+ 字幕合成 + 与剪辑对齐** 四件事；
- "其他你看着来" = 素材、语种、验收标准、是否双语由 LLM 自主定；
- 未指定真实素材 → 自主构造"讲稿已知"的测试素材，保证可机器验收（这是本轮最关键的自主决策）。

## 2. 环境感知（本轮新增，直接决定技术路线）

| 探测项 | 结果 | 决策 |
| --- | --- | --- |
| python 侧网络（pip） | 仍超时 | 放弃 Python 生态（faster-whisper/whisper 走不通） |
| HuggingFace / hf-mirror / ModelScope | **全域不可达** | 所有"HuggingFace 下载模型"的方案（transformers.js、whisper.cpp ggml）全部否掉 |
| npm registry（npmmirror） | 可达，但 `npm install vosk` 失败（大包 ECONNRESET / "operation was rejected"） | 自写 `npm_fetch.mjs` + `bootstrap_asr.mjs`，用 tarball + bsdtar 解包 |
| npm 上的 TTS/ASR 包 | `vosk` 依赖 ffi-napi（需编译，本机无编译链）；`espeak-ng`/`mespeak` 可用但音质机械 | 用 koffi（预编译 FFI）直连 libvosk.dll，绕开 ffi-napi |
| alphacephei.com（Vosk 模型） | 可达但单连接 ~15KB/s、常断 | 自写多线程分段下载 + 续传 |
| Windows SAPI TTS | 注册表有 Zira(en-US)，COM 可用，但 `Speak` 抛 **E_ACCESSDENIED** | 放弃本地 TTS，改用 Edge 神经 TTS（`speech.platform.bing.com` 可达） |
| MyMemory 翻译 API | **可用**（en→zh 正常返回） | 作为默认自动翻译后端；Google/LibreTranslate/Bing 均不可达 |
| ffmpeg / libass / fontconfig | 6.1.1 essentials，含 libass/fontconfig；自带 fonts.conf 缺失 | 复用小循环 1 的 `lib/ff.mjs`（自建 fonts.conf + `font=SimHei`） |

## 3. 假设（如与预期不符请在反馈里直接推翻）

1. "外语视频"= 有人说话的视频（演讲/口播/访谈/教程），而不是纯音乐/纯环境音。
2. "中文字幕"= **硬字幕**（烧进画面），中文为主；同时额外给双语版与原时间轴 SRT（软件字幕可自行取用）。
3. 输出语序：中文在上、外文在下（双语时）；单语中文时只显示中文。
4. 字幕必须跟随剪辑结果——如果视频被删减，字幕要重映射，不能按原片时间轴硬烧。
5. 本轮只需覆盖**一个语种（英→中）**，其他语种换模型即可（未实测）。

## 4. 最小闭环与判据

闭环：外语视频 → 识别 → 断句 → 翻译 → 显示行 → 重映射 → 烧入 → 成片。

| 判据 | 阈值 | 怎么测 |
| --- | --- | --- |
| 识别准确度 | WER ≤ 25% | 对已知讲稿算词级编辑距离 |
| 字幕覆盖语音 | ≥ 95% | 真值句子区间被字幕覆盖的比例 |
| 句界误差 | 均 ≤ 0.8s、最大 ≤ 1.5s | 真值句起止 vs 字幕行最近边界 |
| 译文覆盖 | 100% | 每条字幕都有非空中文 |
| 可读性 | 中文 ≤ 20 字/秒 | 字数/时长 |
| 重映射自检 | 无越界、无重叠、最短 ≥0.5s | 字幕 vs 成片时长 |
| 成片质量 | 沿用小循环 1 的 QA（编码/响度/音画同步） | `qa_report.mjs` |
| 剪辑一致性 | 两次渲染 EDL 必须相同 | 防止字幕与画面错位 |

## 5. 关键未知与信息增益排序

1. 能否拿到离线 ASR 模型？（信息增益最高，决定整条链路成立与否）→ 已验证可拿（15 分钟分段下载）。
2. 能否自动翻译？→ 已验证（MyMemory 可用，但质量有限）。
3. 字幕时间轴与剪辑如何对齐？→ 自主设计重映射算法并用真值验证。
4. 机翻质量够不够交付？→ 结论：**不够**，给出机翻/精译双版本对比（62.9% → 85.7% 相似度）。

## 6. 本轮踩坑（含解决）

| # | 现象 | 根因 | 解决 |
| --- | --- | --- | --- |
| 1 | `npm install vosk` 失败（ECONNRESET / operation rejected） | 82MB 包 + 沙箱 cache 限制 | 自写 tarball 下载解包 |
| 2 | `npm install` 把我手工解包的 vosk/koffi 删了 | npm 会清理不在 package.json 的目录 | 依赖统一由 `bootstrap_asr.mjs` 管理，不再用 npm install |
| 3 | vosk 模型下载 20 分钟后仍是 12MB | 单连接 ~15KB/s 且中途断，追加写入还可能因服务器返回 200 而错位 | 改多线程分段（6 并发 × 4MB）+ 每段独立续传，并校验总大小 |
| 4 | ASR 输出 0 词 | ① 直接跳过 44 字节 WAV 头，实际 data 偏移是 78；② 只读 `final_result`，而 Vosk 的段结果在 `result()` 里并被清空 | 改抽裸 PCM；逐段收集 `result` 并按时间排序去重 |
| 5 | 字幕行被切断、机翻错位 | 先按显示宽度切行再翻译，机翻只看到半句 | 改为**句子级翻译 → 再切显示行** |
| 6 | 覆盖率只有 82.9% | Edge TTS 每句末尾自带约 0.8s 静音，被我算进了"真值句时长" | 素材生成时逐句做 `silenceremove`（首尾），真值=真实语音区间 → 覆盖率 99.8% |
| 7 | 中文标题/字幕方块 | `fontfile=C\:/...` 静默回退 + libass 默认字体无 CJK | 统一 `font=SimHei` / `force_style=FontName=SimHei`（沿用小循环 1 的 fonts.conf） |
| 8 | Windows SAPI TTS 被拒 | 沙箱禁止 `SpVoice.Speak`（E_ACCESSDENIED） | 换 Edge 神经 TTS；SAPI 脚本留档于 Tool/tts_sapi.ps1 |

## 7. 本轮边界

- 未做：Whisper 级 ASR、软字幕封装、多语种实测、字幕样式模板、长视频压测、术语库/记忆翻译。
- 已知短板：机翻质量（62.9%）、Vosk 小模型在真实人声上的准确率未知、素材是 TTS 合成的（非真人原声）。
