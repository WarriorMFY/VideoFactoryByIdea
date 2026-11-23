"""Circle30 现场器材：空间锚拼版（风格锚 + 两张候选，等高）。
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
RUN = HERE / "runs" / "SP1b-留位"
H = 780
GAP = 18


def main():
    items = [("风格锚 S1（锁定 3:4）", ROOT / "style" / "style-anchor-locked.png", None)]
    m = {}
    mp = RUN / "space-metrics.json"
    if mp.exists():
        m = json.loads(mp.read_text(encoding="utf-8")).get("candidates", {})
    for i in (1, 2):
        items.append((f"SP1b-{i}（2:3）", RUN / f"out_{i}.png", m.get(f"out_{i}.png")))

    shown = []
    for label, path, mm in items:
        im = Image.open(path).convert("RGB")
        shown.append((label, im.resize((round(im.width * H / im.height), H), Image.LANCZOS), mm))

    col_w = max(s.width for _, s, _ in shown)
    label_h = 62
    sheet = Image.new("RGB", (len(shown) * col_w + GAP * (len(shown) + 1), H + label_h + GAP * 2), (26, 26, 26))
    d = ImageDraw.Draw(sheet)
    try:
        f1 = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 26)
        f2 = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 20)
    except OSError:
        f1 = f2 = ImageFont.load_default()

    for idx, (label, s, mm) in enumerate(shown):
        x = GAP + idx * (col_w + GAP) + (col_w - s.width) // 2
        sheet.paste(s, (x, GAP))
        d.text((x, GAP + H + 6), label, font=f1, fill=(240, 240, 240))
        if mm:
            line = "lap {:,.0f}（×{:.2f}）  sat {:.0f}（×{:.2f}）".format(
                mm["lap_var"], mm["lap_ratio"], mm["sat_mean"], mm["sat_ratio"])
            d.text((x, GAP + H + 34), line, font=f2, fill=(170, 170, 170))

    out = HERE / "space-compare.png"
    sheet.save(out)
    print(f"ok {out} {sheet.width}x{sheet.height}")


if __name__ == "__main__":
    main()
