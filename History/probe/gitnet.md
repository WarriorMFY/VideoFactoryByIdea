# History/probe/gitnet.md — git 出网实测记录（2026-10-27 20:50–21:10）

> 触发：用户要求"下载仓库到本地目录"，`git clone https://github.com/...` 连续两次
> `OpenSSL SSL_read: Connection was aborted, errno 10053`；随后要求"在 Tool 里新建 Git 目录，
> 说明这次避坑并新建脚本，避免以后长时间 pull 失败"。
>
> 产物：`Tool/Git/gitnet.mjs`（脚本）+ `Tool/Git/Git.md`（说明）。
> 本文件只记录**实测过程与原始结论**，使用说明不在这里重复。

## 一、现象与分层排查

| # | 探针 | 命令 | 结果 |
| --- | --- | --- | --- |
| 1 | DNS | `Resolve-DnsName github.com` | 正常解析 `20.205.243.166` |
| 2 | TCP | PowerShell `TcpClient` → `github.com:443` | ❌ 4s 无响应 |
| 3 | TCP | 同上 → `codeload.github.com` / `raw.githubusercontent.com` / `ghproxy.net` / `gitee.com` | ✅ 107 / 175 / 257 / 336ms |
| 4 | TCP | Node `net.connect` → `github.com:443` | ✅ 145ms（**与 2 相反**；网络在漂） |
| 5 | HTTP | Node `fetch https://github.com/` | ❌ `TimeoutError` 6002ms |
| 6 | HTTP | Node `fetch https://ghproxy.net/` | ❌ `TimeoutError` 6002ms（但 git 走它却能用） |
| 7 | HTTP | Node `fetch https://codeload.github.com/` | ✅ 301，912ms |
| 8 | git | `git clone` 直连本仓库 | ❌ `errno 10053`（2 次，均在 ~2s 内断） |
| 9 | git | `git clone` 经 `ghproxy.net` | ✅ 629 objects / 29.5MB / ≈130s（232KB/s） |
| 10 | git | `git fetch` 直连 | ❌ `Failed to connect ... after 21026 ms` → **21.3s** |
| 11 | git | `git ls-remote` 直连 | ❌ `curl 28 ... errno 10053` → **56.1s** |
| 12 | git | `git ls-remote` 经 ghproxy（3 次） | ✅ 34.3s / 25.9s / 29.9s |
| 13 | git | `git fetch` 经 ghproxy | ✅ 44.7s |
| 14 | git | `git fetch` 经 ghproxy | ❌ `RPC failed: 502` → 17.3s |
| 15 | git | `git fetch` 直连（网络恰好好的时刻） | ✅ **1.2s** |

**结论**：TCP 层与 HTTP 层探针都会给出与 git 实际可用性相反的结果（#4/#5/#6 都是假信号）。
**唯一可信的是 `git ls-remote`，但它本身要 26–34s**（镜像）或 21–56s（直连失败）。
→ 所以脚本不能"先探测再决定"，只能"起手就试、卡住就杀、换端点、记住结果"。

## 二、自己踩的坑：把能用的镜像误杀

第一版给 git 加了 `http.lowSpeedLimit=2048` + `http.lowSpeedTime=20`。
镜像首字节要 26–34s，于是脚本在 22.5s 把自己判死：
`Operation too slow. Less than 2048 bytes/sec transferred the last 20 ...`。

修正：`lowSpeedLimit=1024` + `lowSpeedTime=90`（把"卡死判定"交给看门狗，lowSpeed 只当第二道网）。
**这条不要回退**，回退就会重新误杀镜像。

## 三、杀进程：taskkill 被拒，child.kill 才有效

`History/probe/gitnet_killtest.mjs` → `gitnet_killtest.log`（原始输出）：

```
  taskkill exit=1
taskkill /T /F: exit code=128 signal=null 存活 21169ms（kill 请求后 18148ms 落地）
  child.kill 返回 true
child.kill(SIGKILL): exit code=null signal=SIGKILL 存活 3017ms（kill 请求后 3ms 落地）
```

- `taskkill /PID <pid> /T /F` 在本沙箱**退出码 1（被拒）** → 不能作为主手段。
- `child.kill('SIGKILL')` **3ms 生效** → 看门狗用这个。
- 代价：孙子进程 `git-remote-https` 无法整树清掉，实测残留 **约 21s** 后自行退出
  （`Get-Process git` 在 8s 时仍见 3 个，28s 时为 0）。

## 四、脚本托管后的端到端实测

| 场景 | 端点顺序 | 过程 | 总耗时 |
| --- | --- | --- | --- |
| `pull --check`（首轮，直连在前） | direct → ghproxy | direct 21.2s 失败 → ghproxy 44.7s 成功 | **66s** |
| `pull --check`（第二轮） | ghproxy → direct | ghproxy 502 17.3s → direct **1.2s** 成功 | **18.8s** |
| `pull --check`（第三轮） | direct → ghproxy | direct 41.0s `expected flush after ref listing` → ghproxy 37.0s 成功 | **78s** |
| `pull --check`（第四轮） | ghproxy → direct | ghproxy 37.7s 成功 | **38s** |
| `clone octocat/Hello-World` | direct | 1.7s 成功，origin 已改回 `https://github.com/...` | **1.9s** |
| `clone octocat/Hello-World` | ghproxy | 46.3s 成功 | **46.5s** |
| `run --stall 4 -- ls-remote 10.255.255.1`（黑洞） | — | 4.0s 判定「无进展，已杀进程树」 | **4.0s** |

对比未托管时的 21–56s 单次失败：托管后**任何一次操作的上界是「端点数 × 45s」**，
且第二轮起会优先走上次成功的端点（上表 38s / 18.8s 两行）。

## 五、留痕文件清单

- `History/probe/gitnet.md`（本文件）— 实测记录
- `History/probe/gitnet_killtest.mjs` / `.log` — 杀进程机制验证
- `History/probe/gitnet_acceptance.log` — 脚本四条验收的复跑输出
- `Workspace/cache/gitnet/state.json` — 端点学习状态（临时区，可删）
