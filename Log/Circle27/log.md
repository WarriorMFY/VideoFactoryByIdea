# Circle27 · 过程日志

> 由 `Circle.md` 的「中间过程」节下移（2026-11-23 结轮）。只记当时，不回改。

## 上午·i2i 固定变量实验

- 09:28 建圈。提醒：`Circle23`、`Circle26` 均未结束（Circle26 两次暂停），本轮不代结。
- 09:28 desc-to-spec 复述稿落 `spec-i2i-probe.md`，等待用户确认预算与口径。
- 09:32 定稿：T=4h、C=600、只用 Flux3、锚=场景（富春山居）+人物（对称正脸）；道具 C 组与通道横比转出。
- 09:28 已知前提：标准模型 API（420 端点）全部 1014，图生图只能走 AI 应用；Flux3 通道（`2114585366186516481`，20.06/次出 2 张）已在 Circle24 实测可用。
- 09:28–09:32 选锚（`anchors/A-scene.png` 1360×768 `8a443747`；B 改全身造型图 `B-person.png` 880×1184 `c359846c`，因正脸无法推全身）、建技能骨架、写 20 条 prompt（`make_prompts.py`）。
- 09:32–09:35 环境坑三连修：cv2 5 无 Haar→可选 YuNet；NO_API_KEY→`api_env()` 从 credential 注入；GBK 解码崩→PYTHONUTF8/PYTHONIOENCODING。
- 09:35 A-base 成功（20.91，2 张）：**风景锚基线即失控**（ssim 0.32/0.40，天空长头发伪影）。
- 09:38 A-V1-远 成功（17.0）；度量卡在 cv2.imread 中文路径，改 imdecode 后通过。
- 09:44 起 batch.py 串行跑剩余 18 条（提交→度量一条龙，失败继续），耗时 27 分钟。
- 09:46–09:58 **805 失败带**：A-V1-近、A-V3 水墨/油画/动漫、B-V1-七分身 共 5 条工作流失败（未扣费），与成功交织发生，暂判 prompt 相关或随机，按口径不重跑。
- 10:11 全部跑完：15 成功 / 5 失败；对账 17477.96−252.45=17225.51 ✓。
- 10:14 五张组级 sheet 生成并逐组视觉复核；指标全表落 `metrics-table.md`。
- 10:20 `实验报告单.md` 定稿（覆盖矩阵/指标表/分变量结论/横切发现/待验清单）；`judging.md` 回写 Circle27 实测校准（A/B 基线分档、dsat 放大、ncc 判景别、脸锁定档作废）。
- 10:20–13:25 调研期（未花积分）：Workflow API 全景（4 类接口/Key 权限矩阵/错误码）+ 工作流市场抓通（`/api/portal/template/list` 匿名可读，93,151 条）+ 图生图接口调研报告。
- 13:26 新通道冒烟：市场工作流「全能图片V2-图生图-官方稳定版」（`2027204046305628162`，节点 16 `RH_RhartImageNG31FlashOfficialImageToImage`）——`getJsonApiFormat` 拉回 JSON → 本地裁成 3 节点母版（`quanneng/wf-quanneng-v2.json`）→ **Workflow API 整图直传首次实战跑通**。Q-base 成功，实扣 **75.5**（2k，Flux3 的 4 倍），seed=42 显式可控，基线复刻质量高于 Flux3。单价 4 倍，全组 10 条约 755 远超 600 预算，用户决定暂不继续。
- 13:30 时间预算临界（4h 至 13:34:58）。
- 13:3x 用户指定：1k 档跑风景组 Flux 最差条（A-V1-中，ncc 0.666/0.737、ssim 0.218 垫底）。Q-A-V1-中 成功，实扣 **50.26**（1k = 2k 的 2/3）。量对比：Q-1k ncc **0.370**/ssim 0.166/edge 0.085，**三项全低于** Flux3 两张（0.737/0.666、0.218/0.218、0.131/0.116）；构图相对锚明显外扩（树变小、视野变宽），与「中景推近」方向相反。另发现：1k 档输出尺寸不规范（1376×768，非标准 16:9）。账：327.95+50.26=378.21/600。
- 13:4x **更正（用户质疑后复测）**：上一行「外扩/方向相反/更差」判读错误。ORB+RANSAC 相似变换估计：Q-1k scale **1.307（推近 30.7%）**，Flux3 out_1/out_2 scale **1.011/1.001（基本未动）**。并排图 `quanneng/compare-A-V1-zhong.png` 目视确认：Q 镜头推进、树/瀑布/梯田整体放大；Flux3 两张与锚几乎逐像素同构图。**新结论：风景景别在 Q 通道（Gemini 3.1 Flash 官方版）上有效，在 Flux3 上无效——上一轮「风景景别任务级无效」翻案为「通道相关」**。方法学：风景景别判据改用 ORB scale（ncc 低≠差，是「变了」的信号，不是「坏了」）。1k 档评估修正：尺寸 1376×768 非标，但指令执行准确，可用。

## 下午·能力调研与目录重组（零积分）

- 价格带排序：13 条官方工作流按积分归三带；选型攻略全网调研落 `workflow-selection-survey.md`。
- Flux3 通道 vs 官方工作流差异解释：同底座不同封装（webapp 参数化 vs 整图 workflow），价格差 4-5 倍来自重绘范围与节点组合。
- 5 功能 × 3 档能力矩阵：文生图/图生图/文生视频/图生视频/多参考 × 便宜/听话/旗舰三路。
- 「结构 × 权重归属」三象限重排全部模型（`model-capability-matrix.md` §6）：A 开源扩散（seed/mask 强、语义弱）/ B 闭源扩散（运镜强、价格带中）/ C 多模态 LLM（语义编辑强、14 图参考、seed 不暴露）；价格 = 归属 × 体量。
- 建 `Skill/hub/generation/workflow/` 接口目录：45 类 / 234 端点（`catalog.json` ← Circle21），五功能子目录（text-to-image / image-to-image / text-to-video / image-to-video）+ 三象限判据 + 命名规律。
- 技能归类重组：`flux3-edit`、`i2i-probe` → `image-to-image/`；`i2v-probe`、`wf-firstlast` → `image-to-video/`。脚本 `find_app()` 上溯机制验证移动不失效，旧路径 grep 零残留；`runninghub/` 留 `generation/` 根（全库唯一出口）。
- `t2v-probe` 封装（零积分）：H3 通道 `2085304953094107137`；`dur_to_index` 防 `205:select` 索引坑（1=5s…11=15s）；无锚度量（时长偏差/黑边/运动带）。
- `t2i-probe` 封装（零积分）：G-2.0 通道 `2046794551444119554`；`mirror_ncc` 量化本通道镜像对称副作用；1 张/次、~11 积分。
- runninghub/workflow 职权重划：`channels.md` 瘦身为平台纪律（85→37 行，删四节通道表）；通道表迁至 workflow 各功能 README（首帧/首尾表补入 image-to-video/README）；上游死文档（README / README_en / image-models / video-models）归档 `_upstream/`；6 文件指针修正（SKILL.md、cost.md、shot-repaint、card-experiment、t2i-probe、workflow/README）；grep 校验零死链。
- 方法论讨论（未落 Doc）：传统导演 8 阶段 → AI 导演工作流映射——骨架不动，中段三处替换（勘景→造景、选角→锁脸、现场→抽卡+修复），两端新增资产台账；核心论点「锚的管理」。最小链路验证经用户决定转入下一循环。
