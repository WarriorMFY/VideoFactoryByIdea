# 段表

```json
{
  "source": "../src-video/first10s.mp4",
  "fps": 30,
  "segments": [
    { "id": "S1", "start": 0.0,  "end": 4.4, "moving": false, "note": "广角庙宇，慢推 0.9%/s" },
    { "id": "S2", "start": 4.4,  "end": 8.4, "moving": false, "note": "" },
    { "id": "S3", "start": 8.4,  "end": 10.0, "moving": true,  "note": "短段，按 5s 生成后裁回 1.6s" }
  ]
}
```

## 字段

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `source` | 是 | 源片路径，相对段表所在目录 |
| `fps` | 是 | 源片帧率；与实际不符时以视频头为准 |
| `id` | 是 | 段名，同时是文件名前缀（`S1.mp4`、`S1-first-f0.png`） |
| `start` / `end` | 是 | 源片时间轴秒数，段间首尾相接、不重叠不留空 |
| `moving` | 否 | 该段源片本身在运动（推拉摇移），默认 `false` |
| `note` | 否 | 短段、慢推、转场等需要在验收时记一笔的事 |

## 规则

- `id` 只用字母数字与短横线，避免路径问题。
- `end - start` 小于通道最短档时照样成段，生成后裁回，`note` 里写明。
- 段表是生成侧与剪辑侧**唯一的交接物**：生成侧只读 `id` 与 `end-start`，剪辑侧只读 `start`/`end`。
