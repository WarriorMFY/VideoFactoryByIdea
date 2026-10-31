# ops/bili — 自动发布与反馈跟踪（阶段 A → B → C）

> 需求变更（2026-10-31）：用户要求「给账户使用权，自动发布 + 自动跟踪反馈」。
> 本目录为此新增 4 个脚本。**默认全部是只读/预检**，真正写操作要显式 `--confirm-upload`。

## 为什么不能"直接能发"

B 站没有面向个人的公开投稿 API（`open.bilibili.com` 需要企业/开发者资质）。网页端投稿是三步协议
（init 拿上传地址与凭据 → 分片上传视频 → add 提交稿件），接口随改版变化，且带风控。本沙箱实测：

| 探测项 | 结果 | 含义 |
| --- | --- | --- |
| `api.bilibili.com/x/web-interface/nav` | 200 `code=-101` | 接口可达，只缺登录态 |
| `member.bilibili.com`（创作中心/投稿页） | 200 返回 HTML | 域名可达 |
| `member.bilibili.com/x/web/archives`（稿件列表） | 200 `code=-101` | **端点存在**，需要 Cookie |
| `member.bilibili.com/x/vu/web/add`（投稿） | 405（GET） | **存在，只接受 POST** |
| `api.bilibili.com/x/space/wbi/arc/search`（无签名） | 412 | **必须 WBI 签名** |
| 公开数据（视频详情 / UP 主统计） | 200 `code=0` | 只读部分不需要登录 |

## 四个脚本

| 脚本 | 阶段 | 作用 | 写操作 |
| --- | --- | --- | --- |
| `bili_auth.mjs` | A | 登录态 / WBI keys / 稿件列表可达性自检；`--template` 生成凭据模板 | 无 |
| `bili_stats.mjs` | A | 拉自己稿件列表 + 每条真实数据 → 自动写 `feedback.csv` + 原始快照 | 只写本地 CSV |
| `bili_upload.mjs` | B/C | 投稿：**默认 preflight 预检**；`--probe` 只读探测协议；`--confirm-upload` 才真发 | 有（需显式开关） |
| `bili.mjs`（在 `Tool/lib/`） | 公共层 | Cookie 装载、请求包装、**WBI 签名**、风控识别 | 无 |

## 凭据怎么给（不要把 Cookie 贴在聊天里）

```powershell
node Tool\ops\bili_auth.mjs --template      # 生成 Workspace\secrets\bili.cookie.json
```

然后编辑该文件（**Workspace/ 已在 .gitignore 内，不会入库**）：

```json
{ "SESSDATA": "...", "bili_jct": "...", "DedeUserID": "123456789" }
```

取值位置：浏览器登录 B 站 → F12 → Application/Storage → Cookies → `https://www.bilibili.com`。
`SESSDATA` 是登录态、`bili_jct` 是 csrf（投稿接口要带）、`DedeUserID` 是你的 mid。

**用完可立刻让我删除该文件**；也可在 B 站「退出登录」让 Cookie 立即失效。

## 三段推进（不可逆风险逐级放大）

| 阶段 | 动作 | 风险 | 回滚 |
| --- | --- | --- | --- |
| **A** 只读 | `bili_auth` → `bili_stats`：拉真实数据、自动填反馈表 | 低 | 是 |
| **B** 定时投 | `bili_upload --confirm-upload --dtime "YYYY-MM-DD HH:MM"`：**定时发布**（不立即公开） | 中 | 可删稿 |
| **C** 公开 | 到点自动公开，或改成立即公开 | 高（对外） | 手动删稿 |

## 红线（脚本内强制，不是口头承诺）

- **不做验证码/风控绕过**：遇到非 JSON 响应或 `-352/-412/-509` → 退出码 3，停下报告；
- **不打印凭据**、不把凭据写进仓库；
- 没有 `--confirm-upload` **绝不上传**；没有 `--public` 时**必须**给 `--dtime`（拒绝"手滑直接公开"）；
- 投稿协议在实测钉下来之前，`--confirm-upload` 会**明确报"未实现"并退出 4**，不会假装成功。

## 当前状态（诚实）

- ✅ 阶段 A 的代码已就绪（凭据一到即可跑）
- ⏳ 等用户填入 Cookie → 我先跑 `--probe` 把 init/上传端点形状钉住
- ⏳ 之后实现 init → 分片上传 → add，并用**定时发布**先发一条（可删稿）
- ❌ 完播率/平均播放时长属创作中心数据面板，接口不稳；拿不到就留空，**不估算**
