# History/hotspot — 名人热点感知器（小循环 5，2026-11-01 建）

每 30 分钟由定时任务「名人热点感知器」唤醒一轮，收集 **24 小时内**的「名人演讲 / 名人采访」热点信号。**只收集信号，不做任何发布。**

## 目录约定

- `signals/<时间戳>.json` — 每轮完整信号（结构化）
- `signals/<时间戳>.md` — 同轮人读版，**先看这个**
- `signals/index.jsonl` — 全历史信号索引（纯追加，判重依据）

## 只增不删规则

- 每轮生成新文件，历史文件与 index.jsonl 一律不修改、不删除
- 同一信号（按 URL/ID 判重）再次出现标 `[重复]` 并记录首见轮次，不丢弃
- 唯一例外：误写入的测试占位条目可移除，但必须在同轮文件里留痕说明

## 信号来源（双通道）

| 通道 | 覆盖 | 实现 |
| --- | --- | --- |
| TED 官网 | 新演讲上线（≤24h） | `Tool/ops/hotspot_scan.mjs scan`（本机网络仅 ted.com 可靠，实测 Google News/feedburner/YouTube RSS 均不可达） |
| 联网搜索 | 采访/报道/其他演讲热点 | 定时任务内由代理搜索后经 `hotspot_scan.mjs add` 并入 |

## 手动查看 / 操作

```bash
node Tool/ops/hotspot_scan.mjs scan                                  # 立即跑一轮
node Tool/ops/hotspot_scan.mjs add --title .. --url .. [--note ..]   # 手工补一条到最新轮
ls -t History/hotspot/signals/*.md | head -1                          # 最新一轮人读版
```
