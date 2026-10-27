# Git/Git.md — git 出网避坑与 `gitnet.mjs` 使用说明

> 一句话：本机 git 出网**时通时不通**，直接 `git clone/pull` 会卡 **21–56s** 才报错。
> 一律改用 `node Tool/Git/gitnet.mjs <clone|pull|…>`：端点学习 + 无进展看门狗 + 硬超时，最坏几十秒内换个端点再试。
>
> - 脚本：`Tool/Git/gitnet.mjs`
> - 学习状态：`Workspace/cache/gitnet/state.json`（临时区，可随时删；删了重新学）
> - 铁律：**只操作本地仓库；push 只在人明确要求时用**（见 §7）。

---

## 1. 什么时候该进这个目录

出现以下任一现象，别再手工 `git pull` 干等：

- `git clone https://github.com/...` 打印 `Cloning into '.'...` 后长时间无输出，最后
  `fatal: unable to access '...': OpenSSL SSL_read: Connection was aborted, errno 10053`
- `git pull` 卡住，最后 `Failed to connect to github.com port 443 after 21026 ms: Timed out`
- 反向症状：同一个 `git ls-remote` 偶尔**秒回**（网络在抖动，不是永久封锁）

## 2. 根因：三层探针，前两层都会骗你

| 层 | 探针 | 本机实测（2026-10-27） | 能当判据吗 |
| --- | --- | --- | --- |
| TCP 443 | `net.connect` | `github.com` 145ms **通**，另一次 2.5s **超时**（两种都出现过） | ❌ 假阳性/假阴性都有 |
| HTTP GET | `fetch https://host/` | `github.com`、`ghproxy.net` 根路径 6s 超时；`codeload.github.com` 912ms / 301 | ❌ 与 git 可用性不同步 |
| git 协议 | `git ls-remote` | `direct` 21–56s 失败 与 1.2s 成功交替；`ghproxy` 26–34s 成功 | ✅ 唯一可信，但**很慢** |

结论：**没有一个便宜又准的预探测**。
所以 `gitnet.mjs` 的策略不是"先探测、坏的跳过"，而是：

> **起手就试 → 卡住就杀 → 换端点 → 记住谁行**。

## 3. 实测记录（同一台机、同一网络，2026-10-27 20:50–21:05）

| 动作 | 端点 | 结果 | 用时 |
| --- | --- | --- | --- |
| `clone` 本仓库（29.5MB / 629 objects） | 直连 `github.com` | ❌ `errno 10053`（连试 2 次都失败） | 约 2s 就断 |
| `clone` 同上 | `ghproxy.net` | ✅ 成功 | 约 130s（≈232KB/s） |
| `fetch`（仓库已在） | 直连 | ❌ `Failed to connect ... after 21026 ms` | **21.3s** |
| `ls-remote` | 直连 | ❌ `curl 28 ... errno 10053` | **56.1s** |
| `ls-remote` | `ghproxy.net` | ✅ | 25.9s / 29.9s / 34.3s |
| `fetch` | `ghproxy.net` | ✅ | 44.7s |
| `fetch` | `ghproxy.net` | ❌ `RPC failed: 502` | 17.3s |
| `fetch` | 直连（抖动到好的一侧） | ✅ | **1.2s** |
| `pull --check`（脚本托管，自动切换） | 直连失败 → 镜像成功 | ✅ 结论正确 | **66s** |
| `pull --check`（脚本托管，自动切换） | 镜像 502 → 直连成功 | ✅ 结论正确 | **18.8s** |

两个直接推论：

1. **56s 就是"长时间失败"的来源**——libcurl 在 TCP 已建连、协议层被掐的情况下会一直等。
2. 端点好坏**会漂**（直连 21s 失败与 1.2s 成功相隔几分钟），所以脚本做的是"短退避"，不是"永久拉黑"。

## 4. 命令速查

```powershell
# 看端点现在到底行不行（--deep 才真发 git 请求；不加只是 TCP 层，仅供参考）
node Tool\Git\gitnet.mjs probe --deep

# 克隆（失败自动换端点；成功后 origin 自动改回规范地址，镜像不污染配置）
node Tool\Git\gitnet.mjs clone WarriorMFY/VideoFactoryByIdea

# 拉取（fetch + 只做快进合并；分叉就停手，返回码 3）
node Tool\Git\gitnet.mjs pull
node Tool\Git\gitnet.mjs pull --check          # 只看落后/领先几个提交，不动本地

# 端点学习结果（谁连败、谁最近成功）
node Tool\Git\gitnet.mjs state
node Tool\Git\gitnet.mjs state --reset         # 清空重学

# 推送（只在人明确要求时）
node Tool\Git\gitnet.mjs push --dry-run
node Tool\Git\gitnet.mjs push

# 任何 git 命令都套上硬超时
node Tool\Git\gitnet.mjs run -- -C . log --oneline -5
```

## 5. 参数

| 参数 | 作用 | 默认 |
| --- | --- | --- |
| `--endpoint <id>` | 只用某个端点（`direct` / `ghproxy` / `mirror:host`） | 按学习结果排序 |
| `--mirror <https://前缀/>` | 追加自定义镜像端点（可重复） | 内置 `direct`、`ghproxy` |
| `--timeout <秒>` | **单端点**硬超时 | clone 900s / fetch 300s / push 120s / ls-remote 90s |
| `--stall <秒>` | 「无进展」判定；连续这么久没有新输出就杀 | 45s（`run` 默认关闭） |
| `--repo <owner/repo>` | 覆盖远端地址 | 取 `origin` |
| `--check` | `pull` 只看差距不合入 | 关 |
| `--dry-run` | `push` 不真推 | 关 |

退出码：`0` 成功 · `1` 全部端点失败 · `2` 用法/环境问题 · `3` 本地已分叉需人工处理。

## 6. 它凭什么「不再长时间失败」

| 机制 | 细节 |
| --- | --- |
| **端点学习** | 每次成功/失败写 `state.json`；连败 ≥2 次的端点退避 5/10/20/40/60 分钟（封顶 1h）；成功过的、刚成功的排前面 |
| **无进展看门狗** | git 的 `--progress` 输出重定向到文件，1s 轮询文件大小；连续 `--stall` 秒不增长 → 判定卡死 |
| **硬超时** | 每个端点每次尝试都有上限，且会 `child.kill('SIGKILL')`（实测 3ms 生效）|
| **不挂起等凭据** | `GIT_TERMINAL_PROMPT=0` + `GCM_INTERACTIVE=never`：没凭据就失败，不会停在 password 提示上 |
| **不误杀慢镜像** | `http.lowSpeedLimit=1024` + `http.lowSpeedTime=90`。**别调回 20s**：镜像首字节可慢到 34s，20s 会把能用的镜像误杀（实测在 22.5s 把自己人杀了） |
| **不用管道 stdio** | 全部 fd 重定向到文件（本沙箱 `spawnSync` 默认 pipe 会 `EPERM`，见 `Tool/env.md` §二）|

## 7. 端点坏了怎么办

```powershell
node Tool\Git\gitnet.mjs probe --deep                     # 先确认是哪一端不行
node Tool\Git\gitnet.mjs pull --endpoint ghproxy           # 指定端点
node Tool\Git\gitnet.mjs pull --mirror https://别的镜像/    # 换镜像
node Tool\Git\gitnet.mjs state --reset                     # 学习结果过期了
```

本机实测：`ghproxy.net` 可用（唯一）；`github.moeyy.xyz`、`hub.gitmirror.com` TCP 443 直接不通。

## 8. 推送（只在人明确要求时）

```powershell
node Tool\Git\gitnet.mjs push --helper wincred             # 本沙箱必须带 --helper
node Tool\Git\gitnet.mjs push --helper wincred --dry-run   # 只看会不会成功
```

三步链路，每一步都是踩出来的，缺一步就失败：

| # | 坑（原始报错） | 做法 |
| --- | --- | --- |
| 1 | `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS` | 脚本自动补 `-c http.sslBackend=openssl` |
| 2 | `fatal: could not read Username for 'https://github.com': terminal prompts disabled`——git 调 helper 时**经 `sh.exe`**，沙箱禁止创建管道：`sh.exe: *** fatal error - couldn't create signal pipe, Win32 error 5`；注意 `-c credential.helper=wincred` 也一样死（仍然经 `sh.exe`） | 脚本**直接执行** `git-credential-wincred.exe get`，stdin/stdout 全用文件重定向 → 拿到 username + 40 位 PAT |
| 3 | 口令不能进命令行、不能落盘 | 拼成 `Authorization: Basic …`，通过 `GIT_CONFIG_COUNT` / `GIT_CONFIG_KEY_0` / `GIT_CONFIG_VALUE_0` **环境变量**注入 `http.extraheader`；脚本只打印 `password=<40 字符>` |

推送后复核（脚本自动做，也可手跑）：

```powershell
git rev-parse HEAD; git rev-parse refs/remotes/origin/main   # 两者必须相等
git status -sb                                               # main...origin/main，无 [ahead]
```

两个容易误判的点：

- **为什么不走镜像**：公共镜像无法代我们鉴权，所以 `push` 默认只打规范地址 `direct`（`--mirror` 时才试）。
- **为什么 `status` 会假显示 `[ahead N]`**：脚本按 URL 推送（`git push <url> HEAD:main`），git 不会自动前进
  `refs/remotes/origin/main` → 脚本推送成功后自己 `update-ref` 对齐，否则看起来像没推上去。

凭据位置：Windows 凭据管理器 `LegacyGeneric:target=git:https://github.com`（user `WarriorMFY`，40 位 PAT）。
脚本**不写任何 git 配置、不落盘明文、不打印口令**；helper 路径按 `git --exec-path` 自动发现。

## 9. 验收（改过脚本就跑这四条）

```powershell
node Tool\Git\gitnet.mjs state                                  # ① 状态可读
node Tool\Git\gitnet.mjs pull --check                           # ② 最坏 2×45s 内必给结论
node Tool\Git\gitnet.mjs run --stall 4 -- ls-remote https://10.255.255.1/foo.git
                                                                # ③ 应 4s 内 FAIL 且标「无进展，已杀进程树」
node Tool\Git\gitnet.mjs clone octocat/Hello-World Workspace\cache\_t
                                                                # ④ 能克隆；origin 必须是 https://github.com/... 而非镜像
```

③ 的判据来自 `History/probe/gitnet_killtest.log`：`taskkill /T /F` 在本沙箱**退出码 1（被拒）**，
`child.kill('SIGKILL')` 3ms 生效 —— 所以脚本事先 `kill('SIGKILL')`，`taskkill` 只作尽力而为。

## 10. 已知限制（别拿它当万能）

- **孤儿进程**：被杀的主 `git` 会留下 `git-remote-https` 子进程，沙箱禁 `taskkill` 无法整树清；
  实测约 **21s** 后自行退出，期间 `Get-Process git` 会看到残留（不影响正确性）。
- **两端同时坏**：脚本会如实报错，不会无限重试（一次尝试最多 45s，两次就是 90s 上限）。
- **分叉不自动处理**：`pull` 遇到本地有提交且落后时返回 3，让人自己决定 merge / rebase。
- **绝不自动推送**：这是项目规则，不是脚本缺功能。
- 镜像属于第三方转发，仓库完整性与安全性由镜像方保证；克隆后用 `origin`（规范地址）核对 `HEAD` 与预期一致。
