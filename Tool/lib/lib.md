# Tool/lib/ — 共用层

| 模块 | 导出 | 说明 |
|---|---|---|
| `ff.mjs` | `ROOT` `FF` `FP` `run` `ffmpeg` `ffprobeJson` `durationOf` `hasFilter` | 子进程统一封装：fd 重定向 + 日志落盘（沙箱下 pipe stdio 会被拦）；顺带写好 fontconfig 最小配置指向系统字体 |
| `pw.mjs` | `launchProfile` `loginState` `sleep` | Playwright 持久化上下文：优先 `Workspace/deps/node_modules` 的 playwright，其次宿主 fallback；浏览器用系统 Edge/Chrome channel，**不下载 Chromium** |
| `csv.mjs` | `readCsv` `writeCsv` | 带 BOM 的 CSV 读写（Excel 兼容） |
| `license.mjs` | `LICENSE_CLASSES` `PUBLISHABLE_CLASSES` `classifyLicense` `publishable` | 授权分类单一真源：`tier` 是采集代价，`license_class` 是能不能发，两轴正交 |

## 注意

- `ROOT` 由文件位置推两层上去 → **改目录层级会让所有相对路径失效**，别挪 `lib/`。
- `ff.mjs` 里 `C:/Windows/Fonts` 是 Windows 事实，换平台要改 fontconfig 段。
- 任何新的授权判定都不许在业务脚本里硬写，一律走 `license.mjs`。
