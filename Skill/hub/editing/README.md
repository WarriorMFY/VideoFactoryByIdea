# editing · 剪辑侧

确定性重组：同一输入 + 同一命令 = 同一输出。**剪辑永远不创作**——缺内容只能回生成端。

判据与 generation 的分界见 `Skill/hub/README.md`：看「采样」不看「模型」。
**生成管线的产物永远不是交付件**（有黑边、时间失准、同 prompt 噪声）。
配音是唯一跨界项：声音本身由模型生成（生成端），对齐、混音、响度归一由 ffmpeg 做（剪辑端）。

## 职责

| 操作 | 说明 | 实测依据 |
| --- | --- | --- |
| 裁边 | 图生视频 21:9 输出左右各 122px 黑边，裁成有效 972×512 | Circle14 i2v |
| 切点重剪 | 按实测切点（帧差检测）拆段，不按卡面帧号 | Circle14 v1 实测 f50／86／105，卡面写 f31／62／93 |
| 拼接 | 多段裁切后 concat；转场按实测边界保留或硬切 | 分镜流程 |
| 抽帧／定格 | 导出关键帧作预览、封面、判读证据 | `cut/fetch-video-frame/` |
| 配音 | 音频由 TTS／模型通道生成；本侧只负责对齐、混音、响度归一 | 待接入 |
| 字幕 | 按剪辑后时间轴挂字幕轨 | 待接入 |
| 转码／转封装 | 统一编码、改码率／分辨率、MOV→MP4 | `Tool/ffmpeg.py`；`fix_mov_to_mp4` 只改 ftyp 头，不重编码 |

## 原则

1. **判读先行**：先测（帧差切点、NCC、黑边宽度）再剪；卡面上的时间数字只当参考。
2. **确定性**：同一输入＋同一命令＝同一输出；所有参数写进脚本，不手调。
3. **不创作**：只做时间与画幅上的重组，不生成新内容。
4. **帧精确裁剪必须重编码**（`-c copy` 受关键帧限制）；只看不剪的操作可 `-c copy`。

## 命令

前置：用仓库内置静态二进制，`python Tool/ffmpeg.py -version` 验证（来自 imageio-ffmpeg，由 `Tool/setup_deps.py` 重建）；**不依赖系统 PATH**。下文 `ffmpeg` 均指 `python Tool/ffmpeg.py`。

```bash
# 裁掉 i2v 左右黑边（122px）
ffmpeg -i raw.mp4 -vf "crop=972:512:122:0" -c:v libx264 -crf 18 -an cropped.mp4

# 帧精确切段（按实测切点 f50 → f86）
ffmpeg -i cropped.mp4 -vf "trim=start_frame=50:end_frame=86,setpts=PTS-STARTPTS" \
  -c:v libx264 -crf 18 seg1.mp4

# 拼接
ffmpeg -f concat -safe 0 -i list.txt -c copy joined.mp4

# 配音混音＋响度归一
ffmpeg -i joined.mp4 -i voice.wav -c:v copy \
  -filter_complex "[1:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]" \
  -map 0:v -map "[a]" -shortest final.mp4
```

判读与抽帧走 opencv，不需要 ffmpeg；ffmpeg 只在要出交付件时用。

## 边界

- 剪辑不能创造未生成的内容：缺事件、缺景别、缺时长，只能回生成管线补拍。
- 图生视频的 V 形涟漪、落水水花等属于生成内容，剪辑端不能「补画」。
- 配音与口型不同步时，改时间轴只能救节奏，救不了口型——口型问题回生成端改事件。
- 抠出的透明底 PNG 是**剪辑端的重组素材**，不产生新内容。

## 本桶清单

| 子技能 | 动作 | 一句话 |
| --- | --- | --- |
| `cut/image-matte/` | 切 | 图 → 透明底 PNG（rembg + ONNX） |
| `cut/fetch-video-frame/` | 切 | 按关键词定位时间窗，导出关键帧与分段 |
| `pixel-anchor/` | 合 + 量 | 合成首帧、多主体掩码、mask_iou／halo_ratio 打分 |

## 接口

| 方向 | 内容 |
| --- | --- |
| 生成→剪辑 | mp4／png、prompt 快照、任务号、实扣、实测帧数与黑边 |
| 剪辑→生成 | 缺口清单（缺哪个事件／景别／时长），指明需重生成的片段 |
| 共同纪律 | 整卡直送、脚本只拼接、测量先行、全程留痕 |

## 流程

```text
卡片（镜头／描述／动作）
   │  整卡直送
   ▼
生成管线（文生图／文生视频／图生视频）──> 原始素材＋prompt 快照＋任务号／实扣
   │
   ▼
判读（帧差切点／NCC／黑边宽度，opencv 脚本）
   │
   ▼
剪辑管线（ffmpeg：裁边→重剪→拼接→配音→字幕→转封装）
   │
   ▼
交付件 ──> 验收 ──> 入库
```
