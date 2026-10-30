# 小循环 6 验收：字幕文本层（标点 / 翻译 / 阅读速度）

生成时间：2026-10-30T08:58:54.883Z　素材：`History/bench/l2_en`（TTS 英语，讲稿+s人工精译当基准）

## 结论

- 标点恢复：**PASS**（句界 F1 1、句末标点 100%、文本 WER 6.1%）
- 翻译缺陷：标点版 句末缺标点 0 / 术语错误 0（基线分别是 7 / 1）
- 精译后端上限：与人工参考相似度 **94.1%**（机翻 46.7%）
- 阅读速度：峰值 8.9 字/秒，超标 0/13 条
- 字幕链路回归：**PASS**（WER 6.1%、覆盖 99.8%）

## 三种做法横向对比

| 变体 | 与人工精译相似度 | 句末缺标点 | 术语错误 | 残留英文 | 中英未空格 | 峰值 CPS | 超标条数 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A 无标点机翻（基线） | 47.8% | 7 | 1 | 0 | 2 | 8.9 | 0/13 |
| B 标点+源端术语纠错 | 46.7% | 0 | 0 | 0 | 1 | 8.9 | 0/13 |
| C 人工级精译（--mt agent） | 94.1% | 0 | 0 | 0 | 0 | 8.9 | 0/13 |

> 相似度只表示"与人工译文的接近程度"，同义改写也会扣分，只用于同一素材上的相对比较；
> 真正能量化本轮收益的是"缺陷计数"：句末缺标点 **7 → 0**、术语错误 **1 → 0**。

## 逐句对照（标点版机翻）

| # | 英文（标点恢复后） | 机翻 | 人工精译 |
| --- | --- | --- | --- |
| 1 | Welcome back to the workshop where return raw footage into finished films. | 欢迎回到工作坊，将原始镜头放回成品胶片中。 | 欢迎回到工作坊，我们在这里把原始素材变成成片。 |
| 2 | Today I will show you three simple tricks that save about two hours of editing time. | 今天，我将向您展示三个简单的技巧，可以节省大约两个小时的编辑时间。 | 今天我会演示三个简单的小技巧，能省下大约两个小时的剪辑时间。 |
| 3 | First, always cut on the beat, because rhythm is what keeps the audience awake. | 首先，始终保持节拍，因为节奏是让观众保持清醒的原因。 | 第一，永远在节拍上剪，因为节奏才能让观众保持清醒。 |
| 4 | Second, remove the silent gaps longer than half a second before you touch the colors. | 其次，在触摸颜色之前，去除超过半秒钟的无声间隙。 | 第二，在碰调色之前，先把长度超过半秒的静音空隙去掉。 |
| 5 | Third, normalize the audio to minus sixty sixteen l u fs, which is the standard for online video platforms. | 第三，将音频标准化为−16 LUFS，这是在线视频平台的标准。 | 第三，把音频响度归一到负十六 LUFS，这是在线视频平台的标准。 |
| 6 | Finally, export at fifteen megabits per second, and never trust the first render. | 最后，以15 Mbps的速度导出，永远不要相信第一个渲染。 | 最后，以每秒十五兆的码率导出，而且永远不要相信第一次渲染。 |
| 7 | That is it for this episode see you in the next one. | 这一集到此结束，下一集见。 | 本期就到这里，我们下期见。 |

## 判据与结果

| 检查 | 判据 | 结果 |
| --- | --- | --- |
| 标点恢复 | 句界 F1 ≥0.85、句末标点 ≥85%、文本 WER ≤10% | PASS |
| 句末标点缺失 | 0 句 | 0 |
| 术语错误 | 0 处 | 0 |
| 精译可达性 | 与人工参考 ≥85% | 94.1% |
| 字幕链路 | verify_subs PASS | PASS |

总判定：**PASS**（punct=ok no_missing_end_punct=ok no_term_errors=ok agent_reaches_human=ok subs_regression=ok）

## 产物

- 标点恢复：`History/asr/transcript_punct.json`、`History/asr/verify_punct.json`
- 三个变体字幕：`History/subs/l2`（A）、`History/subs/l2_punct`（B）、`History/subs/l2_agent`（C），各带 `cues.json` / SRT / `mt_quality.json`
- 耗时：0s