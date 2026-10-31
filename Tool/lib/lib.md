# lib/ — 公共底层（只有改脚本时才需要看）

> 上层所有脚本都 `import { ffmpeg, ffprobeJson, durationOf, hasFilter, ROOT } from '../lib/ff.mjs'`。
> 这一层解决两个"本机特有"的问题：**子进程输出怎么取**、**字体配置从哪来**。

## 文件

| 文件 | 作用 |
| --- | --- |
| `ff.mjs` | 子进程封装 + ffprobe 便捷函数 + fontconfig 自建配置 + `ROOT` 常量 |
| `pw.mjs` | Playwright 加载（多路径解析）+ 系统浏览器探测（msedge/chrome）+ 持久化登录态上下文 + `loginState`（SESSDATA/DedeUserID 判定）。发布链共用，见 [`../ops/ops.md`](../ops/ops.md) |

## 关键设计

1. **fd 重定向而不是管道**
   本机沙箱禁止命名管道，`spawnSync(..., { encoding:'utf8' })` 会直接 `EPERM`。所以 `run()` 把子进程的 stdout+stderr 写进一个临时日志文件（`fs.openSync` 得到的 fd），结束后读回来当文本用。
   好处顺带拿到了"每步原始日志"，被上层用作可审计的 runlog。

2. **fontconfig 自建**
   `ffmpeg` 的 `drawtext` / `libass` 需要 fonts.conf；本机既没有默认配置、默认缓存目录也不可写。`ff.mjs` 在首次加载时生成：
   ```
   Workspace/cache/fontconfig/fonts.conf   （指向 C:/Windows/Fonts）
   Workspace/cache/fontconfig/cache/       （可写缓存）
   ```
   并通过 `FONTCONFIG_FILE` 传给子进程。

3. **`ROOT`**
   `path.resolve(import.meta.dirname, '..', '..')` = 仓库根。**子目录脚本一律用这个，不要自己数 `..`**。

## 导出

| 导出 | 说明 |
| --- | --- |
| `ROOT` / `FF` / `FP` | 仓库根、ffmpeg.exe、ffprobe.exe（可用 `FFMPEG`/`FFPROBE` 环境变量覆盖） |
| `run(bin,args,logPath)` | 通用：返回 `{status,error,text,ms,args}` |
| `ffmpeg(args,logPath)` | 调 ffmpeg |
| `ffprobeJson(args,logPath)` | 调 ffprobe 并解析 JSON |
| `ffprobeValue(entry,logPath)` / `durationOf(file,logPath)` | 取单值 / 取时长 |
| `hasFilter(name,logPath)` | 判断 ffmpeg 是否编入某滤镜 |
