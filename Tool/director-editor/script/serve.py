"""导演编辑台 · 本地控制台（静态文件 + 项目目录 + t2i 通道）

    python serve.py            # 默认 8347
    PORT=8401 python serve.py

项目目录可以指到任意位置（含其他盘符）。映射表存
`Workspace/Projects/_index.json`：{ "<项目id>": "<绝对目录>" }。

    <任意目录>/
        project.json      结构化数据（唯一真源）
        script.md         由 project.json 派生，供人读与 git 归档
        assets/           本地挂进来的图
        t2i/runs/<runId>/ 生成原生产物

静态：
    /                     控制台页面
    /projects/<rest>      映射到 Workspace/Projects/<rest>（默认根，只读）
    /projfile/<id>/<rel>  按项目 id 解析到它真实的目录（支持任意盘符）

接口：
    GET    /api/health                通道自检
    GET    /api/state                 全部项目（每项带 _dir 绝对路径）
    POST   /api/project               新建（body: 项目对象，可带 dir）
    PUT    /api/project/<id>          保存 → 写 project.json + script.md
    POST   /api/project/<id>/move     {"dir": "D:/片子/封坛"} 改目录（可跨盘）
    DELETE /api/project/<id>          移到 <项目根>/_trash/，不真删
    POST   /api/project/<id>/asset?slot=<key>&name=<file>   裸 body 上传图
    POST   /api/project/<id>/pickfile {"slot": "<key>"}       系统选择框（从项目目录开始）选图 → 拷进 assets/
    POST   /api/project/<id>/lock     {"slot","rel"}          锁定：复制进 assets/（源在 uplock/ 时改为移动）
    POST   /api/project/<id>/unlock   {"slot","rel"}          解锁：assets/ 根 → assets/uplock/（撤回区）
    POST   /api/t2i                   {"projectId","channel","prompt","ar","res","name","refs":[]} → 产物落项目目录

出图一律转交 Skill 的 t2i-probe（全库唯一网络出口在 runninghub_app.py），
本文件不发 HTTP、不存凭据。每次生成真扣积分。
"""
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent        # Tool/director-editor/script（本文件所在）
ROOT = SCRIPT.parent                             # Tool/director-editor（应用根）
WEB = ROOT / "html"                              # 静态页面根：index.html / app.js / styles.css / data.js
DOC = ROOT / "doc"                               # 文档与截图，不进静态服务
REPO = ROOT.parents[1]                           # Tool/director-editor -> 仓库根
PROJ_ROOT = REPO / "Workspace" / "Projects"  # 默认根 + 索引/回收站所在地
INDEX = PROJ_ROOT / "_index.json"
TRASH = PROJ_ROOT / "_trash"
PROBE = REPO / "Skill" / "hub" / "generation" / "workflow" / "text-to-image" / "t2i-probe" / "scripts" / "probe.py"
EDIT = REPO / "Skill" / "hub" / "generation" / "workflow" / "image-to-image" / "flux3-edit" / "scripts" / "edit.py"
# 通道表：refs = 最多吃几张参考图；outputs = 产物文件名（按序，第一张即「卡片主图」）
CHANNELS = {
    "g2": {"label": "G-2.0 文生图", "script": PROBE, "refs": 0, "outputs": ["out.png"]},
    "flux3": {"label": "Flux3 图编辑", "script": EDIT, "refs": 3, "outputs": ["out_1.png", "out_2.png"]},
}
PORT = int(os.environ.get("PORT", "8347"))
WEBAPP = "2046794551444119554"  # 全能图片 G-2.0 低价渠道，价 10.7–12/张
ASSET_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".mp4", ".webm", ".mov"}
# 硬护栏：只挡「盘根」和系统目录，其余任意路径都放行
DENY_ROOTS = [Path("C:/Windows"), Path("C:/Program Files"), Path("C:/Program Files (x86)"), Path("C:/ProgramData")]
if os.name != "nt":
    DENY_ROOTS += [Path("/etc"), Path("/usr"), Path("/bin"), Path("/sbin"), Path("/boot"), Path("/System")]


# ---------- 基础 ----------
def safe_id(text: str) -> str:
    s = re.sub(r"[^0-9A-Za-z_-]+", "-", str(text)).strip("-")
    return s[:48] or "p"


def safe_name(text: str) -> str:
    s = re.sub(r'[\\/:*?"<>|\r\n\t]+', "-", str(text)).strip(" .-")
    return s[:60] or "asset"


def is_under(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


# 系统文件选择框：脚本只含 ASCII，路径与标题全走环境变量（中文名 / 任意盘符安全）
PS_PICK = r"""
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$f = New-Object System.Windows.Forms.OpenFileDialog
$f.Title = $env:PICK_TITLE
$f.InitialDirectory = $env:PICK_DIR
$f.Filter = $env:PICK_FILTER
$f.Multiselect = $false
$f.RestoreDirectory = $true
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.Width = 2
$owner.Height = 2
$owner.StartPosition = 'CenterScreen'
$enc = New-Object System.Text.UTF8Encoding $false
try {
    $r = $f.ShowDialog($owner)
    if ($r -eq [System.Windows.Forms.DialogResult]::OK) {
        [System.IO.File]::WriteAllText($env:PICK_OUT, "OK`n" + $f.FileName, $enc)
    } else {
        [System.IO.File]::WriteAllText($env:PICK_OUT, "CANCEL", $enc)
    }
} catch {
    [System.IO.File]::WriteAllText($env:PICK_OUT, "ERROR " + $_.Exception.Message, $enc)
}
$owner.Dispose()
"""

PICK_FILTER = "图片与视频|*.png;*.jpg;*.jpeg;*.webp;*.gif;*.bmp;*.mp4;*.webm;*.mov|全部文件|*.*"


def find_shell():
    """找 Windows 上的 shell 宿主：先 PATH，再系统固定位置。"""
    for name in ("powershell", "powershell.exe", "pwsh", "pwsh.exe"):
        hit = shutil.which(name)
        if hit:
            return hit
    root = os.environ.get("SystemRoot") or "C:/Windows"
    for rel in ("System32/WindowsPowerShell/v1.0/powershell.exe", "System32/WindowsPowerShell/v1.0/pwsh.exe"):
        p = Path(root) / rel
        if p.exists():
            return str(p)
    return None


def native_pick(initial_dir, title, filt):
    """弹系统选择框：返回绝对路径 / ""（取消）/ None（不可用）。

    自检开关：环境变量 PICK_FAKE 设为某个文件路径时跳过弹窗、直接返回它
    （无人值守/冒烟用，正常启动不要设）。
    """
    fake = os.environ.get("PICK_FAKE")
    if fake is not None:
        return fake
    if os.name != "nt":
        return None
    shell = find_shell()
    if not shell:
        return None
    fd, out_name = tempfile.mkstemp(prefix="pick-", suffix=".txt")
    os.close(fd)
    out = Path(out_name)
    env = os.environ.copy()
    env.update({
        "PICK_DIR": str(initial_dir),
        "PICK_TITLE": str(title),
        "PICK_FILTER": str(filt),
        "PICK_OUT": str(out),
    })
    enc = base64.b64encode(PS_PICK.encode("utf-16-le")).decode("ascii")
    print("[console] 弹选择框 起点=%s" % initial_dir, flush=True)
    try:
        proc = subprocess.run(
            [shell, "-STA", "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            env=env, timeout=1800,
        )
        if proc.returncode != 0:
            print("[console] 选择框失败 rc=%s %s" % (proc.returncode, (proc.stderr or "")[-300:]), flush=True)
            return None
        raw = out.read_text(encoding="utf-8").strip()
    except Exception as exc:  # noqa: BLE001
        print("[console] 选择框异常 %s: %s" % (type(exc).__name__, exc), flush=True)
        return None
    finally:
        try:
            out.unlink()
        except OSError:
            pass
    if not raw:
        print("[console] 选择框无回执（未弹窗或被关掉），改用浏览器上传", flush=True)
        return None
    head, _, rest = raw.partition("\n")
    head = head.strip()
    if head == "OK":
        return rest.strip()
    if head == "CANCEL":
        return ""
    print("[console] 选择框异常回执：%s" % raw[:200], flush=True)
    return None


def load_index() -> dict:
    if not INDEX.exists():
        return {}
    try:
        d = json.loads(INDEX.read_text(encoding="utf-8"))
        return {k: v for k, v in d.items() if isinstance(v, str) and v}
    except json.JSONDecodeError:
        return {}


def save_index(idx: dict):
    PROJ_ROOT.mkdir(parents=True, exist_ok=True)
    tmp = INDEX.with_suffix(".tmp")
    tmp.write_text(json.dumps(idx, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(INDEX)


def norm_dir(spec) -> Path:
    """把用户填的目录（绝对 / 相对 / 纯名字）规整成绝对路径，并过护栏。"""
    s = str(spec or "").strip().strip('"').strip("'")
    if not s:
        raise ValueError("目录为空")
    p = Path(os.path.expanduser(s))
    if not p.is_absolute():
        p = PROJ_ROOT / s
    p = Path(os.path.normpath(str(p)))
    if p.parent == p:
        raise ValueError("不能直接指向盘根：%s" % p)
    for bad in DENY_ROOTS:
        if is_under(p, bad):
            raise ValueError("不能写进系统目录：%s" % p)
    return p


def dir_of(pid: str):
    """项目 id → 目录（索引优先，再退默认根）。"""
    pid = safe_id(pid)
    idx = load_index()
    for cand in ([Path(idx[pid])] if pid in idx else []) + [PROJ_ROOT / pid]:
        if (cand / "project.json").exists():
            return cand
    return None


def read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def read_proj(pid: str):
    d = dir_of(pid)
    if not d:
        return None, None
    return read_json(d / "project.json"), d


def rel_dir(p: dict, d: Path) -> str:
    """仓库内 → 相对路径；仓库外 → 空串（前端据此标「外部目录」）。"""
    return str(d.relative_to(REPO)).replace("\\", "/") if is_under(d, REPO) else ""


def render_script_md(p: dict, d: Path) -> str:
    sc = p.get("script") or {}
    beats = sc.get("beats") or []
    lines = [
        "# %s" % p.get("name", "未命名项目"),
        "",
        "> 圈 %s · %s · 更新 %s · 目录 `%s`"
        % (p.get("circle", "-"), p.get("status", "-"), p.get("updated", "-"), rel_dir(p, d) or str(d)),
        "",
        "## 一句话",
        "",
        sc.get("logline") or "（未写）",
        "",
        "## 节拍",
        "",
    ]
    if beats:
        lines += ["| # | 名 | 功能 | 钩子 |", "| --- | --- | --- | --- |"]
        for b in beats:
            lines.append("| %s | %s | %s | %s |" % (b.get("no", ""), b.get("name", ""), b.get("role", ""), b.get("hook", "")))
    else:
        lines.append("（未拆节拍）")
    styles = p.get("styles") or []
    if styles:
        lines += ["", "## 风格卡", ""]
        for s in styles:
            lock = " · **已锁定**" if s.get("id") == p.get("styleLockedId") else ""
            img = (s.get("image") or {}).get("file") or "（无图）"
            lines.append(
                "- `%s` %s%s · 色板 %d 色 · 图 `%s`"
                % (s.get("id", ""), s.get("name", ""), lock, len(s.get("palette") or []), img)
            )
    if sc.get("notes"):
        lines += ["", "## 备注", "", str(sc["notes"])]
    return "\n".join(lines) + "\n"


def write_proj(d: Path, p: dict) -> Path:
    d.mkdir(parents=True, exist_ok=True)
    (d / "assets").mkdir(exist_ok=True)
    (d / "t2i").mkdir(exist_ok=True)
    # 只读字段不回写：_dir/_rel 是给前端的，dir 由服务端按真实路径重写
    p.pop("_dir", None)
    p.pop("_rel", None)
    p["dir"] = str(d)
    tmp = d / "project.json.tmp"
    tmp.write_text(json.dumps(p, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(d / "project.json")  # 原子替换，别写坏
    (d / "script.md").write_text(render_script_md(p, d), encoding="utf-8")
    idx = load_index()
    idx[p["id"]] = str(d)
    save_index(idx)
    return d


def scan_projects():
    idx = load_index()
    out, seen = [], set()
    # 1) 索引里的（可能在任何盘）
    for pid, path in list(idx.items()):
        d = Path(path)
        p = read_json(d / "project.json")
        if p is None:
            continue  # 目录被移走了：保留映射，等下轮或手动 move 修正
        p["id"] = safe_id(p.get("id") or pid)
        p["_dir"] = str(d)
        p["_rel"] = rel_dir(p, d)
        out.append(p)
        seen.add(p["id"])
    # 2) 默认根下没进索引的（手放进去的目录也能被发现）
    if PROJ_ROOT.exists():
        for f in sorted(PROJ_ROOT.glob("*/project.json")):
            if f.parent.name.startswith("_"):
                continue
            p = read_json(f)
            if p is None:
                continue
            p["id"] = safe_id(p.get("id") or f.parent.name)
            if p["id"] in seen:
                continue
            p["_dir"] = str(f.parent)
            p["_rel"] = rel_dir(p, f.parent)
            out.append(p)
            seen.add(p["id"])
    out.sort(key=lambda p: str(p.get("updated") or ""), reverse=True)
    return out


class Handler(SimpleHTTPRequestHandler):
    server_version = "DirectorConsole/0.11"

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(WEB), **kw)

    def log_message(self, fmt, *args):
        sys.stderr.write("[console] %s\n" % (fmt % args))

    def end_headers(self):
        # 本地工具：一律不缓存，改完代码刷新就生效（避免浏览器拿旧的 app.js）
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    # ---------- 静态 ----------
    def translate_path(self, path):
        clean = urllib.parse.unquote(path.split("?")[0].split("#")[0])
        # 源码与中间文件一律不给（服务端逻辑不该被页面拉走）
        if clean.lower().endswith((".py", ".pyc", ".tmp")):
            return str(WEB / "__forbidden__")
        if clean.startswith("/projects/"):
            target = (PROJ_ROOT / clean[len("/projects/"):]).resolve()
            return str(target) if is_under(target, PROJ_ROOT.resolve()) else str(ROOT / "__forbidden__")
        if clean.startswith("/projfile/"):
            rest = clean[len("/projfile/"):]
            pid, _, sub = rest.partition("/")
            d = dir_of(pid)
            if not d or not sub:
                return str(WEB / "__forbidden__")
            target = (d / sub).resolve()
            return str(target) if is_under(target, d.resolve()) else str(ROOT / "__forbidden__")
        return super().translate_path(path)

    # ---------- 工具 ----------
    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b"{}"
        return json.loads(raw.decode("utf-8") or "{}")

    def _parts(self):
        path, _, qs = self.path.partition("?")
        return path.rstrip("/"), urllib.parse.parse_qs(qs)

    # ---------- GET ----------
    def do_GET(self):
        path, _ = self._parts()
        if path == "/api/health":
            return self._json({
                "ok": True,
                "root": str(ROOT),
                "web": str(WEB),
                "proj_root": str(PROJ_ROOT),
                "index": str(INDEX),
                "indexed": len(load_index()),
                "probe_exists": PROBE.exists(),
                "webapp": WEBAPP,
                "version": "0.11",
            })
        if path == "/api/state":
            return self._json({"ok": True, "root": str(PROJ_ROOT), "projects": scan_projects()})
        if path.startswith("/api/project/"):
            pid = safe_id(path.rsplit("/", 1)[-1])
            p, d = read_proj(pid)
            if p is None:
                return self._json({"ok": False, "error": "项目不存在：%s" % pid}, 404)
            p["_dir"] = str(d)
            return self._json({"ok": True, "project": p, "dir": str(d), "rel": rel_dir(p, d)})
        return super().do_GET()

    # ---------- POST ----------
    def do_POST(self):
        path, qs = self._parts()
        try:
            if path == "/api/project":
                body = self._read_json()
                pid = safe_id(body.get("id") or "p%s" % datetime.now().strftime("%y%m%d%H%M%S"))
                if dir_of(pid):
                    return self._json({"ok": False, "error": "项目 id 已存在：%s" % pid}, 409)
                d = norm_dir(body.get("dir")) if body.get("dir") else PROJ_ROOT / pid
                if d.exists() and (d / "project.json").exists():
                    return self._json({"ok": False, "error": "该目录已经有 project.json：%s" % d}, 409)
                if d.exists() and any(d.iterdir()):
                    return self._json({"ok": False, "error": "目标目录非空，换个空目录或新建一个：%s" % d}, 409)
                body["id"] = pid
                write_proj(d, body)
                print("[console] 新建 %s -> %s" % (pid, d), flush=True)
                return self._json({"ok": True, "id": pid, "dir": str(d), "rel": rel_dir(body, d)})
            if path.startswith("/api/project/") and path.endswith("/asset"):
                return self._asset(path.split("/")[3], qs)
            if path.startswith("/api/project/") and path.endswith("/move"):
                return self._move(path.split("/")[3], self._read_json())
            if path.startswith("/api/project/") and path.endswith("/pickfile"):
                return self._pickfile(path.split("/")[3], self._read_json())
            if path.startswith("/api/project/") and path.endswith("/lock"):
                return self._lock(path.split("/")[3], self._read_json())
            if path.startswith("/api/project/") and path.endswith("/unlock"):
                return self._unlock(path.split("/")[3], self._read_json())
            if path == "/api/t2i":
                return self._t2i()
            return self._json({"ok": False, "error": "未知接口"}, 404)
        except ValueError as exc:
            return self._json({"ok": False, "error": str(exc)}, 400)
        except Exception as exc:  # noqa: BLE001
            return self._json({"ok": False, "error": "服务端异常：%s: %s" % (type(exc).__name__, exc)}, 500)

    # ---------- PUT ----------
    def do_PUT(self):
        path, _ = self._parts()
        if not path.startswith("/api/project/"):
            return self._json({"ok": False, "error": "未知接口"}, 404)
        pid = safe_id(path.rsplit("/", 1)[-1])
        try:
            body = self._read_json()
        except Exception as exc:  # noqa: BLE001
            return self._json({"ok": False, "error": "JSON 解析失败：%s" % exc}, 400)
        _, d = read_proj(pid)
        if d is None:
            d = PROJ_ROOT / pid  # 首次写入时落默认根
        body["id"] = pid
        write_proj(d, body)
        return self._json({
            "ok": True, "id": pid, "dir": str(d), "rel": rel_dir(body, d),
            "saved_at": datetime.now().strftime("%H:%M:%S"),
        })

    # ---------- DELETE ----------
    def do_DELETE(self):
        path, _ = self._parts()
        if not path.startswith("/api/project/"):
            return self._json({"ok": False, "error": "未知接口"}, 404)
        pid = safe_id(path.rsplit("/", 1)[-1])
        d = dir_of(pid)
        if d is None:
            return self._json({"ok": False, "error": "项目不存在：%s" % pid}, 404)
        TRASH.mkdir(parents=True, exist_ok=True)
        dst = TRASH / ("%s-%s" % (datetime.now().strftime("%m%d-%H%M%S"), pid))
        shutil.move(str(d), str(dst))  # 跨盘也走得通
        idx = load_index()
        idx.pop(pid, None)
        save_index(idx)
        print("[console] 移入回收站 %s (%s) -> %s" % (pid, d, dst), flush=True)
        return self._json({"ok": True, "trash": str(dst), "from": str(d)})

    # ---------- 图片定稿 / 撤回 ----------
    # assets/ 根 = 定稿区（已锁定）；assets/uplock/ = 撤回区（未锁定）
    def _src_of(self, d, rel):
        q = (d / str(rel or "").replace("\\", "/")).resolve()
        if not is_under(q, d.resolve()) or not q.is_file():
            return None
        return q

    def _lock(self, raw_pid, body):
        pid = safe_id(raw_pid)
        _, d = read_proj(pid)
        if d is None:
            return self._json({"ok": False, "error": "项目不存在：%s" % pid}, 404)
        rel = str(body.get("rel") or "")
        src = self._src_of(d, rel)
        if src is None:
            return self._json({"ok": False, "error": "图片不存在或越界：%s" % rel}, 400)
        ext = src.suffix.lower()
        if ext not in ASSET_EXT:
            return self._json({"ok": False, "error": "不支持的类型：%s" % (ext or "无扩展名")}, 400)
        slot = str(body.get("slot") or "")
        stem = safe_name(slot.replace(".", "-")) if slot else safe_name(src.stem)
        adir = d / "assets"
        adir.mkdir(parents=True, exist_ok=True)
        target = adir / ("%s%s" % (stem, ext))
        if target.resolve() != src.resolve():
            if target.exists():
                # 同一个 slot 反复锁定：以最新一张覆盖，保持一个固定名字
                target.unlink()
            if is_under(src, (adir / "uplock").resolve()):
                shutil.move(str(src), str(target))  # 从撤回区取回：移动，不留重复
            else:
                shutil.copy2(str(src), str(target))  # 生成图 / 别处的图：复制，原件不动
        rel_out = "assets/" + target.name
        print("[console] 锁定 %s/%s <- %s" % (pid, rel_out, rel), flush=True)
        return self._json({
            "ok": True, "file": rel_out, "from": rel, "moved": False,
            "url": "/projfile/%s/%s" % (pid, rel_out), "bytes": target.stat().st_size,
        })

    def _unlock(self, raw_pid, body):
        pid = safe_id(raw_pid)
        _, d = read_proj(pid)
        if d is None:
            return self._json({"ok": False, "error": "项目不存在：%s" % pid}, 404)
        rel = str(body.get("rel") or "").replace("\\", "/")
        if rel.startswith("assets/uplock/"):
            return self._json({"ok": True, "file": rel, "moved": False, "note": "已在撤回区"})
        if not rel.startswith("assets/"):
            return self._json({"ok": True, "file": rel, "moved": False, "note": "本来就是引用，不用移动"})
        src = self._src_of(d, rel)
        if src is None:
            return self._json({"ok": False, "error": "assets 里找不到这张图：%s" % rel}, 400)
        up = d / "assets" / "uplock"
        up.mkdir(parents=True, exist_ok=True)
        target = up / src.name
        i = 1
        while target.exists():
            i += 1
            target = up / ("%s-%d%s" % (src.stem, i, src.suffix))
        shutil.move(str(src), str(target))
        rel_out = "assets/uplock/" + target.name
        print("[console] 解锁 %s：%s -> %s" % (pid, rel, rel_out), flush=True)
        return self._json({
            "ok": True, "file": rel_out, "from": rel, "moved": True,
            "url": "/projfile/%s/%s" % (pid, rel_out), "bytes": target.stat().st_size,
        })

    # ---------- 系统选择框选图（起点 = 本项目目录）----------
    def _pickfile(self, raw_pid, body):
        pid = safe_id(raw_pid)
        _, d = read_proj(pid)
        if d is None:
            return self._json({"ok": False, "error": "项目不存在：%s" % pid}, 404)
        picked = native_pick(d, "选图挂进项目 %s（从项目目录开始）" % pid, PICK_FILTER)
        if picked is None:
            return self._json({"ok": False, "fallback": True, "error": "系统选择框不可用，改走浏览器上传"}, 501)
        if not picked:
            return self._json({"ok": True, "cancelled": True})
        src = Path(picked)
        if not src.is_file():
            return self._json({"ok": False, "error": "不是文件：%s" % picked}, 400)
        ext = src.suffix.lower()
        if ext not in ASSET_EXT:
            return self._json({"ok": False, "error": "不支持的类型：%s" % (ext or "无扩展名")}, 400)
        if src.stat().st_size > 200 * 1024 * 1024:
            return self._json({"ok": False, "error": "文件超过 200MB"}, 413)
        slot = str(body.get("slot") or "")
        stem = safe_name(slot.replace(".", "-")) if slot else safe_name(src.stem)
        adir = d / "assets"
        adir.mkdir(parents=True, exist_ok=True)
        target = adir / ("%s%s" % (stem, ext))
        i = 1
        while target.exists():
            i += 1
            target = adir / ("%s-%d%s" % (stem, i, ext))
        shutil.copy2(str(src), str(target))
        rel = "assets/" + target.name
        print("[console] 选图 %s/%s <- %s" % (pid, rel, src), flush=True)
        return self._json({
            "ok": True, "file": rel, "from": str(src),
            "url": "/projfile/%s/%s" % (pid, rel), "bytes": target.stat().st_size,
        })

    # ---------- 图片上传 ----------
    def _asset(self, raw_pid, qs):
        pid = safe_id(raw_pid)
        _, d = read_proj(pid)
        if d is None:
            return self._json({"ok": False, "error": "项目不存在：%s" % pid}, 404)
        slot = (qs.get("slot") or [""])[0]
        name = safe_name((qs.get("name") or ["asset"])[0])
        ext = Path(name).suffix.lower()
        if ext not in ASSET_EXT:
            return self._json({"ok": False, "error": "不支持的类型：%s" % (ext or "无扩展名")}, 400)
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0:
            return self._json({"ok": False, "error": "空文件"}, 400)
        if n > 200 * 1024 * 1024:
            return self._json({"ok": False, "error": "文件超过 200MB"}, 413)
        stem = safe_name(slot.replace(".", "-")) if slot else safe_name(Path(name).stem)
        adir = d / "assets"
        adir.mkdir(parents=True, exist_ok=True)
        target = adir / ("%s%s" % (stem, ext))
        i = 1
        while target.exists():
            i += 1
            target = adir / ("%s-%d%s" % (stem, i, ext))
        with open(target, "wb") as fh:
            left = n
            while left > 0:
                chunk = self.rfile.read(min(1 << 20, left))
                if not chunk:
                    break
                fh.write(chunk)
                left -= len(chunk)
        rel = "assets/" + target.name
        print("[console] 存图 %s/%s (%d KB)" % (pid, rel, n // 1024), flush=True)
        return self._json({
            "ok": True, "file": rel, "url": "/projfile/%s/%s" % (pid, rel), "bytes": target.stat().st_size,
        })

    # ---------- 改目录 ----------
    def _move(self, raw_pid, body):
        pid = safe_id(raw_pid)
        p, src = read_proj(pid)
        if p is None:
            return self._json({"ok": False, "error": "项目不存在：%s" % pid}, 404)
        dst = norm_dir(body.get("dir") or body.get("to") or "")
        if dst.resolve() == src.resolve():
            return self._json({"ok": True, "id": pid, "dir": str(src), "unchanged": True})
        if dst.exists() and any(dst.iterdir()):
            return self._json({"ok": False, "error": "目标目录非空，换一个：%s" % dst}, 409)
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dst))  # 跨盘也走得通
        p["id"] = pid
        write_proj(dst, p)
        print("[console] 改目录 %s: %s -> %s" % (pid, src, dst), flush=True)
        return self._json({"ok": True, "id": pid, "dir": str(dst), "rel": rel_dir(p, dst), "from": str(src)})

    # ---------- 出图：文生图 / 图生图 ----------
    def _t2i(self):
        try:
            body = self._read_json()
        except Exception as exc:  # noqa: BLE001
            return self._json({"ok": False, "error": "JSON 解析失败：%s" % exc}, 400)

        prompt = (body.get("prompt") or "").strip()
        if not prompt:
            return self._json({"ok": False, "error": "提示词为空"}, 400)

        ch = str(body.get("channel") or "g2").strip()
        spec = CHANNELS.get(ch)
        if spec is None:
            return self._json({"ok": False, "error": "未知通道：%s（可选 %s）" % (ch, "/".join(CHANNELS))}, 400)
        if not spec["script"].exists():
            return self._json({"ok": False, "error": "找不到通道脚本：%s" % spec["script"]}, 500)

        pid = safe_id(body.get("projectId") or "")
        p, d = read_proj(pid) if pid else (None, None)
        if p is None:
            return self._json({"ok": False, "error": "项目不存在：%s（产物要落进项目目录）" % (pid or "空")}, 404)

        # 参考图：只收本项目内的相对路径，按通道上限截断（前端已就「会丢哪几张」确认过）
        refs = []
        for rel in (body.get("refs") or [])[: spec["refs"]]:
            q = (d / str(rel)).resolve()
            if not is_under(q, d.resolve()) or not q.exists():
                return self._json({"ok": False, "error": "参考图不存在或越界：%s" % rel}, 400)
            refs.append(q)
        if ch == "flux3" and not refs:
            return self._json({"ok": False, "error": "图生图至少要 1 张参考图（图1 必填）"}, 400)
        if ch == "g2":
            refs = []  # 该通道不吃参考图（前端确认后仍照跑，按纯文生图出）

        ar = body.get("ar") or "3:4"
        res = body.get("res") or "1k"
        out = d / "t2i"
        base = safe_id(body.get("name") or "A")
        run_id = "%s-%s" % (base, datetime.now().strftime("%m%d-%H%M%S"))
        n = 1
        while (out / "runs" / run_id).exists():
            n += 1
            run_id = "%s-%s-%d" % (base, datetime.now().strftime("%m%d-%H%M%S"), n)

        note = "网页控制台 v0.6 锚图卡 · 项目 %s · %s · 参考图 %d" % (pid, spec["label"], len(refs))
        cmd = [
            sys.executable, str(spec["script"]),
            "--id", run_id, "--group", "editor",
            "--prompt", prompt, "--ar", ar,
            "--out", str(out), "--note", note,
        ]
        if ch == "g2":
            cmd += ["--res", res]
        else:
            cmd += ["--image", str(refs[0])]
            if len(refs) > 1:
                cmd += ["--image2", str(refs[1])]
            if len(refs) > 2:
                cmd += ["--image3", str(refs[2])]

        env = os.environ.copy()
        env["PYTHONUTF8"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"

        t0 = time.time()
        print("[console] 提交 %s | %s | %s | %s | 参考图 %d | %d 字" % (pid, run_id, spec["label"], ar, len(refs), len(prompt)), flush=True)
        try:
            proc = subprocess.run(
                cmd, capture_output=True, text=True,
                encoding="utf-8", errors="replace", env=env, timeout=1200,
            )
        except subprocess.TimeoutExpired:
            return self._json({"ok": False, "error": "生成超时（1200s）", "id": run_id}, 504)

        rec = read_json(out / "runs" / run_id / "run.json") or {}
        files = []
        for name in spec["outputs"]:
            f = out / "runs" / run_id / name
            if f.exists():
                files.append("t2i/runs/%s/%s" % (run_id, name))
        ok = proc.returncode == 0 and rec.get("status") == "ok" and bool(files)
        tail = (rec.get("error") or proc.stderr or proc.stdout or "")[-1200:]
        payload = {
            "ok": ok,
            "id": run_id,
            "channel": ch,
            "taskId": rec.get("task_id"),
            "charged": rec.get("charged"),
            "file": files[0] if ok else None,
            "files": files if ok else [],
            "url": "/projfile/%s/%s" % (pid, files[0]) if ok else None,
            "wall": round(time.time() - t0, 1),
            "error": None if ok else (tail.strip() or "未知错误"),
        }
        print("[console] %s %s task=%s charged=%s files=%d %ss" % ("OK" if ok else "FAIL", run_id, payload["taskId"], payload["charged"], len(files), payload["wall"]), flush=True)
        return self._json(payload, 200 if ok else 502)


def main():
    PROJ_ROOT.mkdir(parents=True, exist_ok=True)
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("导演编辑台 v0.11 → http://localhost:%d/" % PORT)
    print("项目根：%s（%d 个，索引 %d 条）" % (PROJ_ROOT, len(scan_projects()), len(load_index())))
    print("项目目录：可指到任意位置（盘根与系统目录已挡）")
    print("通道：%s（%s）" % (WEBAPP, "已找到 probe.py" if PROBE.exists() else "缺 probe.py"))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
