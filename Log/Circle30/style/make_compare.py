"""Circle30 现场器材：四张风格帧拼版（2×2，带 ID 与三个度量）。
不保证随上层修复，仅供本轮留痕。
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
IDS = ["S1-油画侧光", "S2-电影写实", "S3-工笔界画", "S4-套色木刻"]
H = 700
GAP = 16
PAD = 20


def load(i):
    run = ROOT / "runs" / i
    img = Image.open(run / "out.png").convert("RGB")
    m = {}
    p = run / "metrics.json"
    if p.exists():
        m = json.loads(p.read_text(encoding="utf-8"))
    return img, m


def main():
    items = [load(i) for i in IDS]
    scaled = [im.resize((round(im.width * H / im.height), H), Image.LANCZOS) for im, _ in items]
    col_w = max(s.width for s in scaled)
    label_h = 64
    cols, rows = 2, 2
    sheet_w = cols * col_w + GAP * (cols + 1)
    sheet_h = rows * (H + label_h) + GAP * (rows + 1)
    sheet = Image.new("RGB", (sheet_w, sheet_h), (26, 26, 26))
    d = ImageDraw.Draw(sheet)
    try:
        f1 = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 30)
        f2 = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 22)
    except OSError:
        f1 = f2 = ImageFont.load_default()

    for idx, (s, (_, m)) in enumerate(zip(scaled, items)):
        r, c = divmod(idx, cols)
        x = GAP + c * (col_w + GAP) + (col_w - s.width) // 2
        y = GAP + r * (H + label_h + GAP)
        sheet.paste(s, (x, y))
        d.text((x, y + H + 4), IDS[idx], font=f1, fill=(240, 240, 240))
        line = "lap {:,.0f}   sat {:.0f}   val {:.0f}   mirror {:+.3f}".format(
            m.get("lap_var", 0), m.get("sat_mean", 0), m.get("val_mean", 0),
            m.get("mirror_ncc", 0))
        d.text((x, y + H + 38), line, font=f2, fill=(170, 170, 170))

    out = ROOT / "style-compare.png"
    sheet.save(out)
    print(f"ok {out} {sheet.width}x{sheet.height}")


if __name__ == "__main__":
    main()
