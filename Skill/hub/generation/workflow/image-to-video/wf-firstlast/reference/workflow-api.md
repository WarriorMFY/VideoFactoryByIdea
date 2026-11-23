# 工作流直跑契约（实测版）

> 取证时间 2026-11-19，账号 `apiType=NORMAL`。所有结论都有任务号可查。

## 一、核心机制

`POST /task/openapi/create` 的 `workflow` 字段可以塞**整份图 JSON**，平台会用它覆盖 `workflowId` 指向的图。

- `workflowId` **必填**（官方 advanced 文档 `required: apiKey, workflowId`）。
- 不传 → `301 must not be null`；给 `0` → `301 must be greater than 0`；给不存在的 → `380 WORKFLOW_NOT_EXISTS`。
- **解法**：填一个**存在的**图当占位（默认用文档示例 `1904136902449209346`），真正的图放 `workflow` 里。
- 平台回显的 `netWssUrl` 里仍然是占位 `workflowId`，**别用它判断跑的是谁的图**；看输出的文件名/节点后缀。

## 二、五步闭环

| 步 | 端点 | 关键点 |
| --- | --- | --- |
| ① 传素材 | `POST /task/openapi/upload`（multipart：`apiKey` `/` `file`` `/` `fileType=input`） | 回 `data.fileName`（`api/<hash>.png`），直接喂 `nodeInfoList`；单文件 30MB 上限（`809`） |
| ② 提交 | `POST /task/openapi/create` | `apiKey` + `workflowId` + `workflow` + `nodeInfoList[{nodeId,fieldName,fieldValue}]` |
| ③ 轮询 | `POST /task/openapi/outputs` | `0` 完成 / `804` 跑 / `813` 排 / `805` 失败（`failedReason`） |
| ④ 取回 | 同上 `data[].fileUrl` | 直接下载 |
| ⑤ 兜底 | `POST /task/openapi/cancel` | 跑飞了止损 |

## 三、模板 `vace-firstlast-24.json`（Wan2.2-VACE-Fun 首尾帧）

来源：公开帖 `https://www.runninghub.cn/workflow/1967630045374287873`，由 `getJsonApiFormat` 读回，24 节点。

| nodeId | 类 | 真实角色 |
| --- | --- | --- |
| **205** | LoadImage（title 写 "End"） | **首帧**：→ 199 → `start_image` |
| **204** | LoadImage（title 写 "Start"） | **尾帧**：→ 200 → `end_image` |
| 199/200 | ImageResizeKJv2 | 199 按 202 宽度 scale；200 按 199 出图尺寸裁 |
| 198 | WanVideoVACEStartToEndFrame | 首尾合流，`num_frames` ← 197 |
| 122 | WanVaceToVideo | 宽/高/长 ← 201（由 198 输出反推） |
| **119 / 120** | CLIPTextEncode | 正 / 负提示词 |
| 134 / 135 | KSamplerAdvanced ×2 | 高噪 0→3 步、低噪 3→尾；cfg=1，euler/simple，共 6 步 |
| 210 / 211 | UNETLoader | `VACE/Wan2.2-VACE-Fun-A14B-high/-low-alibaba-pai` |
| 127 / 128 | VAELoader / CLIPLoader | `wan_2.1_vae` / `umt5_xxl_fp8_e4m3fn_scaled` |
| 206 / 207 | LoraLoaderModelOnly | `lightx2v_T2V_14B_cfg_step_distill_v2` |
| 121 | VHS_VideoCombine | h264-mp4，16fps，crf 19 |
| **197 / 202** | INTConstant | 帧数（默认 81）/ 宽度（默认 1000） |

**坑 1：204/205 的 `_meta.title` 与连线相反。** 信连线。
**坑 2：改尺寸只动 197 与 202**，122 的宽高来自 201，不要直接改。
**坑 3：高度跟着锚图比例走。** 202=720、锚图 2.48:1 → 出 720×288；想 16:9 得先把锚图裁成对应比例。

## 四、实测账（3 秒量级）

| 任务 | 参数 | 时长 | 实扣 |
| --- | --- | --- | --- |
| `2123424206111858689` | 720 宽 / 49 帧 | 102s | **16.32** |
| `2123425678425817089` | 同上，仅换图位方向 | 81s | **12.75** |

同参数两次实扣不同 → 计费不完全由参数决定，别写单价，**只记每次实扣**。

## 五、边界

- `getJsonApiFormat` 只能读**作者存过**的公开图：`810 WORKFLOW_NOT_SAVED_OR_NOT_RUNNING` 表示读不到。
- 从 AI 应用（`webappId`）拿不到背后的 `workflowId`，`380` 是常态；应用通道和直跑是两条路。
- 平台**不允许**用 API 创建/保存一条自己能复用的工作流；直跑等于「每次自带图」，不复用任何云端模板。
- 中段不受两端条件约束，模型照旧脑补（本轮实测：悬崖背景横向漂移）。
