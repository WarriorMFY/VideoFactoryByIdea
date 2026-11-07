# EP-A-Digest · 李飞飞 TED「3 分钟中文摘要报告」+ 快速导航通道

> loop14 WP4.7（2026-11-01 12:04–12:26，人指令）。
> 成片 **BV1DExp6UEdb**，2:51（170.9s），落库 tid=231（公开接口回读 ✓）。

## 结构

```
片头卡 3.4s（黑底标题：空间智能｜TED 演讲 3 分钟摘要报告｜完整版 15:02 BV113xW6VEv6）
  ↓
30 段中文解说（Edge TTS zh-CN-YunyangNeural +5%，约 870 字，新闻报告腔）
每段 = 1 句解说 × 1 张原片精选帧（Ken Burns 推/拉，0.10 幅度）
     + 底部中文字幕（≤20 字/块，按时长均摊）
     + 左上章节角标（仅章首段显示）
     + 右上「原片 mm:ss」角标（每段都有——这就是导航通道的可视化）
  ↓
片尾卡 6.0s（导流完整版 + 简介跳转提示）
```

7 章 × 平均 4 段：五亿年前的黑暗 → 看见点燃智能 → 九年前同一舞台 → 看见≠理解 → 空间智能 → 雏形已现 → 数字寒武纪。

## 快速导航通道（双向）

| 方向 | 载体 |
| --- | --- |
| 摘要 → 原片 | ① 每段右上角标原片时间；② 简介 7 章节带 `?t=` 秒级跳转链接；③ 置顶评论逐章跳转表 |
| 原片 → 摘要 | EP-A（BV113xW6VEv6）置顶评论挂摘要链接（`bili_comment.mjs add --pin`） |

评论 API 实测可用：`x/v2/reply/add` + `x/v2/reply/top`（csrf=bili_jct，Playwright ctx.request 共享登录 cookie）。

## 音画同步模型（本工具的核心推导）

- 音频 = `[片头T] GAP seg1 GAP … segN GAP [片尾E]`
- 视频片段时长：`V0=T+GAP；Vk=segk+2·GAP；Vlast=E+GAP`，xfade 转场= `GAP`
- 结果：**交叉淡化恰好填满句间静音**，解说起点=画面定格起点，全片零漂移（成片 170.90s = 音频 170.88s）。

## 复现

```bash
node Tool/ops/make_digest.mjs --spec Prototype/loop14_talk/ep_a_digest/digest.json --out Prototype/loop14_talk/ep_a_digest
# spec 可编辑：segments[].{chapter,src(原片抽帧秒),text(解说)}；改完重跑 ~2 分钟
```

物料：`final.mp4`、`cover.jpg`（原片 765s 脑电机械臂帧+标题）、`digest.ass`、`zh.srt`、`desc_publish.txt`（章节跳转表）、`pin_comment.txt` / `ep_a_comment.txt`、`manifest.json`（segments 含 digest_t/src_t）。

## 已知边界

- 画面是静帧+动效，**无原声**（版权红线：摘要解说体不搬运原声；原声卖点由 15:02 完整版承担）。
- 帧位写死在 spec：换素材必须重挑（选帧方法：24/30 格带时间戳 contact sheet + ViewImage 复核）。
- TTS 132→146s：段落数决定时长，~4.9 字/秒，按目标时长反推字数。

## 2026-11-01 抖动修复（v2 重制）

用户反馈画面抖动。定位 + 修复记录：

**根因（两个，均已修）**
1. **zoompan 亚像素抖动**：源只 2x 上采样（2560×1440）+ yuv420p 色度子采样，整数取整使部分帧位移跨过像素边界、部分帧原地不动 → 帧间差异 CV 32.6%，肉眼可见"卡-跳"。
2. **时间轴未帧对齐**：xfade offset 为浮点（非 1/30 整数倍），内部按时间选帧产生 1 帧级跳变；片段帧数独立取整的误差单向累积（实测最差 0.111s = 3.3 帧）。

**修复（kb_audit 实测同源片段对比）**
- 片段链路改 `scale=5120:2880:flags=lanczos → format=yuv444p → zoompan(s=2560x1440) → scale=1280:720:flags=lanczos`：**CV 32.6% → 12.3%，最大帧差 0.33 → 0.17**
- 时间轴全帧对齐：`fOff[k]=round(C[k]*30)`，片段帧数由相邻起点差推出（自洽整数链），单段最大量化偏差 28.9ms；xfade offset 全部落在帧栅格上
- 中间片段 crf 20→14（减少二次压缩纹理波动）

**审计工具**：`Tool/check/kb_audit.sh <mp4>`（帧间差异曲线 + CV + 顿挫计数；crop 避开字幕区）

**发布替换**：重制版 **BV1yvxs61Eaw**（13:42 上线，tid=231 回读 ✓）。旧版 BV1DExp6UEdb 置顶评论已改为"看重制版"导流（删除稿件接口 `archives/del` 返回 HTML 已失效；edit 接口 21009 标题不合法，疑似新版风控，均记坑）。完整版置顶评论已换指新 BV。
