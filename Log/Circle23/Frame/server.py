#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Frame 原型本地服务：关键帧树协作页。
仅用 Python 标准库；不连接 RunningHub（生成接口为 stub，请求留档到帧目录）。

启动：
    python server.py          # 默认 http://127.0.0.1:8765
    python server.py 8766     # 自定义端口
"""
import json
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
FRAMES = BASE / "frames"
STATIC = BASE / "static"
TREE_FILE = DATA / "tree.json"

VALID_ID = re.compile(r"^frame_\d{2}$")

# meta.json 允许前端回写的白名单；其余静态字段以后端 tree.json 为准
META_FIELDS = ("style", "note", "tags", "status")


def load_tree():
    with open(TREE_FILE, encoding="utf-8") as f:
        return json.load(f)


def frame_dir(fid: Path) -> Path:
    return FRAMES / fid


def ensure_frame(fid: str, tree: dict) -> Path | None:
    """叶子目录首次访问时初始化落盘：meta.json / prompt.md / images/ / videos/。"""
    if fid not in tree["frames"]:
        return None
    d = frame_dir(fid)
    (d / "images").mkdir(parents=True, exist_ok=True)
    (d / "videos").mkdir(parents=True, exist_ok=True)
    meta_file = d / "meta.json"
    prompt_file = d / "prompt.md"
    src = tree["frames"][fid]
    if not meta_file.exists():
        meta = {
            "style": src.get("style", "main"),
            "note": src.get("note", ""),
            "tags": src.get("tags", []),
            "status": "draft",
        }
        meta_file.write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    if not prompt_file.exists():
        prompt_file.write_text(src.get("prompt_frame", ""), encoding="utf-8")
    return d


def read_frame(fid: str, tree: dict) -> dict:
    d = ensure_frame(fid, tree)
    src = tree["frames"][fid]
    meta = json.loads((d / "meta.json").read_text(encoding="utf-8"))
    prompt = (d / "prompt.md").read_text(encoding="utf-8")
    images = sorted(p.name for p in (d / "images").iterdir() if p.is_file())
    videos = sorted(p.name for p in (d / "videos").iterdir() if p.is_file())
    return {
        "tree": src,
        "meta": meta,
        "prompt_frame": prompt,
        "images": images,
        "videos": videos,
    }


class Handler(BaseHTTPRequestHandler):
    # ---------- 响应工具 ----------
    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path: Path, ctype: str):
        if not path.exists() or not path.is_file():
            self._send_json({"error": "not found"}, 404)
            return
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ---------- GET ----------
    def do_GET(self):
        path = self.path.split("?")[0]
        tree = load_tree()

        if path in ("/", "/index.html"):
            self._send_file(STATIC / "index.html", "text/html; charset=utf-8")
            return
        if path == "/api/tree":
            self._send_json(tree)
            return

        m = re.match(r"^/api/frame/(frame_\d{2})$", path)
        if m:
            fid = m.group(1)
            if fid not in tree["frames"]:
                self._send_json({"error": "unknown frame"}, 404)
                return
            self._send_json(read_frame(fid, tree))
            return

        if path.startswith("/static/"):
            name = path[len("/static/"):]
            if ".." in name:
                self._send_json({"error": "forbidden"}, 403)
                return
            self._send_file(STATIC / name, "application/octet-stream")
            return

        self._send_json({"error": "not found"}, 404)

    # ---------- POST ----------
    def do_POST(self):
        path = self.path.split("?")[0]
        tree = load_tree()
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except Exception:
            self._send_json({"error": "bad json"}, 400)
            return

        m = re.match(r"^/api/frame/(frame_\d{2})$", path)
        if m:
            fid = m.group(1)
            if fid not in tree["frames"]:
                self._send_json({"error": "unknown frame"}, 404)
                return
            d = ensure_frame(fid, tree)
            meta_in = body.get("meta") or {}
            prompt = body.get("prompt_frame")
            meta = json.loads((d / "meta.json").read_text(encoding="utf-8"))
            for field in META_FIELDS:
                if field in meta_in:
                    meta[field] = meta_in[field]
            (d / "meta.json").write_text(
                json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            if isinstance(prompt, str):
                (d / "prompt.md").write_text(prompt, encoding="utf-8")
            self._send_json(read_frame(fid, tree))
            return

        m2 = re.match(r"^/api/generate/(frame_\d{2})$", path)
        if m2:
            fid = m2.group(1)
            d = ensure_frame(fid, tree)
            (d / "last_request.json").write_text(
                json.dumps(body, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            self._send_json({
                "status": "stub",
                "message": "原型阶段：生成通道尚未接通 RunningHub；本次请求已留档到帧目录 last_request.json。",
                "frame": fid,
            })
            return

        self._send_json({"error": "not found"}, 404)

    def log_message(self, fmt, *args):
        sys.stderr.write("[frame-server] %s\n" % (fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    FRAMES.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Frame studio running at http://127.0.0.1:{port}")
    print(f"Frame data: {FRAMES}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped.")


if __name__ == "__main__":
    main()
