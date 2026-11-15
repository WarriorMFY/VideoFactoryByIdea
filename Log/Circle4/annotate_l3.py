"""给 L3 单帧验证图标注验收点：图上编号图钉（可带引线）+ 下方判定清单。

用法：python Log/Circle4/annotate_l3.py K0
数据：SPECS[帧] = (文字, 判定, 目标x, 目标y, 备注[, 图钉x, 图钉y])
坐标均为相对原图的比例；不给图钉坐标则图钉直接压在目标点上。
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "Tool" / "_deps"))

from PIL import Image, ImageDraw, ImageFont  # noqa: E402

OUTDIR = ROOT / "Log" / "Circle4" / "output"

FONT_R = "C:/Windows/Fonts/msyh.ttc"
FONT_B = "C:/Windows/Fonts/msyhbd.ttc"

C_PASS = (22, 163, 74)
C_PART = (217, 119, 6)
C_FAIL = (220, 38, 38)
C_BG = (17, 24, 39)
C_TX = (243, 244, 246)
C_DIM = (156, 163, 175)

VC = {"PASS": C_PASS, "PARTIAL": C_PART, "FAIL": C_FAIL}
VL = {"PASS": "成立", "PARTIAL": "部分成立", "FAIL": "未成立"}

SPECS = {
    "K0": dict(
        title="K0 · 起势对峙 · 0%",
        verdict="PARTIAL",
        items=[
            ("A 双掌张开、掌心朝向主体B", "PARTIAL", 0.392, 0.278,
             "抬起的是掌，另一只却握成拳", 0.392, 0.105),
            ("A 左掌停左胸前、右掌停右胸前", "PARTIAL", 0.302, 0.302,
             "一掌停在胸高，另一手握拳", 0.230, 0.105),
            ("B 双拳护于胸前、两肘内收", "PASS", 0.668, 0.245,
             "双拳护胸，两肘尖朝下", 0.714, 0.105),
            ("双方均未发出攻击动作、尚未接触", "PASS", 0.505, 0.345,
             "两人之间完全空开", None, None),
            ("四只脚均着地不动", "PASS", 0.150, 0.888,
             "四脚均与地面接触", 0.150, 0.715),
            ("前脚脚尖之间约一臂半", "PARTIAL", 0.505, 0.878,
             "实测偏近，约 1.2–1.3 臂", 0.505, 0.715),
        ],
    ),
    "K1": dict(
        title="K1 · 来拳入位 · 25%",
        verdict="PARTIAL",
        items=[
            ("B 右拳打至A胸前、拳锋指向胸口", "PASS", 0.604, 0.288,
             "拳锋到位，指向胸口", 0.560, 0.105),
            ("拳面与胸口之间留一掌宽空隙", "PASS", 0.638, 0.302,
             "空隙可见，约 1.5 拳宽", 0.672, 0.105),
            ("右臂送出大半、尚未伸直", "FAIL", 0.508, 0.292,
             "肘窝拉平，完全伸直", 0.452, 0.105),
            ("A 左手抬至肩高、挡在来拳线路上", "PARTIAL", 0.648, 0.238,
             "抬到下颌高度，位置偏上", 0.632, 0.168),
            ("A 右掌仍停在自身右胸前", "PASS", 0.718, 0.248,
             "另一掌停在胸前未动", 0.790, 0.115),
            ("B 右脚原地蹬地、双脚未离地", "PASS", 0.500, 0.880,
             "双脚均贴地", None, None),
        ],
    ),
    "K2": dict(
        title="K2 · 拨开来拳 · 50%",
        verdict="FAIL",
        items=[
            ("A 左手拨中B右小臂外侧", "PARTIAL", 0.480, 0.392,
             "两只手都贴在小臂上，托住下缘而非外侧", 0.400, 0.095),
            ("B 右拳被带离躯干连线、偏向A左侧", "PARTIAL", 0.438, 0.479,
             "来拳确已落空，但被压向正下方，非沿左侧向外", 0.648, 0.502),
            ("A 右掌向正前方送出、掌心朝B胸口", "FAIL", 0.452, 0.268,
             "另一只手掌张开停在半空，未向胸口送出", 0.548, 0.052),
            ("唯一接触点＝A 的手与B 右小臂", "PASS", 0.492, 0.396,
             "B 的胸口未被触及，仅小臂一处接触", 0.556, 0.700),
            ("A 原地微转、双脚未离地", "PASS", 0.285, 0.868,
             "双脚位置不变", 0.148, 0.930),
        ],
    ),
    "K3": dict(
        title="K3 · 上步推掌 · 75%",
        verdict="PASS",
        items=[
            ("A 右掌根抵在B胸口正中", "PARTIAL", 0.622, 0.290,
             "落在上胸偏锁骨，非正中", 0.520, 0.172),
            ("B 胸口受推击、上身向正后方仰起", "PASS", 0.675, 0.160,
             "上身与头明显后仰", 0.752, 0.112),
            ("B 后脚脚跟离地", "PASS", 0.748, 0.802,
             "后脚跟抬起，仅前掌着地", 0.812, 0.742),
            ("A 左手已放开、收在自身左侧胸前", "PASS", 0.432, 0.300,
             "立掌收于胸前", 0.372, 0.178),
            ("A 左脚迈出半步、两前脚相距约半步", "PASS", 0.552, 0.870,
             "两前脚几乎相邻，约半步", None, None),
            ("B 右拳仍被拨在自身右外侧、未再前送", "PARTIAL", 0.800, 0.400,
             "拳垂在身侧，位置偏低", 0.852, 0.478),
        ],
    ),
    "K4": dict(
        title="K4 · 按胸压制 · 100%",
        verdict="PASS",
        items=[
            ("A 右掌根持续压住B胸口", "PASS", 0.598, 0.652,
             "五指张开，按在胸骨上缘", 0.462, 0.706),
            ("B 仰面倒地、背部贴地", "PASS", 0.660, 0.668,
             "面朝上，背部贴地", 0.700, 0.548),
            ("B 四肢摊开", "PASS", 0.790, 0.800,
             "双臂向两侧摊开，双腿伸直", 0.905, 0.862),
            ("A 左手垂在自身左侧腰际", "PASS", 0.335, 0.362,
             "左手自然下垂", 0.282, 0.238),
            ("A 脊柱前俯、重心下沉", "PASS", 0.415, 0.400,
             "背线弯折，胯部下沉", None, None),
        ],
    ),
}


def wrap(draw, text, font, maxw):
    lines, cur = [], ""
    for ch in text:
        if draw.textlength(cur + ch, font=font) <= maxw:
            cur += ch
        else:
            lines.append(cur)
            cur = ch
    if cur:
        lines.append(cur)
    return lines


def main():
    frame = sys.argv[1] if len(sys.argv) > 1 else "K0"
    spec = SPECS[frame]
    src = OUTDIR / ("l3-5f-%s.png" % frame.lower())
    im = Image.open(src).convert("RGB")

    f_num = ImageFont.truetype(FONT_B, 24)
    f_item = ImageFont.truetype(FONT_R, 21)
    f_sub = ImageFont.truetype(FONT_R, 15)
    f_title = ImageFont.truetype(FONT_B, 32)
    f_chip = ImageFont.truetype(FONT_B, 24)

    W = 1400
    H = int(im.height * (W / im.width))
    photo = im.resize((W, H), Image.LANCZOS)
    d = ImageDraw.Draw(photo)

    # ---- 图钉 + 引线 ----
    r = 19
    pins = []
    for i, it in enumerate(spec["items"], 1):
        text, verdict, fx, fy, note = it[:5]
        px, py = (it[5], it[6]) if len(it) > 5 else (None, None)
        tx, ty = fx * W, fy * H
        cx = px * W if px is not None else tx
        cy = py * H if py is not None else ty
        cx = max(r + 5, min(W - r - 5, cx))
        cy = max(r + 5, min(H - r - 5, cy))
        pins.append((i, verdict, cx, cy, tx, ty))

    for i, verdict, cx, cy, tx, ty in pins:
        if abs(cx - tx) > 3 or abs(cy - ty) > 3:
            d.line([cx, cy, tx, ty], fill=(255, 255, 255), width=4)
            d.line([cx, cy, tx, ty], fill=VC[verdict], width=2)
            d.ellipse([tx - 6, ty - 6, tx + 6, ty + 6], outline=(255, 255, 255), width=3)
            d.ellipse([tx - 3, ty - 3, tx + 3, ty + 3], fill=VC[verdict])
    for i, verdict, cx, cy, tx, ty in pins:
        d.ellipse([cx - r - 4, cy - r - 4, cx + r + 4, cy + r + 4], fill=(255, 255, 255))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=VC[verdict])
        t = str(i)
        tw = d.textlength(t, font=f_num)
        bb = f_num.getbbox(t)
        d.text((cx - tw / 2, cy - (bb[3] + bb[1]) / 2), t, font=f_num, fill=(255, 255, 255))

    # ---- 版面 ----
    pad = 26
    head_h = 92
    colw = (W - pad * 2 - 30) // 2
    maxw = colw - 46

    probe = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    entries = []
    for i, it in enumerate(spec["items"], 1):
        text, verdict, note = it[0], it[1], it[4]
        ls = wrap(probe, "%s —— %s" % (text, note), f_item, maxw)
        entries.append((i, verdict, ls, 24 * len(ls) + 16))

    two_col = len(entries) > 4
    if two_col:
        half = (len(entries) + 1) // 2
        cols = [entries[:half], entries[half:]]
    else:
        cols = [entries]
    col_h = [sum(e[3] for e in col) for col in cols]
    panel_h = pad + max(col_h) + 46 + pad

    canvas = Image.new("RGB", (W, head_h + H + panel_h), C_BG)
    canvas.paste(photo, (0, head_h))
    c = ImageDraw.Draw(canvas)

    c.text((pad, 20), spec["title"], font=f_title, fill=C_TX)
    c.text((pad, 60),
           "验收点标注 · 卡片 hash 4DFC9F492DF2 · 正向＝卡内原文逐字 · 通道 2085304953094107137 / 1k / 16:9",
           font=f_sub, fill=C_DIM)

    label = VL[spec["verdict"]]
    tw = c.textlength(label, font=f_chip)
    bw = tw + 44
    bx = W - pad - bw
    c.rounded_rectangle([bx, 26, W - pad, 68], radius=21, fill=VC[spec["verdict"]])
    c.text((bx + 22, 34), label, font=f_chip, fill=(255, 255, 255))

    y_top = head_h + H + pad
    for ci, col in enumerate(cols):
        x = pad + ci * (colw + 30)
        y = y_top
        for i, verdict, ls, h in col:
            c.ellipse([x, y + 4, x + 28, y + 32], fill=VC[verdict])
            t = str(i)
            tw = c.textlength(t, font=f_num)
            c.text((x + 14 - tw / 2, y + 3), t, font=f_num, fill=(255, 255, 255))
            for k, ln in enumerate(ls):
                c.text((x + 40, y + 2 + k * 24), ln, font=f_item, fill=C_TX)
            y += h

    lx = pad
    ly = head_h + H + panel_h - 40
    for name, color in (("成立", C_PASS), ("部分成立", C_PART), ("未成立", C_FAIL)):
        c.ellipse([lx, ly + 3, lx + 18, ly + 21], fill=color)
        c.text((lx + 26, ly), name, font=f_sub, fill=C_DIM)
        lx += 26 + c.textlength(name, font=f_sub) + 28

    out = OUTDIR / ("l3-5f-%s-check.png" % frame.lower())
    canvas.save(out)
    print("OUT", out, canvas.size)


if __name__ == "__main__":
    main()
