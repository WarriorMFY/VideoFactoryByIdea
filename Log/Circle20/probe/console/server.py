"""i2v-probe 工作台本地服务：分段、选锚、跑一条、出对照。

    python Log/Circle20/probe/console/server.py [--port 8765]

只在 127.0.0.1 监听；下载/切段/提交都在本机做，浏览器只负责显示。
"""
import argparse
import json
import mimetypes
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]              # .../CardStudio
CONSOLE = Path(__file__).resolve().parent
PROBE = CONSOLE.parent                                  # Log/Circle20/probe
SRC = PROBE / "src"
RUNS = PROBE / "runs"
CMP = PROBE / "cmp"
NOTES = PROBE / "notes.json"          # 人工批注：{ key: {"text":…, "updated":…} }，key = task_id 或 id@ts
SKILL = ROOT / "Skill" / "hub" / "generation" / "i2v-probe" / "scripts"
PROBE_PY = SKILL / "probe.py"
MEASURE_PY = SKILL / "measure.py"
RETIME_PY = SKILL / "retime.py"
SEGMENT_PY = CONSOLE / "segment.py"
FFMPEG = ROOT / "Tool" / "ffmpeg.py"

JOBS = {}
LOCK = threading.Lock()
sys.stdout.reconfigure(encoding="utf-8")


def jload(p, default=None):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def vid_of(path: Path) -> str:
    import hashlib
    st = path.stat()
    key = f"{path.resolve()}|{st.st_size}|{int(st.st_mtime)}"
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:8]


def job_new(kind: str) -> str:
    jid = f"{kind}-{int(time.time() * 1000) % 1000000}"
    with LOCK:
        JOBS[jid] = {"id": jid, "kind": kind, "status": "running", "log": [], "result": None}
    return jid


def job_log(jid: str, line: str):
    with LOCK:
        JOBS[jid]["log"].append(line.rstrip())
        JOBS[jid]["log"] = JOBS[jid]["log"][-80:]
    print(f"[{jid}] {line.rstrip()}", flush=True)


def job_done(jid: str, result=None, error=None):
    with LOCK:
        JOBS[jid]["status"] = "error" if error else "done"
        JOBS[jid]["result"] = result
        if error:
            JOBS[jid]["log"].append("ERROR " + str(error)[:400])


def run_cmd(cmd, jid, cwd=None):
    """跑子进程并把输出逐行塞进 job log。"""
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         text=True, encoding="utf-8", errors="replace", cwd=cwd, bufsize=1)
    for line in p.stdout:
        job_log(jid, line)
    return p.wait()


# ---------------------------------------------------------------- ingest
def work_ingest(jid: str, path: Path, secs: float):
    try:
        if not path.exists():
            raise SystemExit(f"文件不存在：{path}")
        vid = vid_of(path)
        outdir = SRC / vid
        outdir.mkdir(parents=True, exist_ok=True)
        dst = outdir / "src.mp4"
        if not dst.exists() or dst.stat().st_size != path.stat().st_size:
            job_log(jid, f"收下 {path.name} → src/{vid}/src.mp4")
            if path.stat().st_size > 8 * 1024 * 1024 or path.suffix.lower() != ".mp4":
                code = run_cmd([sys.executable, str(FFMPEG), "-y", "-t", str(secs),
                                "-i", str(path), "-c", "copy", str(dst)], jid)
                if code != 0 or not dst.exists():
                    run_cmd([sys.executable, str(FFMPEG), "-y", "-t", str(secs),
                             "-i", str(path), "-c:v", "libx264", "-crf", "20",
                             "-c:a", "aac", str(dst)], jid)
            else:
                shutil.copy2(path, dst)
        meta = jload(outdir / "segments.json")
        if not meta:
            code = run_cmd([sys.executable, str(SEGMENT_PY), str(dst),
                            "--outdir", str(outdir), "--secs", str(secs)], jid)
            if code != 0:
                raise SystemExit("分段失败，见上面输出")
            meta = jload(outdir / "segments.json")
        job_done(jid, {"vid": vid, **meta})
    except Exception as e:                                  # noqa: BLE001
        job_done(jid, error=e)


# ---------------------------------------------------------------- run
def retime_gen(gen: Path, target: float, run_dir: Path, jid: str) -> Path:
    """把生成片的时间轴压到 target 秒，内容不丢。

    通道最短只出 5s（实际 124 帧 / 5.167s），源段常更短。原来用 `-t` 硬裁，尾部 0.77s
    的动作被扔掉，动作只演到 88%。这里改成重采样：全部 124 帧压进 target 秒。

    `out.mp4` 保持原速 —— 度量只吃它；`retimed.mp4` 只给对照视图看。
    """
    out = run_dir / "retimed.mp4"
    code = run_cmd([sys.executable, str(RETIME_PY), "--gen", str(gen),
                    "--target", f"{target:.4f}", "--mode", "zone",
                    "--metrics", str(run_dir / "metrics.json"), "--out", str(out)], jid)
    if code == 0 and out.exists():
        job_log(jid, f"变速对齐 → retimed.mp4（目标 {target:.2f}s，内容全保留）")
        return out
    job_log(jid, "变速失败，退回裁切")
    return gen


def build_cmp(src_video: Path, start: float, dur: float, gen: Path, out_mp4: Path,
              jid: str) -> bool:
    W, H = 480, 270
    # shortest=1：生成路已被 retime 对齐到段长，这里不再二次 -t 裁它，取短即可
    vf = (f"[0:v]scale={W}:{H}:force_original_aspect_ratio=decrease,"
          f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24[a];"
          f"[1:v]scale={W}:{H}:force_original_aspect_ratio=decrease,"
          f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24[b];"
          f"[a][b]hstack=inputs=2:shortest=1[v]")
    out_mp4.parent.mkdir(parents=True, exist_ok=True)
    code = run_cmd([sys.executable, str(FFMPEG), "-y",
                    "-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", str(src_video),
                    "-i", str(gen),
                    "-filter_complex", vf, "-map", "[v]", "-an",
                    "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p",
                    str(out_mp4)], jid)
    return code == 0 and out_mp4.exists()


def work_run(jid: str, vid: str, seg: str, prompt: str, group: str, note: str):
    try:
        meta = jload(SRC / vid / "segments.json")
        if not meta:
            raise SystemExit("还没分段")
        s = next((x for x in meta["segments"] if x["seg"] == seg), None)
        if not s:
            raise SystemExit(f"没有段 {seg}")
        anchor = SRC / vid / s["anchor"]
        # 编号按「段-组」计：原来用 group == seg 比，永远匹配不到，n 恒为 1，重复跑就覆盖上一条
        prefix = f"{seg}-{group or 'exp'}-"
        n = 1 + sum(1 for r in _read_jsonl(PROBE / "experiments.jsonl")
                    if str(r.get("id", "")).startswith(prefix))
        rid = f"{seg}-{(group or 'exp')}-{n:02d}"
        dur = round(min(max(s["dur"], 0.5), 15.0), 1)
        if s["dur"] < 5.0:
            dur = 5.0
        cmd = [sys.executable, str(PROBE_PY), "--id", rid, "--group", group or seg,
               "--frame", str(anchor), "--prompt", prompt,
               "--dur", str(dur), "--ar", "16:9", "--mp", "0.6",
               "--out", str(PROBE), "--note", note or f"{vid}/{seg}",
               "--extra", f"video_id={vid}", "--extra", f"seg_id={seg}"]
        job_log(jid, f"提交 {rid}（锚 {s['anchor']}，请求 {dur}s）")
        if run_cmd(cmd, jid) != 0:
            raise SystemExit("probe 失败")
        run_dir = RUNS / rid
        rec = jload(run_dir / "run.json", {}) or {}
        run_cmd([sys.executable, str(MEASURE_PY), "--run", str(run_dir)], jid)
        metrics = jload(run_dir / "metrics.json", {}) or {}
        gen = Path(rec.get("file") or run_dir / "out.mp4")
        # 源段比生成长 → 硬裁丢尾；改成把生成片压到段时长，124 帧全用上
        seg_dur = float(s["dur"])
        gen_cmp = gen
        if gen.exists():
            try:
                gd = float(metrics.get("dur_measured") or 0)
            except (TypeError, ValueError):
                gd = 0.0
            target = min(seg_dur, gd) if gd > 0 else seg_dur
            if target > 0.5:
                gen_cmp = retime_gen(gen, target, run_dir, jid)
        cmp_mp4 = CMP / f"{rid}.mp4"
        ok = build_cmp(SRC / vid / "src.mp4", s["start"], min(s["dur"], dur), gen_cmp, cmp_mp4, jid)
        job_log(jid, f"对照视图 {'已出' if ok else '失败'}：{cmp_mp4.name}")
        job_done(jid, {"run": rec, "metrics": metrics, "seg": s, "vid": vid,
                       "cmp": f"/probe/cmp/{cmp_mp4.name}" if ok else None,
                       "gen": f"/probe/runs/{rid}/out.mp4",
                       "zones": f"/probe/runs/{rid}/zones.png"})
    except Exception as e:                                 # noqa: BLE001
        job_done(jid, error=e)


CLIP_LOCK = threading.Lock()


def ensure_clip(vid: str, seg: str):
    """按需切出单段原片：src/<vid>/seg/<seg>.mp4。返回 (路径, 失败原因)。"""
    meta = jload(SRC / vid / "segments.json")
    if not meta:
        return None, "还没分段"
    s = next((x for x in meta["segments"] if x["seg"] == seg), None)
    if not s:
        return None, f"没有段 {seg}"
    out = SRC / vid / "seg" / f"{seg}.mp4"
    with CLIP_LOCK:
        if out.exists() and out.stat().st_size > 1024:
            return out, None
        out.parent.mkdir(parents=True, exist_ok=True)
        tmp = out.with_name(out.stem + ".part.mp4")
        # 重编码而非 -c copy：copy 会从最近的关键帧起头，段头尾就不准了
        r = subprocess.run(
            [sys.executable, str(FFMPEG), "-y",
             "-ss", f"{s['start']:.3f}", "-t", f"{s['dur']:.3f}",
             "-i", str(SRC / vid / "src.mp4"),
             "-c:v", "libx264", "-crf", "20", "-preset", "veryfast",
             "-c:a", "aac", "-movflags", "+faststart", str(tmp)],
            capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode != 0 or not tmp.exists():
            return None, ((r.stderr or "").strip().splitlines() or ["ffmpeg 失败"])[-1][:300]
        tmp.replace(out)
        return out, None


def _read_jsonl(p: Path):
    out = []
    if not p.exists():
        return out
    for line in p.read_text(encoding="utf-8").splitlines():
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return out


# ---------------------------------------------------------------- HTTP
class H(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _send(self, code, body: bytes, ctype="application/json; charset=utf-8"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"))

    def _file(self, p: Path):
        """支持 Range：视频要能拖动进度、循环，整文件一口气发不行。"""
        if not p.exists() or not p.is_file():
            self._json({"error": "not found", "path": str(p)}, 404)
            return
        ctype = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
        size = p.stat().st_size
        m = re.match(r"bytes=(\d*)-(\d*)", self.headers.get("Range", "") or "")
        if m and size:
            start = int(m.group(1) or 0)
            end = int(m.group(2)) if m.group(2) else size - 1
            end = min(end, size - 1)
            if start > end or start >= size:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            with p.open("rb") as f:
                f.seek(start)
                body = f.read(end - start + 1)
            self.send_response(206)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        body = p.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        path = urllib.parse.unquote(u.path)
        if path in ("/", "/index.html"):
            return self._file(CONSOLE / "index.html")
        if path.startswith("/static/"):
            return self._file(CONSOLE / path[len("/static/"):])
        if path.startswith("/probe/"):
            rel = path[len("/probe/"):]
            if ".." in rel:
                return self._json({"error": "bad path"}, 400)
            return self._file(PROBE / rel)
        if path.startswith("/clip/"):
            rel = path[len("/clip/"):]
            if ".." in rel:
                return self._json({"error": "bad path"}, 400)
            vid, _, name = rel.partition("/")
            seg = name[:-4] if name.endswith(".mp4") else name
            if not vid or not seg:
                return self._json({"error": "bad path"}, 400)
            clip, why = ensure_clip(vid, seg)
            if not clip:
                return self._json({"error": why}, 404)
            return self._file(clip)
        if path == "/api/state":
            return self._json(state(q.get("vid", [""])[0]))
        if path.startswith("/api/job/"):
            jid = path.split("/")[-1]
            with LOCK:
                j = JOBS.get(jid)
            return self._json(j or {"error": "no job"}, 200 if j else 404)
        if path == "/api/segments":
            meta = jload(SRC / q.get("vid", [""])[0] / "segments.json")
            return self._json(meta or {"error": "no segments"}, 200 if meta else 404)
        self._json({"error": "no route"}, 404)

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        n = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(n) or b"{}")
        except json.JSONDecodeError:
            return self._json({"error": "bad json"}, 400)
        if u.path == "/api/ingest":
            p = Path(body.get("path", "")).expanduser()
            secs = float(body.get("secs") or 120)
            jid = job_new("ingest")
            threading.Thread(target=work_ingest, args=(jid, p, secs), daemon=True).start()
            return self._json({"job": jid})
        if u.path == "/api/run":
            jid = job_new("run")
            threading.Thread(target=work_run, args=(
                jid, body.get("vid", ""), body.get("seg", ""), body.get("prompt", ""),
                body.get("group", ""), body.get("note", "")), daemon=True).start()
            return self._json({"job": jid})
        if u.path == "/api/note":
            key = str(body.get("key") or "").strip()
            if not key:
                return self._json({"error": "missing key"}, 400)
            return self._json(save_note(key, body.get("text", "")))
        self._json({"error": "no route"}, 404)


def note_key(r: dict) -> str:
    """一条实验的批注主键。用 task_id（每次提交唯一），缺失时退到 id@ts。"""
    return str(r.get("task_id") or "") or f"{r.get('id')}@{r.get('ts')}"


def load_notes() -> dict:
    return jload(NOTES, {}) or {}


def save_note(key: str, text: str) -> dict:
    """整表读改写 + 原子替换。批注是人的话，宁可丢并发也不丢已有条目。"""
    text = (text or "").strip()
    with LOCK:
        notes = load_notes()
        if text:
            notes[key] = {"text": text, "updated": time.strftime("%Y-%m-%d %H:%M:%S")}
        else:
            notes.pop(key, None)          # 清空即删，不留空壳
        tmp = NOTES.with_suffix(".json.tmp")
        tmp.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_text(json.dumps(notes, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(NOTES)
    return {"ok": True, "key": key, "text": text, "updated": (notes.get(key) or {}).get("updated")}


def _run_view(rid: str, r: dict) -> dict:
    """一条记录的可视化地址。live=产物还属于这条（同 id 被后来者覆盖时为 False）。"""
    run_dir = RUNS / rid
    owner = (jload(run_dir / "run.json", {}) or {}).get("task_id")
    live = bool(owner) and owner == r.get("task_id")
    cmp_p = CMP / f"{rid}.mp4"
    return {**r,
            "live": live,
            "metrics": jload(run_dir / "metrics.json", {}) if live else {},
            "cmp": f"/probe/cmp/{cmp_p.name}" if live and cmp_p.exists() else None,
            "gen": f"/probe/runs/{rid}/out.mp4" if live and (run_dir / "out.mp4").exists() else None,
            "zones": f"/probe/runs/{rid}/zones.png" if live and (run_dir / "zones.png").exists() else None,
            "anchor_img": f"/probe/runs/{rid}/anchor.png" if live and (run_dir / "anchor.png").exists() else None}


def state(vid: str):
    if not vid:                       # 不带 vid：落到最近一次分段，页面打开即用
        cands = sorted(SRC.glob("*/segments.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        if cands:
            vid = cands[0].parent.name
    allrows = _read_jsonl(PROBE / "experiments.jsonl")
    notes = load_notes()
    history = [_run_view(r.get("id") or "", r) for r in reversed(allrows)]
    for h in history:
        h["key"] = note_key(h)
        h["note"] = notes.get(h["key"])
    rows = [r for r in allrows if not vid or r.get("video_id") == vid]
    runs = [_run_view(r.get("id") or "", r) for r in rows]
    for r in runs:
        r["key"] = note_key(r)
        r["note"] = notes.get(r["key"])
    meta = jload(SRC / vid / "segments.json") if vid else None
    return {"vid": vid, "runs": runs, "history": history, "segments": meta}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    a = ap.parse_args()
    RUNS.mkdir(parents=True, exist_ok=True)
    CMP.mkdir(parents=True, exist_ok=True)
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), H)
    print(f"http://127.0.0.1:{a.port}/  probe={PROBE}", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
