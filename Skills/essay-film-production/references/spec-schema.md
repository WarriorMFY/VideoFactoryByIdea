# spec 结构（essay film）

一份 spec = 一条片。字段少、语义单一，改 spec 重跑即出片。

## 顶层

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 是 | 片名，写进 manifest |
| `size` | 否 | `"1920x1080"`（默认同值） |
| `fps` | 否 | 默认 30 |
| `voice` | 有 tts 时必填 | `{ "name": "zh-CN-YunjianNeural", "rate": "-10%" }` |
| `img_dir` | 有 img 时必填 | 仓库相对路径或绝对路径 |
| `card_dir` | 有 card/info 时必填 | 版式卡 PNG 目录 |
| `img_crop` | 否 | 全局裁切表达式，默认 `crop=1536:864:0:0`（裁掉底部水印带）；单镜 `crop` 可覆盖 |
| `note` | 否 | 技术落点备忘，渲染器不读 |

## 镜头（`shots[]`，按数组顺序排时间轴）

| 字段 | 适用 | 说明 |
| --- | --- | --- |
| `id` | 全部 | 唯一；同名中间件会互相覆盖 |
| `kind` | 全部 | `img` / `card` / `info` / `black` |
| `img` | img、info | 照片文件名（相对 `img_dir`）；`info` 可省——双栏卡是整屏图，渲染器只用 `card` |
| `card` | card、info | 版式卡文件名（相对 `card_dir`）；`info` 用的是已合成好的双栏整屏卡 |
| `dur` | 全部 | 目标秒数（有 tts 时是**下限**，真值取 `max(dur, 语音+0.8)`） |
| `k` | 否 | 色温 K，仅对 `img` 生效；`card`/`info` 不调色 |
| `zoom` | 否 | `in` / `out` / `pan-l` / `pan-r` / `still` |
| `crop` | 否 | 单镜裁切，覆盖 `img_crop` |
| `chapter` | 否 | 章节名；相邻镜头章节变化时该切点加 impact 重音 |
| `tts` | 否 | 旁白文本 → 日记层字幕 + 语音轨 |
| `overlays` | 否 | 花字数组：`{ text, style:"num"|"cap", at, dur }`，`at` 相对本镜起点 |

## 排布经验

- **开场**：3–5 个 0.6–0.7s 的 `img` 连切，把住"这条片不是幻灯片"的第一印象
- **中段**：每个论点 = 一张长停（4–6s，带 tts）+ 一张卡（3.2–5s，无 tts）
- **数据**：照片讲情绪，`info`/图表卡讲数字；数字卡不配旁白，让人自己读
- **收尾**：最后一个 `img` 带一句短旁白，然后片尾卡 5s
- **色温走向**：按叙事时代设 `k`，末段回升（本片 7500K → 4000K）比一直冷到底更像"结论"

## 最小骨架

```json
{
  "title": "示例",
  "voice": { "name": "zh-CN-YunjianNeural", "rate": "-10%" },
  "img_dir": "Workspace/tmp/demo_img",
  "card_dir": "Prototype/demo/cards",
  "shots": [
    { "id": "s01", "kind": "img", "img": "a.png", "dur": 0.7, "k": 1800, "zoom": "in", "chapter": "序" },
    { "id": "s02", "kind": "img", "img": "b.png", "dur": 0.7, "k": 4300, "zoom": "out", "chapter": "序" },
    { "id": "s03", "kind": "card", "card": "title.png", "dur": 4.0, "chapter": "序" },
    { "id": "s04", "kind": "img", "img": "a.png", "dur": 5.0, "k": 1800, "zoom": "pan-l", "chapter": "一",
      "tts": "这里是一段旁白，长度决定本镜真实时长。",
      "overlays": [{ "text": "7.9 小时", "style": "num", "at": 0.6, "dur": 2.5 }] }
  ]
}
```

## 常见写错

| 症状 | 原因 |
| --- | --- |
| 某镜字幕被切尾 | `dur` 小于语音长度；别手填，让渲染器算 |
| 花字不出现 | `at + dur` 超出本镜时长，渲染器会裁掉（`en ≤ st` 直接跳过） |
| 卡变糊/变脏 | 给 `card` 写了 `k`；卡不吃调色 |
| 成片比预期长 | 每段 TTS 多出 0.8s 呼吸位，21 镜累计约 15s——正常 |
| 章节重音错位 | 只在 `chapter` 变化处触发；想让某镜单独重音，改它的 `chapter` 值 |
