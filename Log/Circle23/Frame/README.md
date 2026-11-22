# Frame · 香玉关键帧协作工作台（原型）

Circle23《香玉》31 帧关键帧树的本地协作页。左侧关键帧结构树，右侧生成通道；
过程数据全部落本目录 `frames/<帧号>/`，一个叶子节点一个目录。

## 启动

```powershell
python server.py          # 默认 http://127.0.0.1:8765
python server.py 8766     # 自定义端口
```

仅依赖 Python 标准库，无需安装第三方包。

## 目录结构

```
Frame/
├── server.py             # 本地后端（stdlib http.server）
├── data/
│   └── tree.json         # 唯一数据源：根参数、六章参数、31 帧元信息
├── static/
│   └── index.html        # 单页前端（内联 CSS/JS，无外部依赖）
├── frames/
│   └── frame_<NN>/       # 叶子目录，首次打开该帧时自动初始化
│       ├── meta.json      # 可回写：style / note / tags / status
│       ├── prompt.md      # 本帧提示词草稿
│       ├── images/        # 出图产物
│       ├── videos/        # 出视频产物
│       └── last_request.json  # 生成请求留档（当前为 stub）
└── _previews/            # 原型自检截图
```

## 页面规则

- **根节点**（非叶子）：只显示全局参数——两条画风全局提示词、世界锚点、组合禁令，只读。
- **章节节点**（非叶子）：只显示章级参数——光位 / 留黑 / 雾 / 章眼帧，附本章帧清单。
- **叶子帧**：元信息只读（景别、V1/V2/V3、暖色、情绪、画面点、旁白、标签）；
  可编辑画风归属（没骨主 / 水墨辅）、本帧提示词、帧备注；附合并预览（全局＋本帧）。

## 后端接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/` | 前端单页 |
| GET | `/api/tree` | 读取 tree.json |
| GET | `/api/frame/<fid>` | 读/初始化叶子目录，返回静态字段＋meta＋prompt＋产物清单 |
| POST | `/api/frame/<fid>` | 回写 meta 白名单字段与 prompt.md |
| POST | `/api/generate/<fid>` | 生成入口（**当前为 stub**，请求留档 last_request.json，未扣积分） |

## 当前边界（下一轮再接）

1. 生成按钮未接通 RunningHub：文生图通道、节点名、单价需先重读
   `Skill/hub/generation/runninghub/references/channels.md`，再用 `--info <appId>` 核节点真名。
2. 产物区只列文件名，图片/视频预览未接。
3. tree.json 中帧 2、12 夜景是否划入辅助水墨，待拍板。
4. 根级光向、暗部侧等锚点标注「待复核」，定稿后回写 tree.json。
