# Circle33 · 网页端导演编辑工具（原型）

| 项 | 值 |
| --- | --- |
| 开始时间 | 2026-11-24 |
| 结束时间 | 未结束 |
| 目标 | 参考圈 32 的工作流（剧本 → 风格 → 锚图 → 分镜 → 合成），做一个网页端导演编辑工具：左侧项目列表、右侧项目视图区，每个项目固定 5 个 tab |
| 状态 | **进行中**（2026-11-24 23:15 起为 v0.11 三分目录版） |

## 需求拆解（来自用户指令）

1. 网页端，不是桌面程序。
2. 左栏：**项目列表**。
3. 右栏：**项目视图区**，每个项目固定 tab = `1.剧本 / 2.风格 / 3.锚图 / 4.分镜 / 5.合成`。
4. 先出**快速原型**，再讨论。

## 原型位置

`Tool/director-editor/`（2026-11-24 23:07 由 `Workspace/director-editor/` 迁入，用户令「以后在这里开发」）：

2026-11-24 23:15 起按 `html/` `script/` `doc/` 三分（用户令「分 doc, script, html 三个子目录」）：

| 目录 | 文件 | 作用 |
| --- | --- | --- |
| `html/` | `index.html` | 骨架：侧栏 + 主区 + tab |
| `html/` | `styles.css` | 深色工作台样式（琥珀强调色，贴合 NASApunk 片子的视觉） |
| `html/` | `data.js` | 种子数据：圈 32（NASApunk 30s）与圈 31（锈日 25s）两个项目 |
| `html/` | `app.js` | 状态、渲染、图片挂载 / 锁定、通道选择 |
| `script/` | `serve.py` | 本地服务：静态（根=html/）+ 项目目录 + 选图 / 上锁 + t2i 转发 |
| `script/` | `_smoke.js` | 74 项无浏览器断言（`--old` 另测旧格式） |
| `doc/` | `前端设计.md` `后端设计.md` | 分层设计说明（截图不入工具目录） |

零依赖前端 + `serve.py`（标准库）后端。启动：`cd Tool/director-editor && python script/serve.py`（默认 8347）。
冒烟：`node script/_smoke.js`（在 `Tool/director-editor` 下跑）。

**落盘快照**：`Log/Circle33/editor/`（2026-11-24 与当时的 Workspace 同步的 5 个文件：`index.html` / `styles.css` / `data.js` / `app.js` / `_smoke.js`）。Log 只记当时，后续改动只进 `Tool/director-editor/`；快照在副本目录里重跑冒烟可通过。

## 中间过程

- 2026-11-24 建圈。用户指令：「新建循环，参考循环 32，我想开发一个网页端导演编辑工具，左侧是项目列表，右侧是项目视图区域。每个项目目前都有固定 tab={1.剧本，2.风格，3.锚图，4.分镜，5.合成}，先出个快速原型我们再继续讨论」。
- 2026-11-24 v0.2 锚图页抽屉化。用户指令：「锚图页改一下，锚图页下左侧再分{1.场地，2.角色，3.机位，4.关键，等等}抽屉后续要方便拓展，再出一版」。
  - 数据：项目的扁平 `anchors[]` 改为 `anchorGroups[{id,label,hint,items[]}]`；圈 32 四个抽屉 = 场地 4 / 角色 2 / 机位 2 / 关键 3（K1d-out2、K2b-out2、K3b-left）。
  - 界面：锚图面板拆成 `.subshell` 两栏——左抽屉导航（序号 + 名称 + 计数 + 「＋ 新抽屉」），右当前抽屉的卡片网格；卡右上「×」删除；抽屉标题栏带「＋ 新增锚」。
  - 扩展：抽屉是纯数据驱动，加抽屉只需 push 一条；`blankProject()` 用 `ANCHOR_DRAWERS` 生成四个空抽屉；旧版 localStorage 的扁平 anchors 自动迁移（按 id 前缀 A1→角色 / A2b·A4→机位 / A2·A3→场地 / K→关键 / 其余→未分类）。
  - 验证：`node --check` + 无头冒烟 `_smoke.js`（渲染 11 项、事件 6 项、迁移 4 项全过）。
- 2026-11-24 用户令「先保存到循环目录下」→ 原型 v0.2 冻结到 `Log/Circle33/editor/`，并在该副本目录重跑 `_smoke.js` 与 `--old` 均通过。
- 2026-11-24 用户令「提交到本地与远端，暂停」→ `Log/Circle33/` 入 git；循环暂停。未做：抽屉改名/删除/排序、锚的 kind 与状态在界面可改。
- 2026-11-24 21:06 用户令「启动循环」：先说 13、经确认是 **33** → 恢复本圈。
  - `Workspace/director-editor/` 在拉取后不存在（Workspace 不入 git），从 `Log/Circle33/editor/` 快照回拷 5 个文件。
  - 验证：`node --check app.js` / `data.js` 通过，`node _smoke.js` 全 PASS（渲染 11 / 事件 6 / 迁移 4）。
  - 未扣积分、未改技能、未提交 git（纪律：只在结轮提交）。
- 2026-11-24 21:12 用户令「启动网页控制台」→ `serve.py`：本机 8347，静态文件 + `GET /api/health`、`POST /api/t2i`（转交 `t2i-probe/scripts/probe.py`，本文件不发 HTTP、不存凭据）。
- 2026-11-24 21:12–21:20 v0.3 风格页（用户令：风格卡＝风格名 + 色板 + 关键词 + 风格图；图可挂本地，也可走 t2i 生成；一个项目多张卡但只能锁一张）。
  - 数据：`style`（单对象）→ `styles[]` + `styleLockedId`；旧数据自动迁移（单张 style 视为已锁定的那张）。种子给圈 32 补了第二张未生成的备选卡（航站白夜）。
  - 界面：卡头（S 序号 / 名 / 锁定按钮 / 删除）× 图位（点击挂本地、或`走 t2i 生成`）× 色板（每格可点开取色器改色、可删、可加）× 关键词（回车添加，逗号自动拆词）× 硬规则 × 可展开的提示词文本域（留空则按关键词/色板/规则自动拼）。锁定互斥：换锚弹确认，提示「下游全重走」。
  - 通道：实跑一张，任务 `2125217053131628545`，**实扣 11.35**，50.1s，产物 `Workspace/director-editor/_t2i/runs/c32-S1-test-1124-211640/out.png`（白+橙航天舱，空景无文字）。此图已回填种子 S1 作演示。
  - 验证：`node --check` 通过；`_smoke.js` 扩到 32 项全 PASS（风格卡 2 张 / 只 1 张锁定 / 换锚后仍 1 张 / 新建第 3 张 / 回车加词 / 删卡）；`--old` 迁移 4 项仍 PASS；无头截图核过版面。
  - 未做：t2i 结果不回写 `Log/`（只落 `_t2i/`）、无并发保护（连点两次会排两条）、无成本累计（当前只在卡上显示单张实扣）。
- 2026-11-24 21:23–21:31 v0.4 存储磁盘化。用户指令：「当前项目是咋存文件的？每个项目应该需要指定一个本地目录地址，然后所有文件都存到项目目录中」。
  - 改造前：所有项目挤在浏览器 `localStorage["director-editor/v1"]` 一个键里；图片是 `objectURL`，刷新即失效、从不落盘；t2i 产物落工具目录 `_t2i/`，与项目无关联。
  - 改造后：**一个项目 = 一个目录** `Workspace/Projects/<id>/`，`project.json` 是唯一真源，`script.md` 由它单向派生（人读 / git 归档），挂进来的图进 `assets/`，t2i 产物进 `t2i/runs/<runId>/`。浏览器只存 `director-editor/ui`（当前项目 + tab）。
  - 接口：`GET /api/state`（扫目录）、`POST /api/project`（新建）、`PUT /api/project/<id>`（保存，原子替换 project.json + 重写 script.md）、`POST /api/project/<id>/move`（改目录名）、`DELETE /api/project/<id>`（移 `_trash/`，不真删）、`POST /api/project/<id>/asset?slot=&name=`（裸 body 上传图）、`POST /api/t2i`（新增 `projectId`，产物落项目目录）。
  - 静态：`/projects/<rest>` 映射到 `Workspace/Projects/<rest>`，`translate_path` 做 `relative_to` 校验，编码穿越（`%2e%2e`）实测 404。
  - 图片引用统一用**项目内相对路径**（如 `t2i/runs/xxx/out.png`），渲染时拼 `/projects/<id>/<rel>`，改目录名不会断图。
  - 迁移：`_t2i/` 里两张旧产物复制进 `c32/t2i/runs/`，种子 S1 的 `image.url` 改成 `image.file` 相对路径。首次启动磁盘空 → 自动把种子 POST 成真实目录（`c32`、`c31` 各得 `project.json` + `script.md`）。
  - 验证：`node --check` 通过；`_smoke.js` 改为「假服务端 + 假 DOM」，40 项全 PASS（含种子落盘 / 目录 chip / 切 tab 触发 PUT / 改目录后 id 跟着变）；`--old` 旧格式（单张 style + 扁平 anchors）5 项 PASS；真实服务实测上传 1.9MB 图 → `c32/assets/`、静态 200 且字节一致、PUT 回读 project.json 与 script.md 均更新。
  - 未做：项目目录目前只能改 `Workspace/Projects/` 下的名字，不能指到任意盘符（要放开需在 serve.py 加允许根白名单）；`_t2i/` 历史目录未清理（含 probe 的 `experiments.jsonl`）；仍无并发保护与成本累计。
- 2026-11-24 21:31–21:39 v0.5 项目目录可指任意位置。用户指令：「需要可以指定在任何目录」。
  - 关键改动：项目 **id 与目录解耦**。映射存 `Workspace/Projects/_index.json`（`{id: 绝对目录}`），`project.json` 里冗余一个 `dir` 字段给人看。扫项目 = 先读索引（可跨盘），再补扫默认根（手放进 `Workspace/Projects/` 的目录也能被发现）。
  - 图片静态服务改 `/projfile/<id>/<rel>`：按 id 解析到真实目录，所以项目搬到别的盘，图照旧能显示。原来的 `/projects/<rest>` 保留，只映射默认根。
  - 改目录用 `shutil.move`（跨盘复制+删源），目标必须是空目录或不存在；`DELETE` 同理可跨盘移入 `_trash/`。
  - 护栏（只挡危险，不挡正常用）：拒绝盘根（`E:\`）、拒绝系统目录（`C:/Windows`、`Program Files`、`ProgramData`、POSIX 的 `/etc` `/usr` `/bin` 等）、目标目录非空则拒绝（防止污染别人的目录）。**没有**用白名单限制，任意盘、任意深度的空目录都能建项目。
  - 新建项目先弹输入框问目录（可留空 → 默认根）；项目头胶囊显示 `目录 Workspace/Projects/c32/`（仓库内，灰虚线）或 `外部目录 E:\...`（仓库外，橙虚线）。
  - 顺手修的三处：① 浏览器缓存旧 `app.js` 导致图不显示 → 静态响应统一 `Cache-Control: no-store`；② `.py/.pyc/.tmp` 不再可下载（`/serve.py` 由 200 变 404）；③ 排队中的 PUT 在改目录后用旧路径把文件写回原地 → 改目录前 `clearTimeout`。
  - 验证：`_smoke.js` 扩到 **46 项**全 PASS（含「可指到其他盘符的绝对路径」「外部目录在头上有标记」「指到外部后 id 仍稳定」「新建时直接指定外部目录」）；`--old` 6 项 PASS；真机把 `c31` 移到 `E:/CardStudioTest/锈日`、`c32` 移到 `E:/CardStudioTest2/c32-NASApunk-工程师`，静态读图 200 且 1.9MB 字节一致、PUT 写入 E 盘可回读、`projfile` 穿越（`--path-as-is`）404；两点均已移回默认根，测试目录已删。
  - 未做：`_t2i/` 历史目录未清理；仍无并发保护（连点两次 t2i 会排两条）与成本累计；侧栏没有「删除项目」入口（DELETE 接口已就绪）。
- 2026-11-24 21:43–21:50 v0.6 风格卡收折。用户指令（附截图，圈出卡内色板/关键词/硬规则那块）：「风格卡稍微改一下，这一部分默认隐藏，可以展开。t2i 提示词始终展示」。
  - 卡内结构改为三段：**头（序号/名/锁定/删除）→ 图位 + 挂图·生成 → 细节区（可折叠）→ t2i 提示词（常显）**。
  - 细节区 = `<details class="fold">`，把色板 / 关键词 / 硬规则三块包进去，默认收起；收起时 `summary` 一行给出 `▸ 细节　色板 5 · 关键词 7 · 硬规则 4` + 右侧「展开编辑」，不点开也知道里面有什么。展开箭头随 open 旋转 90°。
  - 展开态按 `项目id:风格id` 记在 `localStorage["director-editor/folds"]`（只影响界面，**不写进 project.json**）；`toggle` 事件不冒泡，用捕获监听；重绘（改色/加词/换锚）后仍保持展开。
  - t2i 提示词从 `<details>` 改为常显 `.sec`：标题一行（`自动拼 · 可直接改` / `自定义` + 「恢复自动」按钮）+ 文本域 + 说明。文本域按内容自动长高（整行取整，最多 16 行后滚动），修掉原来 4 行高度把末行裁一半的观感。
  - 顺手修的旧缺陷：`.swatch .block` 是 inline `label`，只写了 `height:54px` 而没 `display:block`，色块塌成一条 1px 竖线（此前的两版截图没放大到这一层，没发现）→ 补 `display:block; width:100%`，五个色块恢复正常。
  - 验证：`node --check` 通过；`_smoke.js` 46 → **54 项**全 PASS（新增：每卡各一个折叠区 / 默认收起 / 收起时色板·关键词·规则仍在 DOM / 提示词不再折叠 / 文本域直接可见 / 展开态写入 localStorage / 重绘后保持展开 / 收起后回到隐藏）；`--old` 6 项 PASS。无头截图核过两种状态：默认态 `_shot-style.png`、展开态 `_shot-style-open.png`。
  - 未做：`_t2i/` 历史目录未清理；仍无 t2i 防连点与项目级成本累计；侧栏无「删除项目」入口（接口已就绪）。
- 2026-11-24 21:54–21:58 v0.7 **整卡折叠**（取代 v0.6 的“只折细节”）。用户指令（附两张截图）：「这样风格卡支持折叠/展开，折叠后只显示上面那个样子，展开就是除了卡片之外还有（第二张）」。
  - 折叠粒度从“卡内细节区”提到**整张卡**：收起 = 卡头 + 风格图；展开 = 卡头 + 风格图 + 挂本地图 / 走 t2i 按钮 + 色板 + 关键词 + 硬规则 + t2i 提示词。与用户两张截图逐块对齐。
  - 具体拆法：`<details class="fold">` 内层折叠删除，改为 `<div class="card-body">` 包住 imgbar 与四个 sec；显隐由 `.style-card.folded .card-body{display:none}` 控制（内容仍在 DOM，切换不重建输入框）。
  - 折叠入口：卡头新增 `.fold-btn`（24×22 小方钮），三角用 CSS border 画、`currentColor` 着色，折叠时 `rotate(-90deg)` 朝右、展开时朝下并转成琥珀色 —— 树控件的常规语义，避免字符 ▸/▾ 在深色底上发虚。
  - 默认**全部收起**（延续上轮“默认隐藏”），展开态按 `项目id:风格id` 存 `localStorage["director-editor/folds"]`，不写 `project.json`；切 tab、改色、加词后重绘仍保持。
  - 取舍：折叠时“挂本地图 / 走 t2i 生成”也一起隐藏（截图 1 的折叠态本来就没有这两个按钮），要出图先展开，与用户给的形态一致。
  - 验证：`node --check` 通过；`_smoke.js` 54 → **56 项**全 PASS（新增：每卡一个折叠钮 / 默认 folded / 折叠时内容仍在 DOM 由 class 控制 / 挂图按钮与提示词同属 body / 三角存在 / 点开变 open / 展开态入 localStorage / 重绘后保持 / 再点收回）；`--old` 6 项 PASS。截图核过两态：`_shot-style.png`（折叠）、`_shot-style-open.png`（S1 展开、S2 折叠）。
  - 未做同前：`_t2i/` 未清理、t2i 无防连点与成本累计、侧栏无删除项目入口。
- 2026-11-24 22:05–22:30 v0.8 锚图卡重做 + 卡内生成条。用户令：「锚图没有锁的概念，锚图与锚图之间都是互相引用的关系……整个卡片布局＝头顶（名称、展开按钮、删除按钮），中间＝图片显示，底部（展开后）＝参考图列表＋提示词编辑框，先出个原型」。
  - 与风格卡的结构性差异被明确：风格卡是「描述型」填充（从无到有堆词），锚图卡是「差分型」（以某张图为底，保什么、改什么）。用户明确不要“锁”，改为**锚与锚、锚与风格卡互引**，且锚也能被「分镜卡」引用（后续）。
  - 卡结构：头（名称可直接改、`×` 删除、三角折叠）→ 主图（点击挂本地）→ `card-body`（参考图列表 + 提示词框）。折叠态图压 4:3（一屏 6 张），展开态回 3:4 全图。
  - 参考图是**活指针不复制图**：`{kind: style|anchor|asset, sid|gid+aid|rel}`，渲染时按 id 现查源；源图删了就显示虚线「源失效」。
  - 图位规则：本卡主图＝图1，参考图从图2 起（`off = a.src ? 2 : 1`），与真实 prompt 里的「图1/图2」严格对应；缩略图角标就是图位号。
  - 提示词自动拼：`以图1（本卡）为底，保持空间关系与光向；<从引用风格卡继承的关键词/色板>。图2（…）作参考。…`；写了自己的一版就标「自定义」并给「恢复自动」。色板/关键词只从风格卡继承，不手写 —— 保证锚不离风格锚。
  - 卡底生成条（两行）：第一行 `[文生图][图生图]` 分段 + 通道下拉（G-2.0 文生图 0 图 / Flux3 图编辑 1–3 图）；第二行 报价 + 图位说明 + 橙色「生成」。模式与通道双向联动。
  - 三处必弹确认：① 选不吃图的通道但卡上有图（含主图，会顶掉当前主图）；② 图片多于通道图位（点名丢哪几张）；③ 参考图源失效被跳过。确认才发任务。
  - 服务端 `_t2i` 改造：加 `CHANNELS` 表（label/script/refs/outputs）、`--image/--image2/--image3` 透传、参考图必须在项目目录内（路径穿越 400）、flux3 零参考图 400、g2 忽略参考图。
  - 事故：**我自己误触发一次真实生成，实扣 32.47**（curl 校验分支时代入了真图 + prompt `t`）。产物 `Projects/c32/t2i/runs/A-1124-222440/`（`out_1.png`/`out_2.png`，任务尾 `2120712706`，191s）。副作用是验证了 i2i 保结构有效（酒坊坛子全保住），但 prompt `t` 硬塞了一顶头发。据此把 Flux3 报价改成「≈20–33 · 按实扣」。**教训：校验接口不能拿真参数打真实通道，要么打未知通道，要么先用假 prompt 且明确知道会扣费。**
  - 另一发现：旧标签页常驻会把 `PUT /api/project/c32` 反复写回，覆盖别处改动 —— 目前仍是乐观写入，无 mtime 冲突检测。
  - 验证：`node --check` 通过；`_smoke.js` 56 → **65 项**全 PASS（生成按钮 / 模式分段 / 通道选择 / 报价行 / 折叠钮 / 模式↔通道联动 / 新锚 id 与名称分离）。
- 2026-11-24 22:32–22:41 v0.9 挂载改系统选图（起点＝项目目录）。用户令：「点击挂载那个打开的目录，默认打开工程所在根目录」。
  - 浏览器 `<input type=file>` 无法指定起始目录，故改为**服务端弹系统选择框**：`POST /api/project/<id>/pickfile {"slot"}` → 起一个 STA 的 `OpenFileDialog`，`InitialDirectory` = 该项目真实目录（可跨盘、可中文路径），选定后**服务端直接拷进 `<项目目录>/assets/`** 并回 `{file, from, bytes, url}`。
  - 中文/盘符安全：脚本本体只含 ASCII，走 `-EncodedCommand`（base64·UTF-16LE）传输；路径、标题、过滤器、回执文件全走环境变量；回执按 UTF-8 无 BOM 写临时文件再读，绕开控制台编码。
  - 回执四种：`OK`＋绝对路径 / `CANCEL` / `ERROR <msg>` / 空（没弹出来）。后两种视为「不可用」→ 前端自动退回原来的浏览器上传，功能不丢。
  - 兜底：`find_shell()` 先 PATH 找 powershell/pwsh，再试 `%SystemRoot%/System32/WindowsPowerShell/v1.0/powershell.exe`。
  - 自检开关 `PICK_FAKE=<路径>`（只跳过弹窗，其余走真实拷贝链路），用于无人值守验证；正常启动不设。
  - 验证：`PICK_FAKE` 模式实测接口 → 拷出 `assets/anchors-site-A2-indoor.png`（2.86MB 字节一致）、`from` 回原绝对路径、项目不存在 404；`_smoke.js` 65 项仍全 PASS；无头截图页面正常。测试产物已删。**真实弹窗未由代理触发**（会弹到用户桌面并挂住请求），留待用户首点确认。
  - 未做：侧栏「打开目录」（资源管理器）入口；t2i 防连点与项目级成本累计。
- 2026-11-24 22:53–23:05 v0.10 图片锁定 / 解锁（定稿区）。用户令：「run 目录下跑出的图没有进 assets 目录……所有卡片都要增加锁定、解锁按钮；已锁定的图要复制到 assets 目录，否则只在卡片里放一个软链接路径；已锁定且图已在 assets 的，点解锁要把图移到 assets\uplock」。
  - 规则落成三条，**状态直接由路径推导、不新增字段**：`assets/` 根＝已锁定（定稿区）；`assets/uplock/`＝未锁定（撤回区）；`t2i/runs/…` 等外部引用＝未锁定（卡里只有路径，不复制）。
  - 锁钉长在图位右上角（`slotPill()`），未锁定写「🔓 图未锁定」，点一下 → `POST /api/project/<id>/lock` 复制进 `assets/<slot>.png`；已锁定写「🔒 图已锁定」，点一下 → `/unlock` 移到 `assets/uplock/<原名>`，重名加 `-2`。
  - 覆盖范围＝所有走 `slot()` 的图位：风格卡风格图、锚图主图、分镜首帧。风格卡卡头原有的「已锁定 / 锁定为风格锚」保持**锚定**语义不动，为免歧义图钉文案带「图」字。
  - 从撤回区取回用 `shutil.move`（不留重复），从 runs 取用 `copy2`（原件不动）；同一 slot 反复锁定按固定名字覆盖，不生成 `-2`。
  - 顺手修：`slot()` 的点击挂载原来不排除 `[data-action]`，点卡内「挂本地图」会连带触发一次空槽选图 → 加 `if (e.target.closest("[data-action]")) return;`。
  - 验证：真机 `c32` 实测 unlock（`assets/indoor-angle.png` → `assets/uplock/indoor-angle.png`，3.88MB 字节一致）、lock 回（从 uplock 移动、uplock 不留副本）、lock 一张 runs 生成图（`styles.S1.img` → `assets/styles-S1-img.png`，1.91MB）、越界 `../../etc/passwd` 400、assets 里不存在 400、静态读 `assets/uplock/` 200。测试产物已清、`project.json` 已回滚到演示态。`_smoke.js` 65 → **74 项**全 PASS（钉子渲染 / 未锁定→锁定→已锁定 / 写入 project.json / 解锁回未锁定 / 两个接口调用），`--old` 6 项 PASS。
  - 未做：`assets/uplock/` 没有清理入口（只增不减）；生成完不自动锁定（手动点）；截断旧 `t2i/runs` 会直接让未锁定卡显示「源失效」。
- 2026-11-24 23:07 目录迁移（用户令「移动到仓库根目录\Tool\director-editor 下，以后在这里开发」）。
  - `Workspace/director-editor/` → `Tool/director-editor/`（整目录 mv，含 `_t2i/` 历史产物与截图；`_shot-profile/` 浏览器垃圾 19MB 也一并带过去，未删）。
  - `serve.py` 的 `REPO = ROOT.parents[1]` 在 `Tool/` 下仍解析到仓库根（Tool/director-editor → Tool → 仓库根），`PROJ_ROOT`、通道脚本路径全部照旧，实测 `probe_exists=True`。
  - 副作用：`Tool/` 不入 `.gitignore`（原先 `Workspace/` 整目录忽略），工具源码从此**可被 git 跟踪**；本次未提交（纪律：只在结轮提交）。
  - 验证：新目录下 `_smoke.js` 74 项 + `--old` 6 项全 PASS；服务从新目录启动，`/api/health.root` 已指向 `Tool/director-editor`，`/`、`/app.js`、`/projfile/c32/...` 均 200。
- 2026-11-24 23:12 本地提交 `99ffdf6`（用户令「提交到本地，但继续循环」）：工具迁入 `Tool/` 后首次入库，9 文件 +3685 行；`.gitignore` 补 4 类运行时垃圾（`_shot-profile/`、`_t2i/`、临时截图、`Projects/`）。
- 2026-11-24 23:15 目录三分（用户令「对 director-edit 目录进行划分，分 doc, script, html 三个子目录」）。
  - `html/`：`index.html` `app.js` `styles.css` `data.js`；`script/`：`serve.py` `_smoke.js`；`doc/`：`README.md`。
  - `serve.py` 路径分层：`SCRIPT = __file__.parent`、`ROOT = SCRIPT.parent`、`WEB = ROOT/"html"`、`REPO = ROOT.parents[1]`（仍指向仓库根）；`SimpleHTTPRequestHandler(directory=WEB)`，`__forbidden__` 也改到 `WEB`；`/api/health` 新增 `web` 字段。静态根变成 `html/` 后 `/serve.py`、`/script/serve.py`、`/doc/README.md` 全 404，源码不暴露。
  - `_smoke.js` 改 `require("../html/data.js")` / `require("../html/app.js")`，必须在 `Tool/director-editor` 下跑。
  - 清掉 `_shot-profile/`（19MB 无头浏览器垃圾）与 4 张过期截图；`_t2i/`（3.9MB 旧产物）暂留待删，23:17 用户令后删除。
  - 验证：`node script/_smoke.js` 74 项 + `--old` 6 项全 PASS；`/api/health` 报 version 0.11、`web` 指向 `html/`；`/`、`/app.js`、`/styles.css`、`/data.js` 200；`/projfile/c32/assets/indoor-angle.png` 200/3.88MB；截图页面正常（顶部 v0.11）。
- 2026-11-24 23:19 截图移出工具目录（用户令「doc 下的 shots 移动到你自己得工作区目录，这些放工具里面干啥」）：`doc/shots/` 6 张 → `Workspace/director-editor/shots/`，工具内只留 `doc/README.md`；规则写进 README —— 截图与无头浏览器临时 profile 一律放 `Workspace/director-editor/`，不再进 `Tool/`。
- 2026-11-24 23:25 工具根加 `README.md`（用户令「只放目录树，并说明三个目录的关系，doc > script > html，不超过 100 字」）：只留目录树 + 一句分层律「doc（稳定性、抽象性）> script > html：越往上越稳、越抽象，依赖只向下」，汉字 34 个。根 README 不参与静态服务（静态根是 `html/`），`/README.md` 404。
- 2026-11-24 23:32 `doc/README.md` 拆成两份设计文档（用户令「拆分出来，目录约定删掉，其他归类到后端设计.md 以及前端设计.md」）：
  - 删掉「目录约定」整节（目录树已上移到工具根 `README.md`，不再重复）；截图位置那句规则并入「与运行无关」的说明，不再占正文。
  - `doc/后端设计.md`（73 行）：启动与路径分层、一项目一目录布局（含 assets/uplock/t2i 三区）、12 条接口表、写盘（前端整份 PUT，服务端无 mtime 比对 → 多标签页覆盖列为已知风险）、护栏（越界/拒盘根/.py 屏蔽/no-store/选图四态）、t2i 通道表与二次校验、冒烟命令。
  - `doc/前端设计.md`（54 行）：布局与快捷键、状态三层（磁盘真源 / localStorage 只存 ui+folds / 内存）、三种卡（风格/锚图/分镜）、图位语义、活指针引用、提示词继承规则、生成条三处确认、锁钉与点击冒泡。
  - 交叉引用同步：`Tool/README.md` 指向两份新文档；`Log` 目录表相应改写。
- 2026-11-25 00:32 数据模型分层定稿，落 `doc/数据模型.md`（当前只含锚图，用户令「只留一个数据模型-锚图」）：
  - 五层框架（用户定）：基础层（图/视频/文本）/ 业务层（剧本/锚图/分镜/短剧）/ 管理层（项目）/ 大模型层（通道 + 参数即抽象提示词）/ 审计层（一致性）。基础层三者相互独立、无出边，只有被别人引用——据此否掉 `Video → Image`，封面改由引用方持有（`Film.coverImageId`）。
  - 业务层关系定为「一条主链 + 一个旁挂池」：剧本 → 分镜是唯一派生（只存 `sceneId`，不复制正文）；锚图 ⇢ 分镜 N—N 消费，锚图是分镜的**并行输入**不是下游；分镜 → 短剧 N—N 有序选片；剧本 ↔ 锚图无结构边，只有 cast 软对应（靠审计层反查）。推论：锚图无 `seq`；短剧是只读视图，故可退化为 `Project.artifacts[]`。
  - `doc/数据模型.md` 只留锚图：6 字段（`id / kind / name / imageId / promptId / refs[]`）、4 条边（→Image、→Text、→Anchor 自引用、`Shot.anchorRefs` 入边）、3 条约定（无顺序 / 弱引用不级联 / 参数不落锚图）。按用户令先后删掉 `projectId` 与 `paramsId`：归属由 `project.json` 决定，参数属于生成动作。
  - 其余四层（含 `Video` 不指向 `Image`、封面归 `Film`）只在对话中定论，未落盘。
