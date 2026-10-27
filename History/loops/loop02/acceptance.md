# 小循环 2 验收记录（自动生成）

生成时间：2026-10-27T09:29:00.136Z　用例：`History\bench\l2_en`　MT 后端：**mymemory**

## 结论

- 字幕链路：**PASS**
- 成片质检：**PASS**
- 剪辑一致性：**一致**（两次渲染的 EDL 相同，字幕不会错位）

## 关键指标

| 指标 | 数值 | 判据 | 判定 |
| --- | --- | --- | --- |
| 语音识别 WER | 6.1%（错 6/99 词） | ≤ 25% | OK |
| 语音被字幕覆盖 | 99.8% | ≥ 95% | OK |
| 句界误差（均/最大） | 0.016s / 0.045s | 均 ≤ 0.8s，最大 ≤ 1.5s | OK |
| 中文译文覆盖 | 13/13 条 | 100% | OK |
| 中文字幕可读性（峰值） | 8.89 字/秒（均值 5.27） | ≤ 20 | OK |
| 重映射自检 | 13 条 / 越界 0 / 重叠 0 / 最短 2.025s | 无越界/重叠、≥0.5s | OK |
| 机翻 vs 人工精译（参考） | 62.9% 字符相似度 | 仅报告 | — |
| 成片 | 33.878s / 1280x720 / -16.2 LUFS | — | PASS |

## 识别到的句子与译文

| # | 时间 | 英文（ASR） | 中文（机翻） |
| --- | --- | --- | --- |
| 1 | 0.03–4.08 | welcome back to the workshop where return raw footage into finished films | 欢迎回到工作坊，将原始镜头放回成品胶片中 |
| 2 | 4.41–8.79 | today i will show you three simple tricks that save about two hours of editing time | 今天我将向您展示三个简单的技巧，可以节省大约两个小时的编辑时间 |
| 3 | 9.12–13.41 | first always cut on the beat because rhythm is what keeps the audience awake | 首先，总是节拍，因为节奏是让观众保持清醒的原因 |
| 4 | 13.74–18.48 | second remove the silent gaps longer than half a second before you touch the colors | 在触摸颜色之前，将静音间隙移除超过半秒 |
| 5 | 18.78–25.62 | third normalize the audio to minus sixty sixteen l u fs which is the standard for online video platforms | 第三，将音频标准化为负六十六l u fs ，这是在线视频平台的标准 |
| 6 | 25.95–30.78 | finally export at fifteen megabits per second and never trust the first render | 最终以每秒 15 Mbps的速度导出，永远不要相信第一个渲染 |
| 7 | 31.11–33.84 | that is it for this episode see you in the next one | 就是这一集了，下集见 |

## 真值对照（逐句）

| # | 真值时间 | 真值英文 | 人工精译 |
| --- | --- | --- | --- |
| 1 | 0.00–4.08 | Welcome back to the workshop, where we turn raw footage into finished films. | 欢迎回到工作坊，我们在这里把原始素材变成成片。 |
| 2 | 4.43–8.78 | Today I will show you three simple tricks that save about two hours of editing time. | 今天我会演示三个简单的小技巧，能省下大约两个小时的剪辑时间。 |
| 3 | 9.13–13.40 | First, always cut on the beat, because rhythm is what keeps the audience awake. | 第一，永远在节拍上剪，因为节奏才能让观众保持清醒。 |
| 4 | 13.75–18.48 | Second, remove the silent gaps longer than half a second before you touch the colors. | 第二，在碰调色之前，先把长度超过半秒的静音空隙去掉。 |
| 5 | 18.82–25.60 | Third, normalize the audio to minus sixteen LUFS, which is the standard for online video platforms. | 第三，把音频响度归一到负十六 LUFS，这是在线视频平台的标准。 |
| 6 | 25.95–30.77 | Finally, export at fifteen megabits per second, and never trust the first render. | 最后，以每秒十五兆的码率导出，而且永远不要相信第一次渲染。 |
| 7 | 31.12–33.88 | That is it for this episode, see you in the next one. | 本期就到这里，我们下期见。 |

## 耗时

- material: 0s
- asr: 4s
- cut: 17s
- subs: 17s
- remap: 17s
- render: 30s
- verify: 32s
- 合计: 32s

## 产物

- 成片：`History\runs\l2_subs_mymemory\final.mp4`
- 字幕：`History\subs\l2\remapped\out_bilingual.srt`（重映射后）/ `History\subs\l2\zh.srt`（原时间轴）
- 识别稿：`History\asr\transcript.json`
- EDL / 报告 / 时间轴图 / 质检：`History\runs\l2_subs_mymemory`