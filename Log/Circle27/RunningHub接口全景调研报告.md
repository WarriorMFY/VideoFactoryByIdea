# RunningHub 接口全景调研报告

日期：2026-11-23 ｜ 调研口径：**抽象接口 = 能通过网络通信协作调用的一切入口**（HTTP API、任务通道、上传、回调、LLM 协议端点）
方法：官方文档索引全量抓取（`llms.txt`，494 条）+ 11 篇核心文档原文核对 + 本仓历史实测交叉验证（Circle21/24/27）
性质：纯调研，本轮不做实验、不花积分

---

## 零、十句话结论

1. 官方接口分 **4 类**：**Model API / AI App API / Workflow API / LLM API**。前三者同为"任务制"（提交→taskId→查询），LLM 走 OpenAI/Anthropic/Gemini 兼容协议（同步/流式）。
2. 门槛是 **Key 三型**：免费用户无 Key（801）→ **Consumer-Member**（个人会员，只能 AI App + Workflow）→ **Enterprise-Shared**（企业按量，四类全通）→ **Enterprise-Dedicated**（购机后创建）。
3. **我们的 1014 有官方定义**：`Standard Model API is restricted to Enterprise-Shared API Keys only`——我们账号 apiType=NORMAL 属 Consumer 级，43 条图生图模型端点全部被这一条挡住。
4. 三类任务接口**本质是同一套东西**：底层都是 ComfyUI 工作流。Model API = 官方预置且文档化的工作流；AI App API = 他人封装的工作流（Flux3 属此类）；Workflow API = 自己搭建的工作流。
5. 区别在**控制权**：Model 参数固定但最稳；App 只能改作者开放的节点；Workflow 全节点可改，但**API 不能创建工作流**，必须网页搭一次并手动跑通（810）。
6. nodeInfoList（`nodeId`/`fieldName`/`fieldValue`）是 App/Workflow 的通用参数机制；**API 会强制重置 seed**——固定变量实验必须把 seed 显式塞进 nodeInfoList。
7. 企业 API 两档：**Shared**（默认 100 并发、按 GPU 秒计费、高峰排队）与 **Dedicated**（预付独占、不限调用、无排队）；官方明确"企业与消费级是**同一套接口**，激活需客户经理配置"。
8. 硬限制清单：上传单文件 **30MB**；工作流须保存+手动跑过（810）；内容审核失败 **1501**、**真人照片禁止 1505**；实例三档 24/48/84GB（435）；并发满 **421**。
9. 我们此前实验中的 **805** 官方定义是 `APIKEY_TASK_STATUS_ERROR`（任务中断/取消），**不是审核**（审核是 1501/1505）——上一个"审核假设"可排除。
10. 接口规模：平台级 18 个 + 标准模型 API **402 条**（视频 229 / 图像 105 / 音频 44 / 3D 14 / 其他 49）。

---

## 一、全景图

```text
RunningHub 对外接口
├─ 账户与凭证（门槛层）
│   ├─ POST /uc/openapi/accountStatus        查余额/并发/apiType
│   ├─ Key 三型：Consumer-Member / Enterprise-Shared / Enterprise-Dedicated
│   └─ 企业 API 两档：Shared（100 并发默认）/ Dedicated（预付独占）
├─ 任务提交（4 条主通道）
│   ├─ Model API    POST /openapi/v2/{model}          402 条，仅 Enterprise-Shared
│   ├─ AI App API   POST /task/openapi/ai-app/run     webappId + nodeInfoList
│   ├─ Workflow API POST /task/openapi/create         workflowId/整图 JSON + nodeInfoList
│   └─ LLM API      POST https://llm.runninghub.ai/v1/chat/completions  仅 Enterprise-Shared
├─ 任务查询与回调
│   ├─ V1：/task/openapi/status（状态串）、/task/openapi/outputs（产物）
│   ├─ V2：/openapi/v2/query（结果+计费 usage）
│   └─ webhook：事件详情 / 按事件重发（425761035/036）
├─ 资源上传
│   ├─ /task/openapi/upload          单文件 ≤30MB（新版另有入口）
│   └─ Upload Lora                   三步：取 URL→传文件→RHLoraLoader 节点
└─ 辅助
    ├─ /task/openapi/cancel          取消任务
    ├─ Get Workflow JSON             读回公开/自有工作流 api_format
    └─ 结果文件访问 /view?filename=…（Rh-Comfy-Auth 签名）
```

---

## 二、账户与凭证体系（第一层门槛）

### 2.1 两种账户实体

| 项 | 个人账户 | 团队账户 |
| --- | --- | --- |
| 定位 | 登录身份 + 默认使用实体 | 叠加在个人账户上的企业协作/计费实体 |
| 资源归属 | 全部归个人 | 团队资源池、团队钱包、席位、成员配额 |
| API Key 归属 | 个人实体 | 团队实体 |
| 账单 | 个人级 Tasks & Billing / LLM Logs | 团队级（保留实际调用成员） |

个人/团队之外没有第三种"登录账号"；企业级能力通过 Key 类型与团队实体获得，而非换账号。

### 2.2 API Key 三型与权限矩阵（官方原文）

| Key 类型 | 说明 | 可用接口 |
| --- | --- | --- |
| **Consumer-Member** | 个人账户会员权益（需 basic 或以上会员；免费用户 801） | AI App API、Workflow API |
| **Enterprise-Shared** | 企业按量付费权益 | **Model API、LLM API、AI App API、Workflow API（全通）** |
| **Enterprise-Dedicated** | 购买专属机器后可创建 | AI App API、Workflow API（其余不可） |

关键原文：*"Model API and LLM API only support Enterprise-Shared API Keys."* —— 这就是 **1014** 的来源。

### 2.3 企业 API 两档（同一套接口，激活靠客户经理）

| 档 | GPU | 计费 | 特性 | 代价 |
| --- | --- | --- | --- | --- |
| Shared | 与其他用户共享，**默认 100 并发** | 按 GPU 秒计费，不调用不收费 | 便宜灵活，高峰排队/延迟 | 受 ComfyUI 版本升级影响需自维护工作流 |
| Dedicated | 按并发购买独占 GPU | 预付订阅（数量×时长） | 无排队、版本稳定、提前通知升级 | 前期成本高 |

### 2.4 自查账户状态

`POST /uc/openapi/accountStatus` → `remainCoins / remainMoney / remainPoint / currentTaskCounts / apiType`。
我们账号实测 `apiType=NORMAL` → Consumer 级。**所有模型 API 文档即使抓到手也用不上，问题在 Key 级别，不在文档。**

---

## 三、四类接口的本质区别（核心）

### 3.1 官方定义（Instructions for Use 原文）

| 类型 | 官方描述 | 调用模式 |
| --- | --- | --- |
| Model API | 直接调用图像/视频/音频等模型能力 | 提交任务→taskId→查询 |
| AI App API | 调用封装好的 AI 应用，**业务友好的输入参数** | 提交任务→taskId→查询 |
| Workflow API | 调用多节点组合的工作流，适合复杂创作管线 | 提交任务→taskId→查询 |
| LLM API | OpenAI/Anthropic/Gemini 协议兼容 | 直接请求，常规或流式响应 |

### 3.2 本质对照（调研判断）

| 维度 | Model API | AI App API | Workflow API |
| --- | --- | --- | --- |
| 底层 | 平台预置的 ComfyUI 工作流 | **别人**封装好的工作流 | **自己**搭建的工作流 |
| 参数形态 | 模型专属 schema（如 `imageUrls`/`resolution`） | `webappId` + nodeInfoList（应用详情页定义） | `workflowId`（或整图 JSON）+ nodeInfoList |
| 可改性 | 只能改文档列出的参数 | 只能改作者开放的字段 | 任意节点、任意字段 |
| 稳定性 | 最高（平台维护，模型版本固定文档） | 取决于作者更新 | 取决于自己维护（节点弃用需返修） |
| 密钥 | **仅 Enterprise-Shared** | 三型 Key 均可 | 三型 Key 均可 |
| 典型代表 | seedream-v5-pro、nano-banana-pro | Flux3图像编辑（2114585366186516481） | Circle21 跑通的首尾帧工作流 |
| 计费 | 企业按量 | 会员点数/实扣 | 会员点数/实扣 |
| 一句话 | 成品套餐 | 别人家的厨房，只能调他开放的调料 | 自己家厨房，全权负责 |

### 3.3 同一性的证据链

- `f-2-dev/edit`（Model API）的文档参数是节点式：`20##image`、`17##text`、`46##select`、`51##file_type`——即"节点ID##字段名"，与 Workflow 的 nodeInfoList 完全同构；
- Model API 的结果查询也用 `/openapi/v2/query`，与 AI App/Workflow 的 V2 查询同一端点、同一 `usage.chargedPoint` 计费字段；
- 官方文档明说企业 API "uses the same interface as the consumer-grade API"。
- 推论：**三者只是"工作流归属与参数封装层"不同，执行层完全相同。** 想用某模型（如 Seedream），若无 Enterprise-Shared Key，可尝试在 Workflow API 里搭一个含该模型节点的自建工作流——这是文档未承诺、但机制上成立的路径，需实测。

### 3.4 nodeInfoList 机制（App/Workflow 的通用参数）

- `nodeId`：工作流界面右上角的节点编号；`fieldName`：该节点 `inputs` 里的键；`fieldValue`：新值。
- 传图两法：① 自建图床 + `LoadImageFromUrl` 节点直接给 URL；② 上传接口拿 `fileName` 喂 `LoadImage` 节点。
- **坑 1：API 调用会强制重置 seed**。要固定随机性，必须把 seed 写进 nodeInfoList（固定变量实验的核心方法学修正）。
- 坑 2：API-format 工作流里 `[]` 包裹的值表示节点连线，不建议修改。
- 坑 3：纯前端字段（如 KSampler 的 `control_after_generate`）与 group 逻辑在 API 下不存在。
- 坑 4：工作流必须先在网页保存并**手动跑过一次**（810 `WORKFLOW_NOT_SAVED_OR_NOT_RUNNING`）。

---

## 四、接口总清单

### 4.1 平台级接口（18 个）

| 组 | 接口 | 端点 | 说明 |
| --- | --- | --- | --- |
| 账户 | Get Account Information | POST `/uc/openapi/accountStatus` | 余额/任务数/apiType |
| 上传 | Upload Resource | POST `/task/openapi/upload` | 图/视频/音频/压缩包，**单文件 ≤30MB** |
| 上传 | 文件上传（新） | （425761098，新入口） | 与旧版并存 |
| 上传 | Upload Lora | 三步流 | 取 URL→传文件→RHLoraLoader |
| 提交 | Start AI App Task | POST `/task/openapi/ai-app/run` | webappId + nodeInfoList；支持 webhookUrl、instanceType、accessPassword |
| 提交 | Start ComfyUI Task 1 (Basic) | POST `/task/openapi/create` | workflowId + nodeInfoList |
| 提交 | Start ComfyUI Task 2 (Advanced) | （425761093） | 可直塞整图 workflow JSON |
| 提交 | Model 端点 ×402 | POST `/openapi/v2/{model}` | 见 4.2 |
| 提交 | LLM | POST `https://llm.runninghub.ai/v1/chat/completions` | OpenAI 协议兼容；仅 Enterprise-Shared |
| 查询 | Check Task Status (V1) | POST `/task/openapi/status` | 返回状态串 QUEUED/RUNNING/FAILED/SUCCESS |
| 查询 | Check Task Output (V1) | POST `/task/openapi/outputs` | 产物列表 |
| 查询 | Query Result (V2) | POST `/openapi/v2/query` | 结果 + `usage.chargedPoint` 实扣 |
| 取消 | Cancel ComfyUI Task | POST `/task/openapi/cancel` | 取消排队/运行任务 |
| 工作流 | Get Workflow JSON | POST `/task/openapi/getJsonApiFormat` | 读回 api_format JSON |
| webhook | 事件详情 / 按事件重发 | （425761035 / 425761036） | 回调补投 |
| 文件 | 结果访问 | GET `/view?filename=…&Rh-Comfy-Auth=…` | 签名 URL |
| 企业 | Shared / Dedicated 激活 | 客户经理配置（jason@runninghub.ai） | 接口不变，权益不同 |

### 4.2 标准模型 API 402 条分类

| 二级分类 | 条数 | 主要三级分类（条数） |
| --- | --- | --- |
| Video Generation & Processing | 229 | 图生视频 88、文生视频 65、参考视频 33、视频工具 18、视频编辑 7、视频转视频 6、动作控制 5… |
| Image Generation & Processing | 105 | 文生图 50、**图生图 44**、图像工具 5、图像特效 5、参考生图 1 |
| Other | 49 | 综合/杂项模型 |
| Audio Generation & Processing | 44 | TTS 24、文生音乐 10、音频转音频 4… |
| 3D Generation & Processing | 14 | 图生 3D 12、文生 3D 2 |

---

## 五、限制汇总（按维度）

| 维度 | 限制 | 依据 |
| --- | --- | --- |
| 免费用户 | 不能创建/使用 API Key | 801 `APIKEY_UNSUPPORTED_FREE_USER` |
| Key 级别 | Model API / LLM API 仅 Enterprise-Shared | 1014 官方定义 |
| 会员 | Consumer 通道需 basic 或以上会员 | About Enterprise ComfyUI API |
| 并发 | Consumer 文档未公开数值（登录 API Key 页看对照表）；Enterprise-Shared 默认 100；满则 421 | 错误码 + 企业文档 |
| 独占实例 | plus=48GB / ultra=84GB，耗尽 415 | 435 / 415 |
| 文件 | 单文件 ≤30MB；格式 jpg/png/webp/zip/mp3/wav/flac/mp4/avi/mov/mkv | 上传文档（Circle21 实测 809） |
| 工作流 | 须网页保存 + 手动跑过；API 不能创建；nodeInfoList 不能改前端字段/连线 | 810 / nodeInfoList 文档 |
| 审核 | 内容审核失败 1501；**写实真人照片禁止 1505** | 错误码 |
| 随机性 | API 强制重置 seed，需显式传 | nodeInfoList 文档 |
| 计费 | 点数结算（`settleMode=POINT`，`chargedPoint` 实扣）；企业 Shared 按 GPU 秒 | V2 查询文档 + 企业文档 |

---

## 六、错误码速查（高频 20 条）

| 码 | 含义 | 备注 |
| --- | --- | --- |
| 301 | 参数无效 | |
| 380 | 工作流不存在 | 用 appId 当 workflowId 会撞这个 |
| 412 | Token/URL 错误 | |
| 415 | 独占实例耗尽 | 30-120 秒后重试 |
| 416 | 钱包余额不足 | |
| 421 | 并发上限（Shared） | 客户端自行排队 |
| 435 | 实例类型不存在 | 48G 用 plus，84G 用 ultra |
| 801 | 免费用户不支持 API Key | 需升级会员 |
| 802 | Key 无效/已禁用 | |
| 803 | 节点信息不匹配 | nodeId/fieldName 与工作流不符 |
| 804 | 任务运行中 | 勿重复提交 |
| **805** | **任务状态错误（可能被中断/取消）** | **我们实验中的失败就是它** |
| 809 | 文件超限 | 30MB |
| 810 | 工作流未保存/未跑过 | 先网页手动跑一次 |
| 813 | 已排队 | 正常，勿重试 |
| 901 | webapp 不存在 | |
| 1003 | 请求频率过高 | |
| 1014 | Model API 仅限 Enterprise-Shared | 我们的卡点 |
| 1501 | 内容审核未通过 | 改 prompt/图 |
| 1505 | 写实真人照片被禁止 | 人物实验注意 |

---

## 七、对我方项目的直接影响

1. **Flux3 通道定位**：AI App API（Consumer-Member 可用）——我们已有的 `i2i-probe` 实验体系在现有 Key 下是"用满了权限"的状态，没有更低成本的可调模型通道。
2. **1014 是可预期的权限墙**，不是 bug 也不是文档问题：43 条 Model 端点（含 Seedream/Nano Banana/FLUX.2）需 Enterprise-Shared Key（企业按量付费）。是否升级是**成本决策**，调研到此为止提交给你。
3. **零升级的升级路径**：Workflow API（已有文档 + 已实测跑通）→ 在网页工作台搭含目标模型节点的图生图工作流 → 用 nodeInfoList 做固定变量实验。风险：模型节点是否对 Consumer 会员开放需实测；工作流节点版本变动需自维护。
4. **实验方法学修正（立即适用）**：下一轮固定变量实验必须把 **seed 显式写进 nodeInfoList**（若走 Workflow），或接受 API 重置 seed 带来的采样噪声——这可能正是我们此前"风景锚基线不稳、同档两次差异大"的放大因素之一。
5. **审核边界需登记**：1505 禁止写实真人照片——人物身份实验今后若遇拦截，先怀疑 1505 而非 805。
6. **805 定性更新**：官方含义是任务中断/取消，与我们观察（5/20 频发、未扣费）相符，但**成因仍未查明**；此前"审核拦截"假设正式排除。

---

## 附：数据来源

| 编号 | 标题 | 抓取时间 |
| --- | --- | --- |
| `llms.txt`（494 条索引） | 官方文档全量索引 | 2026-11-23 |
| doc-8287463 | Instructions for Use（4 类接口 + Key 矩阵） | 2026-11-23 |
| doc-8287464 | About nodeInfoList（机制 + 4 个坑） | 2026-11-23 |
| doc-8287465 | About Enterprise ComfyUI API（Shared/Dedicated） | 2026-11-23 |
| doc-8287467 | API Error Code Reference（全表） | 2026-11-23 |
| api-425761030 | Get Account Information（apiType 自查） | 2026-11-23 |
| api-425761033 / 425767807 | V1 状态查询 / V2 结果查询（含计费字段） | 2026-11-23 |
| api-425761096 / 425761097 | Start AI App Task / 调用示例 | 2026-11-23 |
| api-425761099 | Upload Resource（30MB 限制） | 2026-11-23 |
| api-494859263 / 448184482 / 448184497 / 494859264 | seedream-v5-pro / f-2-dev/edit / nano-banana-pro / qwen-3.0-pro | 2026-11-23 |
| 本仓实测 | Circle21（Workflow API 跑通、809 30MB、getJsonApiFormat、380）；Circle24（1014 全端点、41 应用筛选）；Circle27（Flux3 20 条、805 频发） | 2026-11-19 ～ 11-23 |
