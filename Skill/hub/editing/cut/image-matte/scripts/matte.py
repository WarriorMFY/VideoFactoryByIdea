#!/usr/bin/env python
"""工业级自动抠图（rembg + ONNX 分割模型）：图 -> 透明底 PNG，可选裁外接框、出统计。

本文件是技能实现本体，位于技能树内；第三方依赖与模型权重是运行时缓存，统一放在
`<仓库>/Tool/_deps_matte/`（可用环境变量 CARDSTUDIO_MATTE_DEPS 覆盖），不进技能树。
用法（任意目录可调用）：
  python Skill/hub/editing/cut/image-matte/scripts/matte.py <图或目录> [-o 输出] [--model u2net|isnet-general-use|...]
                       [--alpha] [--crop] [--bg transparent|white|#RRGGBB] [--json] [--suffix -matte]
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path


def _repo_root(start: Path) -> Path:
    for p in [start, *start.parents]:
        if (p / "Skill").is_dir() and (p / "Tool").is_dir():
            return p
    raise SystemExit("找不到仓库根（需同时含 Skill/ 与 Tool/）")


REPO = _repo_root(Path(__file__).resolve().parent)
DEPS = Path(os.environ.get("CARDSTUDIO_MATTE_DEPS", REPO / "Tool" / "_deps_matte"))
MODELS = DEPS / "models"
IMG_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


def bootstrap():
    """把项目内依赖与模型目录挂上，避免依赖系统环境。"""
    if str(DEPS) not in sys.path:
        sys.path.insert(0, str(DEPS))
    os.environ.setdefault("U2NET_HOME", str(MODELS))
    os.environ.setdefault("OMP_NUM_THREADS", "4")


def collect(paths):
    files = []
    for p in paths:
        path = Path(p)
        if path.is_dir():
            files += [f for f in sorted(path.iterdir()) if f.suffix.lower() in IMG_EXT]
        elif path.is_file():
            files.append(path)
        else:
            print(f"[skip] 不存在: {p}")
    return files


def main():
    ap = argparse.ArgumentParser(description="工业级自动抠图（去背景）")
    ap.add_argument("inputs", nargs="+", help="图片或目录，可多个")
    ap.add_argument("-o", "--out", default=None, help="输出文件或目录；单图可给文件名")
    ap.add_argument("--model", default="u2net", help="u2net / isnet-general-use / isnet-anime / silueta / u2net_human_seg / birefnet-general")
    ap.add_argument("--alpha", action="store_true", help="边缘 alpha matting（更软，慢 2-4 倍，适合毛发/纱")
    ap.add_argument("--crop", action="store_true", help="另存按主体外接框裁过的版本")
    ap.add_argument("--bg", default="transparent", help="transparent / white / #RRGGBB")
    ap.add_argument("--json", action="store_true", help="写出 stats（外接框、覆盖率、耗时）")
    ap.add_argument("--suffix", default="-matte", help="输出文件名后缀")
    args = ap.parse_args()

    bootstrap()
    import numpy as np
    from PIL import Image
    from rembg import new_session, remove

    files = collect(args.inputs)
    if not files:
        sys.exit("没有可处理的图片")

    t0 = time.time()
    session = new_session(args.model)
    print(f"[model] {args.model} 载入 {time.time() - t0:.1f}s")

    for src in files:
        t = time.time()
        im = Image.open(src).convert("RGB")
        cut = remove(im, session=session, alpha_matting=args.alpha)
        cut = cut.convert("RGBA")

        a = np.array(cut)[:, :, 3]
        ys, xs = np.where(a > 8)
        bbox = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1] if len(xs) else [0, 0, 0, 0]
        cover = float((a > 128).mean() * 100)

        # 目标路径：-o 无后缀或已存在目录 或 多图，一律当目录
        if args.out:
            o = Path(args.out)
            as_dir = o.is_dir() or len(files) > 1 or o.suffix == ""
            if as_dir:
                o.mkdir(parents=True, exist_ok=True)
                out_dir, stem = o, src.stem + args.suffix
            else:
                o.parent.mkdir(parents=True, exist_ok=True)
                out_dir, stem = o.parent, o.stem
        else:
            out_dir, stem = src.parent, src.stem + args.suffix

        result = cut
        if args.bg != "transparent":
            bg = (255, 255, 255, 255) if args.bg == "white" else tuple(int(args.bg.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)) + (255,)
            base = Image.new("RGBA", cut.size, bg)
            result = Image.alpha_composite(base, cut)

        out_png = out_dir / f"{stem}.png"
        result.save(out_png)

        info = {
            "source": str(src),
            "output": str(out_png),
            "model": args.model,
            "alpha_matting": bool(args.alpha),
            "size": list(im.size),
            "bbox": bbox,
            "foreground_pct": round(cover, 1),
            "seconds": round(time.time() - t, 2),
        }

        if args.crop and bbox[2] > bbox[0]:
            pad = 8
            box = (max(0, bbox[0] - pad), max(0, bbox[1] - pad),
                   min(im.size[0], bbox[2] + pad), min(im.size[1], bbox[3] + pad))
            crop_path = out_dir / f"{stem}-crop.png"
            result.crop(box).save(crop_path)
            info["crop"] = str(crop_path)

        if args.json:
            (out_dir / f"{stem}.json").write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding="utf-8")

        print(f"[ok] {src.name} -> {out_png.name}  {info['size'][0]}x{info['size'][1]}  "
              f"前景 {cover:.1f}%  {info['seconds']}s")

    print(f"[done] {len(files)} 张，总耗时 {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
