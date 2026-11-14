# Tool — 长期复用的工具

按 `AGENTS.md`，`Tool/` 对 LLM 只读；本次按用户指令创建，之后改动需用户发话。
所有脚本都从仓库根解析路径，可在任意目录调用。

| 工具 | 用途 | 命令 |
| --- | --- | --- |
| `smoke_test.py` | 一键无费用冒烟：Prompt 一致性 → L3/L4 送验链路(stub) → 抽帧 → 校验器 | `python Tool/smoke_test.py` |
| `smoke_test.py --online` | 额外查账号余额与 L3/L4 通道节点（只读、需网络） | `python Tool/smoke_test.py --online` |
| `stub_runner.py` | `run_l3/l4.py` 的零成本替身，验证参数构造与节点覆盖，不烧积分 | 经 `--runner Tool/stub_runner.py` 调用 |
| `account.py` | 账户原始字段查询，以 `remainPoint` 为可用积分 | `python Tool/account.py` |
| `setup_deps.py` | 重建 `_deps`（cv2 / Pillow / numpy） | `python Tool/setup_deps.py` |

`_deps/` 是本机依赖缓存，**不入库**（见 `.gitignore`），换机器跑一次 `setup_deps.py` 即可。
`smoke_test.py` 会自动把 `_deps` 注入 `PYTHONPATH`，无需手工设置。

两个已知事实，冒烟时不算失败：

- `validate.ps1` 当前报 35 项 FAIL，全是「卡内附加章节 / 主表数量」，属 Circle2 已记录的历史欠债；冒烟只判它能否执行。
- `runninghub_app.py --check` 以 `remainMoney` 判余额，会误报 `no_balance`；真实额度看 `account.py` 的 `remainPoint`。`--run` 不调用 `--check`，不受影响。
