# Tool/setup/ — 依赖 bootstrap

| 脚本 | 装什么 | 落点 | 说明 |
|---|---|---|---|
| `bootstrap_ffmpeg.mjs` | ffmpeg + ffprobe 静态二进制（npmmirror 的 ffmpeg-static b6.1.1） | `Workspace/deps/ffmpeg/` | 约 100MB；已存在则跳过 |
| `bootstrap_playwright.mjs` | playwright npm 包 | `Workspace/deps/node_modules/` | `--force` 重装；**不下载浏览器**，运行时用系统 Edge/Chrome |

## 目标机前提

- Node ≥ 20（用到 `import.meta.dirname` 与 `node:fs/promises`）
- Windows（`ff.mjs` 的字体配置与浏览器探测写的是 Windows 路径）；Linux/macOS 需自行调整
- Edge 或 Chrome 至少装一个（投稿/深数据都靠它）
- 首次投稿需要人在有头窗口扫码登录
