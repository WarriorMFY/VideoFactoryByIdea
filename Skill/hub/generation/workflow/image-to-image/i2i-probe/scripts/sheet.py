"""i2i-probe 对照 sheet：把一条或一组 run 拼成「锚 | 出图1 | 出图2」横排。

    python sheet.py --run Log/Circle27/runs/A-V1-近
    python sheet.py --root Log/Circle27 --group A-V1
"""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def font(size):
    for p in ("C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/arial.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def row_items(run_dir: Path):
    rec_path = run_dir / "run.json"
    if not rec_path.exists():
        return None
    rec = json.loads(rec_path.read_text(encoding="utf-8"))
    imgs = [run_dir / "anchor.png"] + sorted(run_dir.glob("out*.png"))
    imgs = [p for p in imgs if p.exists()]
    if len(imgs) < 2:
        return None
    title = rec.get("id", "?")
    if rec.get("variable"):
        title += f" · {rec['variable']}={rec.get('level', '')}"
    labels = ["ANCHOR"] + [p.name for p in imgs[1:]]
    return title, list(zip(labels, imgs))


def build(rows, out_path: Path, h=460):
    margin, label_h, title_h = 10, 28, 34
    panels = []
    for title, items in rows:
        thumbs = []
        for _, p in items:
            im = Image.open(p).convert("RGB")
            thumbs.append(im.resize((max(1, int(im.width * h / im.height)), h), Image.LANCZOS))
        width = sum(t.width for t in thumbs) + margin * (len(thumbs) + 1)
        panels.append((title, list(zip([lb for lb, _ in items], thumbs)), width))
    W = max(w for _, _, w in panels) + margin
    H = sum(title_h + label_h + h + margin for _ in panels) + margin
    canvas = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(canvas)
    y = margin
    for title, items, _ in panels:
        d.text((margin, y), title, fill="black", font=font(22))
        y += title_h
        x = margin
        for label, im in items:
            d.text((x + 4, y + 2), label, fill="black", font=font(18))
            canvas.paste(im, (x, y + label_h))
            x += im.width + margin
        y += label_h + h + margin
    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path)
    print(f"[sheet] -> {out_path}  ({canvas.width}x{canvas.height})")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default=None, help="单条 run 目录")
    ap.add_argument("--root", default=None, help="产物根目录（含 experiments.jsonl）")
    ap.add_argument("--group", default=None, help="组号，如 A-V1")
    a = ap.parse_args()

    if a.run:
        rd = Path(a.run).resolve()
        item = row_items(rd)
        if not item:
            raise SystemExit(f"没有可拼的图：{rd}")
        build([item], rd / "sheet.png")
        return 0

    if not a.root or not a.group:
        raise SystemExit("要么给 --run，要么给 --root 加 --group")
    root = Path(a.root).resolve()
    ledger = root / "experiments.jsonl"
    if not ledger.exists():
        raise SystemExit(f"缺账本：{ledger}")
    rows = []
    seen = set()
    for line in reversed(ledger.read_text(encoding="utf-8").splitlines()):
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        if rec.get("group") != a.group or rec.get("id") in seen:
            continue
        rd = root / "runs" / rec["id"]
        item = row_items(rd)
        if item:
            rows.append(item)
            seen.add(rec.get("id"))
    if not rows:
        raise SystemExit(f"组 {a.group} 没有完整 run")
    build(rows, root / "sheets" / f"{a.group}.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
