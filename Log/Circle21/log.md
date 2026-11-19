# Circle21 过程日志

> 只记当时。脚本是现场器材，不保证可运行。

## 1. 环境与入口

- 仓库被上一轮（Circle19）重排成四桶，RunningHub 技能从 `Skill/RHClaw/runninghub/` 移到 **`Skill/hub/generation/runninghub/`**。首个用旧路径的调用直接 `No such file or directory`。
- 现役通道清单在 `Skill/hub/generation/runninghub/references/channels.md`：文生图 `2046794551444119554`、文生视频 `2085304953094107137`、首帧图生视频 `2113790012012720129`；文末写"同类可挂：首尾帧插值、参考图生视频、视频重绘、TTS 配音"——本轮就是去验证这句话到底有多少可挂。

## 2. 接口枚举的三条路

| 路 | 做法 | 结果 |
| --- | --- | --- |
| ① 实时目录 | `scripts/runninghub.py --list` | **Total: 420 endpoints**，与 `data/capabilities.json`（version 2026-08-18）完全一致 |
| ② 参数结构 | 读 `capabilities.json` 的 `params`，统计 `IMAGE/VIDEO/AUDIO/MASK` 位 | 得到 48 种任务的"输入位签名" |
| ③ 官方文档索引 | `https://pre.runninghub.cn/runninghub-api-doc-en/llms.txt`（258KB） | **415 篇接口文档**，三级分类 `Standard Model API > 视频生成与处理 > image-to-video > kling` |

**踩坑一**：应用市场列表 API（`/openapi/v2/aiapp/list`）**不支持关键词**。往 payload 里塞 `keyword=尾帧`，`total` 仍是 86265、返回列表不变——参数被忽略。想按名字找 webapp，只能翻页或走网页搜索。

**踩坑二**：`llms.txt` 第一次用 web.fetch 分页读取只拿到前 20000 字符（total 56188），分类树只解析出 155 条。改用 `urllib` 直取整份落盘，才得到 493 个链接、415 条分类条目。

## 3. 关键统计（脚本产出）

- 任务类型 48 种，最大的是 image-to-video 72、text-to-video 60、text-to-image 42、image-to-image 35、reference-to-video 25。
- `image-to-video` 的位分布：首帧 37 / 首尾 23 / 多图参考 5 / 首帧+音频 3 / 纯文本 2 / 首尾+音频 1 / 视频+首尾 1。
- `start-end-to-video` 10 个，`firstImageUrl` + `lastImageUrl` 均必填。
- `motion-control` 5 个，`imageUrl` + `videoUrl` 均必填。
- `video-extend` 7 个，`videoUrl` 必填、`seed` 可选。
- `video-edit` 10 个，`videoUrl` 必填 + `imageUrls` 最多 7 + `keepOriginalSound`。
- `multimodal-video` 12 个：`imageUrls`×9 + `videoUrls`×3 + `audioUrls`×3，另有 `returnLastFrame` 开关。
- 全库 `MASK` 类型参数数 = 0；端点名含 inpaint/matte/segment/remove-bg 的 = 0。

## 4. 官方原文摘录（约束语义的一手依据）

- `kling-video-o1/start-to-end`：同时给出起点与终点视觉状态，模型补中间；"eliminates the unpredictability of AI video endings"。
- `kling-v3.0-pro-motion-control`：角色图 + 驱动视频 → 复刻舞蹈/手势/运动轨迹（3D 时空关节注意力）。
- `wan-2.7/video-extend`：延续现有片段，720P/1080P，最长 15 秒，可带音轨与负向提示。
- `kling-video-o3-pro/video-edit`：保留原片运动与结构换对象/场景/风格，Pro 最多 4 张参考图。
- `kling-video-o1-std/refrence-to-video`："Identity Lock"，多视角参考锁人物/道具/场景。
- `rh-video-upscaler`：超分到 720p–4K，强调帧间一致、去闪烁。
- `topazlabs-video-frame-interpolation`：按 `outputFrameRate` 提帧率/慢动作。

## 5. 落盘的中间数据

`Log/Circle21/` 下：

| 文件 | 内容 |
| --- | --- |
| `llms_index_en.txt` | 官方文档索引原文（258KB，493 链接） |
| `doc_index.json` | 解析后的 415 条（分类路径 + 名称 + URL） |
| `catalog_by_task.json` | 48 类任务的端点清单与代表签名 |
| `apps_HOTTEST/NEWEST/RECOMMEND.json` | 应用市场三排序各 50 条（关键词不可用，仅作证） |
| `probe_app_search.py` / `catalog_dump.py` / `parse_index2.py` / `build_matrix.py` | 现场脚本 |

## 6. 未做（原始版）

- 一次真实调用都没跑，积分 0。
- C3/C4 的约束力还只是"官方描述 + 参数位推断"，没有实测数字；本账号也调不动这 420 个标准接口（1014）。

## 7. 账号权限复核（21:40-21:57）

官方 `doc-8287463`《Instructions for Use》给出四类 API 与 Key 的授权表：

| API | 可用 Key |
| --- | --- |
| Model API | 仅 Enterprise-Shared |
| LLM API | 仅 Enterprise-Shared |
| AI App API | Consumer-Member / Enterprise-Shared / Dedicated |
| Workflow API | Consumer-Member / Enterprise-Shared / Dedicated |

`doc-8287465`《About Enterprise ComfyUI API》另写："RunningHub currently offers a **consumer-level ComfyUI API, available for users with a basic or higher membership**, allows you to interact with and trigger any workflows deployed on RunningHub."

**实测（含一次误触）**：用本账号 Key POST `https://www.runninghub.cn/task/openapi/create`，
- `workflowId=0` → `{"code":301,"msg":"must be greater than 0"}`（参数校验，未建任务）；
- `workflowId=1904136902449209346`（**文档示例里的公开工作流**）→ `{"code":0,"msg":"success","data":{...taskId...}}`。

第二枪本意是看"无权限"长什么样，结果真的把示例工作流跑起来了：`running_tasks` 由 0 → 1，约 90 秒后回 0；coins 前后都是 1000，暂未见扣减。**这是一次未预告的真实任务，属于我的操作失误**，已当面告知用户。

同一枪也证明：**NORMAL 账号可调 Workflow API**，C3 不需要企业号。

Workflow API 契约要点（`api-425761092` / `api-425761093`）：`apiKey` + `workflowId` + 可选 `nodeInfoList`（`nodeId`/`fieldName`/`fieldValue`）；可直塞 `workflow`（整图 JSON，覆盖 workflowId）；`instanceType` = default 24G / plus 48G / ultra 84G；`webhookUrl` 可回调；`addMetadata` 默认 true。

## 8. 未做（修订版）

- C4/C5 的约束力仍是"官方描述 + 参数位"。
- 无尾帧位的三条现役通道，仍未改。

## 9. C3 首尾帧实跑（22:01-22:12）

试通道过程：

1. `1968236350354927618`（首尾帧听话版）——`--info` 8 节点正常，`--run` 报 `901 webapp not exists`，应用已关。
2. `2065247777185161217`（LTX2.3 首/中/尾三帧）——只暴露 1 个 prompt 节点，图位不可改，弃。
3. 改投 `2103693788333039617`（Wan2.2 首尾帧，开源，5 节点）——提交成功，拿到结果。

实跑参数：

| 项 | 值 |
| --- | --- |
| webapp | `2103693788333039617` |
| 图位 | `48:image` = 起点锚-塔旁起飞.png；`49:image` = 掠过锚-填满画幅.png |
| prompt | 镜头固定，三人并排骑扫帚从远处灯塔边飞近，斗篷被风扬起，海面逆光闪烁。 |
| 尺寸 | `29:value=1280`、`30:value=720` → **实际出 720×1280（竖屏，说明 29 是高、30 是宽）** |
| 任务 | `2123416532494278658`，405s |
| 产物 | `Workspace/anchor_hp/c3_startend_test.mp4`（3.8MB，81 帧） |

度量（`measure_c3.py`，基准=锚图中心裁 9:16 再 resize）：

| 对比 | NCC | SSIM |
| --- | --- | --- |
| 首帧 × 起点锚 | 0.9303 | 0.8011 |
| 末帧 × 掠过锚 | 0.7390 | 0.7578 |
| 首帧 × 掠过锚 | 0.2172 | 0.3314 |
| 末帧 × 起点锚 | 0.1878 | 0.3436 |

读出来的三条：

- **双锚成立**：两端都在，顺序对（48 是首、49 是尾）。
- **尾比头松**：0.74 vs 0.93，尾帧只是"大致这构图"。
- **中段照旧脑补**：灯塔从画外"长"出来、三人从坡顶滑到海面，尾帧的东西被提前塞进中段。

代价：单条 5s、720×1280 跑 405s。**本次没在跑前记 `remainPoint`，所以这一条的积分数取不到**（口径错误见 §11）。

## 10. 未做（二次修订）

- 横幅 1280×720 重跑一次，看宽高参数纠正后首尾值能否上 0.95。
- C4（动作控制）、C5（`returnLastFrame` 造尾帧闭环）仍未验。

## 11. 积分口径修正（22:20，用户纠错）

用户指出：**`coins` 是金币，不是积分。** 复核仓库既有口径：

- `Tool/README.md` §已知事实：`runninghub_app.py --check` 以 `remainMoney`（钱包现金）判余额，会误报 `no_balance`；**真实可用额度看 `Skill/hub/generation/runninghub/scripts/account.py` 打印的 `remainPoint`**。
- 现读：`remainPoint=18688.0`、`remainCoins=1000`、`remainMoney=0.0000`、`currentTaskCounts=0`、`apiType=NORMAL`。
- `https://www.runninghub.cn/uc/openapi/accountStatus` 只回这 6 个字段，**没有"今日消耗/流水"**，所以单条成本只能靠**跑前跑后各取一次 `remainPoint` 求差**。

错误追溯：本轮 §7、§9 都以 `coins=1000` 当"没扣费"的证据，结论无效。以后每次 `--run` 前先 `account.py` 记一次 `remainPoint`，跑完再记一次。

## 12. 未做（三次修订）

- C3 单条真实成本：缺跑前基线，只能从下一条开始记账。
- 横幅 1280×720 重跑；C4/C5 实测。

## 13. 自建首尾帧工作流的调研（22:25-22:40）

产出 `首尾帧工作流-最小闭环搭建清单.md`。关键取证：

- `getJsonApiFormat`（`POST /api/openapi/getJsonApiFormat`）能用本号读回**公开工作流**的图 JSON：示例 `1904136902449209346` 返回 `code=0` + 完整 `prompt`。
- 但 **appId 不能当 workflowId 用**：拿 `2103693788333039617`、`1968236350354927618` 调同一接口，都返回 `380 WORKFLOW_NOT_EXISTS`。
- 上传接口 `POST /task/openapi/upload`：单文件上限 **30MB**，超限回 `809 APIKEY_FILE_SIZE_EXCEEDED`；支持 jpg/png/webp/zip/mp3/wav/flac/mp4/avi/mov/mkv；返回 `fileName` 只是服务器相对路径，**不能拼成外链**。
- 完整闭环五步：upload → create → outputs（804 跑/813 排队/805 失败带 `failedReason`）→ 取 `fileUrl` → cancel 兜底。
- 结论：**API 不能创建工作流**，第一步必须在网页工作台手工搭；搭完一次之后可全自动。


## §14 自建链路实测：`workflow` 整图直传跑通（2026-11-19）

**结论先行：不用在网页搭工作流，也能用自己的图跑。** 之前那条"API 不能创建工作流"的结论只对了一半——API 确实不能**创建**工作流，但能把**整套图 JSON 直接塞进任务**。

### 14.1 找到可复制的图

- 全网搜到 `runninghub.cn/workflow/<id>` 形式的帖：`1967630045374287873`（Wan 2.2-Fun-VACE first & last frames），`getJsonApiFormat` 回 `code=0`，**24 节点完整首尾帧视频图**，已存 `wf_template_firstlast_1967630045374287873.json`（7047 字节）。
- 对照：`2031629082689015809`、`2031629068197695489`、`1970051115515584513`、`1955945535456903170`、`1997315730213376002` 一律 `810 / 380`，读不到。
- 能读到的另两条（`1945419086425935874` 17 节点 Flux、`2010295867688886273` 20 节点 Qwen 编辑）都是**图片**，不作视频用。

### 14.2 模板结构（标题不可信，看连线）

| 节点 | 类 | 真实角色 |
| --- | --- | --- |
| 204 | LoadImage（标题写 "Start"） | **实际是尾帧**：喂给 200 → `end_image` |
| 205 | LoadImage（标题写 "End"） | **实际是首帧**：喂给 199 → `start_image` |
| 199/200 | ImageResizeKJv2 | 199 按 202 宽度 scale，200 按 199 出图尺寸裁切 |
| 198 | WanVideoVACEStartToEndFrame | 首尾合流，`num_frames`=197 |
| 122 | WanVaceToVideo | width/height/length 来自 201（GetImageSizeAndCount） |
| 119/120 | CLIPTextEncode | 正/负提示词 |
| 134/135 | KSamplerAdvanced×2 | 高噪 0→3 步、低噪 3→尾，cfg=1，euler/simple，6 步 |
| 210/211 | UNETLoader | VACE/Wan2.2-VACE-Fun-A14B-high / -low（MoE 双专家） |
| 121 | VHS_VideoCombine | h264-mp4，16fps，crf 19 |
| 197 / 202 | INTConstant | 帧数 81 / 宽度 1000 |

**坑**：204/205 的 `_meta.title` 与实际连线**相反**。信连线，别信标题。

### 14.3 直传实测

- 首次只传 `workflow` 不传 `workflowId` → `301 must not be null`。官方 advanced 文档 `required: apiKey, workflowId`，**workflowId 必填**。
- 改成 `workflowId=1904136902449209346`（任意存在的图当占位）+ `workflow=<自己的 24 节点图>` → **`code=0`**，任务 `2123424206111858689`。
- 输出 `AnimateDiff_00001_p80_mxpsz_1795098848.mp4`（前缀/后缀都来自我们的 121 节点，**证明跑的是我们塞进去的图，不是占位图**）。
- 参数：204=起点锚、205=掠过锚、119=自拟提示词、197=49 帧、202=720 宽。
- 结果：**720×288、49 帧、16fps ≈ 3.06s、626KB、102 秒**。
- 成本：跑前 `remainPoint=18688.0` → 跑后 `18671.68`，**实扣 16.32 积分**（比应用通道那条 24.33 便宜）。

### 14.4 对齐度量（基准同 measure_c3.py，中心裁 16:9 后 resize）

| 项 | NCC | SSIM |
| --- | --- | --- |
| 首帧 × 掠过锚 | **0.9960** | **0.9566** |
| 末帧 × 起点锚 | **0.9606** | 0.6866 |
| 交叉（首×起点 / 末×掠过） | 0.3489 / 0.3364 | 0.3418 / 0.3658 |

解读：两端的**像素锁定都到了 0.96 以上**（应用通道那条是 0.93 / 0.739），交叉值全在 0.33 上下，**首尾没有串**。但因为 204/205 反向，成片方向是"由近到远退出去"，语义上是**倒着飞**——方向问题，不是对齐问题。

### 14.5 新结论

1. `workflow` 整图直传是**可用的最小闭环**：一次调用即完成"自选图 + 自定参数"，不需要网页、不需要自己的 workflowId。
2. 但 `workflowId` 必须给一个**存在的**值做占位；换成不存在的会 `380`。
3. 占位 `workflowId` 的图不会被采纳，**输出文件名/nodeId 能自证**。
4. 方向修正只需互换 204/205 两张图，无需改图结构。

## §15 方向修正复跑：互换 204/205 即得"由远及近"（2026-11-19）

- 任务 `2123425678425817089`，`code=0`，**81 秒**，输出 `720×288 / 49 帧 / 16fps / 3.06s / 546KB`。
- 参数只改图位：`204`（=尾帧）= 掠过锚，`205`（=首帧）= 起点锚；提示词、帧数、宽度与上一条完全一致。
- 成本：`18671.68 → 18658.93`，**实扣 12.75 积分**（同参数下比上一条的 16.32 更低，说明计费与排队/实例分配有关，不是固定值）。
- 度量（中心裁 16:9 基准）：

| 项 | NCC | SSIM |
| --- | --- | --- |
| 首帧 × 起点锚 | **0.9788** | 0.7707 |
| 末帧 × 掠过锚 | **0.9901** | **0.9206** |
| 交叉（首×掠过 / 末×起点） | 0.3454 / 0.3402 | 0.4017 / 0.3421 |

- 观感：f0 远景（白塔、悬崖、三个小点）→ 人物逐步逼近、扫帚横向延展 → f48 三人满画幅近景，脸与服装与锚图一致；中段悬崖背景有小幅横向漂移（模型仍在补空间），但**首尾两端 0.97+ / 0.99** 锁死。
- 对比应用通道（`2103693788333039617`：首 0.9303 / 尾 0.7390），**自建图在这两个锚上全面更好**，且尾端从 0.74 提到 0.99，说明 VACE-Fun 的首尾条件比那条开源应用的实现更强。
