"""像素锚点工具：合成 compose / 多主体掩码 masks / 对齐度量 score / 时序锚 pair

用法：
  python Tool/anchor.py compose --anchor mecha.png --plate plate.png --out first.png
  python Tool/anchor.py masks  --src shot.png --boxes '[{"name":"机甲","box":[0.25,0.04,0.76,1.0]}]' --outdir anchors
  python Tool/anchor.py score  --anchor mecha.png --frame first.png --rematte
  python Tool/anchor.py pair   --video shot.mp4 --outdir shots

依赖：OpenCV/Pillow 在 Tool/_deps；rembg+onnxruntime 在 Tool/_deps_matte（模型同目录 models/）。
坐标一律用 0-1 比例，不写像素——换分辨率不用改参数。
"""
import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "_deps"))
sys.path.insert(0, str(ROOT / "_deps_matte"))
os.environ.setdefault("U2NET_HOME", str(ROOT / "_deps_matte" / "models"))

import cv2
import numpy as np


# ---------- 公共 ----------
def imread_u(path):
    return cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_UNCHANGED)


def imsave(path, img):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    ok, buf = cv2.imencode("." + path.rsplit(".", 1)[-1], img)
    if not ok:
        raise RuntimeError(f"encode failed: {path}")
    buf.tofile(path)


def decontaminate(rgb, a, r=4):
    """边缘去污染：用内部颜色覆盖主体边缘残留的背景色（白边/光晕的根因）"""
    inner = cv2.erode((a > 128).astype(np.uint8) * 255, np.ones((2 * r + 1,) * 2, np.uint8))
    w = inner.astype(np.float32) / 255.0
    num = cv2.blur(rgb.astype(np.float32) * w[..., None], (2 * r + 1, 2 * r + 1))
    den = cv2.blur(w, (2 * r + 1, 2 * r + 1))[..., None]
    filled = num / np.maximum(den, 1e-4)
    band = ((a > 30) & (inner == 0)).astype(np.float32)[..., None]
    return np.clip(rgb.astype(np.float32) * (1 - band) + filled * band, 0, 255)


def add_rim(canvas, a, ox, oy, color, strength):
    """沿轮廓加左向边光，让主体与新背景咬合"""
    h, w = a.shape
    band = cv2.subtract(cv2.dilate(a, np.ones((9, 9), np.uint8)), a)
    ramp = np.repeat(np.linspace(1.0, 0.0, w)[None, :], h, axis=0)
    wgt = (band / 255.0) * ramp * strength
    ys, xs = np.where(wgt > 0.002)
    ys2, xs2 = ys + oy, xs + ox
    keep = (ys2 >= 0) & (ys2 < canvas.shape[0]) & (xs2 >= 0) & (xs2 < canvas.shape[1])
    for c in range(3):
        canvas[ys2[keep], xs2[keep], c] = np.clip(
            canvas[ys2[keep], xs2[keep], c] + wgt[ys[keep], xs[keep]] * color[c], 0, 255)


def alpha_bbox(a, thr=100):
    ys, xs = np.where(a > thr)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


# ---------- compose ----------
def cmd_compose(args):
    plate = imread_u(args.plate)
    plate = cv2.resize(plate, (int(plate.shape[1] * 1080 / plate.shape[0]), 1080), interpolation=cv2.INTER_AREA)
    H, W = plate.shape[:2]
    canvas = plate.astype(np.float32)

    rgba = imread_u(args.anchor)
    sub, a = rgba[:, :, :3], rgba[:, :, 3]
    x0, _, x1, _ = alpha_bbox(a)
    # 竖直方向保持原图上下沿：锚点可能本来就被原画切掉了脚/头，不能二次裁
    sub, a = sub[:, x0:x1], a[:, x0:x1]

    gy, target_h = int(H * args.ground), int(H * args.hf)
    s = target_h / sub.shape[0]
    nw, nh = int(sub.shape[1] * s), int(sub.shape[0] * s)
    sub_r = cv2.resize(sub, (nw, nh), interpolation=cv2.INTER_AREA)
    a_r = cv2.resize(a, (nw, nh), interpolation=cv2.INTER_AREA)
    ox, oy = int(W * args.cx - nw / 2), gy - nh

    # 接触阴影
    sh = np.zeros((H, W), np.float32)
    cv2.ellipse(sh, (int(W * args.cx), gy + int(H * 0.004)), (int(nw * 0.52), int(H * 0.035)), 0, 0, 360, 1.0, -1)
    canvas *= (1 - cv2.GaussianBlur(sh, (0, 0), H * 0.018)[..., None] * args.shadow)

    # 湿地倒影
    if args.reflect > 0:
        ref = cv2.flip(decontaminate(sub_r, a_r, 4), 0)
        ref = cv2.resize(ref, (nw, max(1, int(nh * 0.62))), interpolation=cv2.INTER_AREA)
        ra = cv2.resize(cv2.flip(a_r, 0), (nw, ref.shape[0]))
        ra = cv2.GaussianBlur(ra, (0, 0), 9) * np.linspace(1.0, 0.0, ref.shape[0])[:, None] * args.reflect
        ys, xs = np.where(ra > 1)
        ys2, xs2 = ys + gy, xs + ox
        keep = (ys2 < H) & (ys2 >= 0) & (xs2 >= 0) & (xs2 < W)
        for c in range(3):
            w_ = ra[ys, xs][keep] / 255.0
            canvas[ys2[keep], xs2[keep], c] = canvas[ys2[keep], xs2[keep], c] * (1 - w_) + ref[ys, xs][keep, c] * w_

    # 主体合成：亮度/色偏对齐 + 去污染 + alpha 内缩
    sub_f = decontaminate(sub_r, a_r, 6)
    a_r = cv2.GaussianBlur(cv2.erode((a_r > 128).astype(np.uint8) * 255,
                                    np.ones((2 * args.shrink + 1,) * 2, np.uint8)), (3, 3), 0)
    vis = a_r > 20
    patch = canvas[max(0, oy):min(H, oy + nh), max(0, ox):min(W, ox + nw)]
    if vis.sum() > 100 and patch.size > 0:
        m_sub, m_pl = sub_f[vis].mean(0), patch.reshape(-1, 3).mean(0)
        sub_f = sub_f * float(np.clip(m_pl.mean() / max(m_sub.mean(), 1e-3), 0.55, 2.2))
        sub_f = sub_f + ((m_pl - m_pl.mean()) * 0.45)[None, None, :]
    ys, xs = np.where(a_r > 0)
    ys2, xs2 = ys + oy, xs + ox
    keep = (ys2 >= 0) & (ys2 < H) & (xs2 >= 0) & (xs2 < W)
    for c in range(3):
        wgt = a_r[ys, xs][keep] / 255.0
        canvas[ys2[keep], xs2[keep], c] = canvas[ys2[keep], xs2[keep], c] * (1 - wgt) + sub_f[ys, xs][keep, c] * wgt

    add_rim(canvas, a_r, ox, oy, (255, 205, 150), args.rim)

    # 雾气 + 颗粒
    if args.fog > 0:
        fog_col = canvas[H // 2:H // 2 + 60].reshape(-1, 3).mean(0)
        grad = (np.clip((np.linspace(1.0, 0.0, H) - 0.15) / 0.85, 0, 1)[:, None, None] ** 1.6)
        canvas = canvas * (1 - grad * args.fog) + fog_col[None, None, :] * grad * args.fog
    if args.grain > 0:
        canvas = canvas + np.random.normal(0, args.grain, (H, W, 1)).repeat(3, axis=2)

    out = np.clip(canvas, 0, 255).astype(np.uint8)
    imsave(args.out, out)
    print(json.dumps(dict(out=args.out, size=[W, H], subject_wh=[nw, nh], ground_px=gy, cx_px=int(W * args.cx),
                          anchor_box=[int(x0), 0, int(x1), int(sub.shape[0])]), ensure_ascii=False))


# ---------- masks ----------
def cmd_masks(args):
    from rembg import remove, new_session

    img = imread_u(args.src)
    H, W = img.shape[:2]
    sess = new_session(args.model)
    report, tiles = [], []
    for it in json.loads(args.boxes):
        x0, y0, x1, y1 = [int(v * (W if i % 2 == 0 else H)) for i, v in enumerate(it["box"])]
        crop = img[y0:y1, x0:x1]
        rgba = np.array(remove(crop, session=sess, only_mask=False))
        cover = float((rgba[:, :, 3] > 128).mean() * 100)
        out = os.path.join(args.outdir, f"{it['name']}-rgba.png")
        imsave(out, rgba)
        th, tw = crop.shape[:2]
        t = cv2.resize(rgba, (max(1, int(tw * 196 / max(th, tw))), max(1, int(th * 196 / max(th, tw)))))
        tile = np.full((240, 220, 3), 40, np.uint8)
        aa = t[:, :, 3][..., None] / 255.0
        oy2, ox2 = 36, max(0, (220 - t.shape[1]) // 2)
        dst = tile[oy2:oy2 + t.shape[0], ox2:ox2 + t.shape[1]]
        dst[:] = (t[:, :, :3] * aa + dst * (1 - aa)).astype(np.uint8)
        cv2.putText(tile, f"{it['name']} {cover:.0f}%", (6, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (235, 235, 235), 1, cv2.LINE_AA)
        tiles.append(tile)
        report.append(dict(name=it["name"], px=[x1 - x0, y1 - y0], cover_pct=round(cover, 1), file=out))
    imsave(os.path.join(args.outdir, "contact-sheet.png"), np.hstack(tiles) if tiles else np.zeros((240, 220, 3), np.uint8))
    print(json.dumps(report, ensure_ascii=False))


# ---------- score ----------
def place_alpha(a, target_h, W, H, cx, ground):
    """把锚点 alpha 按合成参数放回画面坐标（必须复刻 compose 的横向裁剪，否则整体错位）"""
    cols = np.where(a.max(axis=0) > 100)[0]
    if cols.size:
        a = a[:, cols.min():cols.max() + 1]
    s = target_h / a.shape[0]
    nw, nh = int(a.shape[1] * s), int(a.shape[0] * s)
    ra = cv2.resize(a, (nw, nh), interpolation=cv2.INTER_NEAREST)
    canvas = np.zeros((H, W), np.uint8)
    ox, oy = int(W * cx - nw / 2), int(H * ground - nh)
    canvas[max(0, oy):oy + nh, max(0, ox):ox + nw] = ra[:max(0, H - oy), :max(0, W - ox)]
    return canvas


def halo_ratio(frame, mask):
    """边缘外圈亮度 / 内圈亮度。>1.15 视为有白边光晕"""
    m = (mask > 128).astype(np.uint8)
    out_b = (cv2.dilate(m, np.ones((5, 5), np.uint8)) - m) > 0
    in_b = (m - cv2.erode(m, np.ones((5, 5), np.uint8))) > 0
    g = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(np.float32)
    if out_b.sum() < 50 or in_b.sum() < 50:
        return 0.0
    return float(g[out_b].mean() / max(g[in_b].mean(), 1e-3))


def cmd_score(args):
    anchor, frame = imread_u(args.anchor), imread_u(args.frame)
    H, W = frame.shape[:2]
    m_ref = place_alpha(anchor[:, :, 3], int(H * args.hf), W, H, args.cx, args.ground)

    if args.rematte:
        from rembg import remove, new_session
        r = np.array(remove(frame, session=new_session(args.model), only_mask=True))
        m_meas = r if r.ndim == 2 else r[:, :, 0]
    else:
        m_meas = m_ref

    inter = ((m_ref > 128) & (m_meas > 128)).sum()
    union = ((m_ref > 128) | (m_meas > 128)).sum()
    iou = float(inter / max(union, 1))

    try:
        from skimage.metrics import structural_similarity as ssim
        g1 = cv2.resize(cv2.cvtColor(anchor[:, :, :3], cv2.COLOR_BGR2GRAY), (W, H))
        ss = float(ssim(g1, cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), data_range=255))
    except Exception:
        ss = -1.0

    orb = cv2.ORB_create(2000)
    k1, d1 = orb.detectAndCompute(anchor[:, :, :3], None)
    k2, d2 = orb.detectAndCompute(frame, None)
    rate = 0.0
    if d1 is not None and d2 is not None:
        good = [m for m in cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(d1, d2) if m.distance < 70]
        rate = len(good) / max(len(k1), 1)

    print(json.dumps(dict(mask_iou=round(iou, 4), ssim=round(ss, 4), orb_match_rate=round(rate, 4),
                          halo_ratio=round(halo_ratio(frame, m_ref), 3),
                          ref_area_pct=round(float((m_ref > 128).mean() * 100), 1),
                          meas_area_pct=round(float((m_meas > 128).mean() * 100), 1)), ensure_ascii=False))


# ---------- pair ----------
def cmd_pair(args):
    cap = cv2.VideoCapture(args.video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    frames = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(f)
    cap.release()

    hist = []
    for f in frames:
        h = cv2.calcHist([cv2.cvtColor(f, cv2.COLOR_BGR2HSV)], [0, 1], None, [40, 40], [0, 180, 0, 256])
        cv2.normalize(h, h)
        hist.append(h)
    d = np.array([0.0] + [1 - cv2.compareHist(hist[i - 1], hist[i], cv2.HISTCMP_CORREL) for i in range(1, len(frames))])
    thr = d.mean() + 6 * d.std()
    cuts, last = [], -8
    for c in [i for i in range(1, len(d)) if d[i] > thr]:
        if c - last >= 8:  # 变焦到顶/闪白造成的伪切点
            cuts.append(c)
            last = c
    while cuts and len(d) - 1 - cuts[-1] < 8:
        cuts.pop()

    bounds = [0] + cuts + [len(frames)]
    shots = []
    for i in range(len(bounds) - 1):
        s, e = bounds[i], bounds[i + 1] - 1
        if e - s < 2:
            continue
        g1 = cv2.cvtColor(frames[s], cv2.COLOR_BGR2GRAY)
        g2 = cv2.cvtColor(frames[e], cv2.COLOR_BGR2GRAY)
        flow = cv2.calcOpticalFlowFarneback(g1, g2, None, 0.5, 3, 21, 3, 5, 1.2, 0)
        mag, ang = cv2.cartToPolar(flow[..., 0], flow[..., 1])
        name = f"shot{i + 1:02d}"
        p1 = os.path.join(args.outdir, f"{name}-first.png")
        p2 = os.path.join(args.outdir, f"{name}-last.png")
        imsave(p1, frames[s])
        imsave(p2, frames[e])
        pair = np.hstack([frames[s], frames[e]])
        cv2.putText(pair, f"{name} {s}-{e} flow {mag.mean():.2f}px", (8, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (240, 240, 240), 1, cv2.LINE_AA)
        imsave(os.path.join(args.outdir, f"{name}-pair.png"), cv2.resize(pair, (pair.shape[1] // 2, pair.shape[0] // 2)))
        shots.append(dict(shot=name, frames=[s, e], seconds=[round(s / fps, 2), round(e / fps, 2)],
                          flow_mean_px=round(float(mag.mean()), 2), flow_p95_px=round(float(np.percentile(mag, 95)), 2),
                          flow_angle_deg=round(float(np.degrees(np.median(ang))), 1), first=p1, last=p2))
    print(json.dumps(dict(video=args.video, fps=fps, frames=len(frames), shots=shots), ensure_ascii=False))


def main():
    ap = argparse.ArgumentParser(description="像素锚点工具")
    sub = ap.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("compose", help="把锚点合成进新背景板")
    c.add_argument("--anchor", required=True)
    c.add_argument("--plate", required=True)
    c.add_argument("--out", required=True)
    c.add_argument("--ground", type=float, default=0.84)
    c.add_argument("--cx", type=float, default=0.5)
    c.add_argument("--hf", type=float, default=0.52)
    c.add_argument("--reflect", type=float, default=0.08)
    c.add_argument("--fog", type=float, default=0.16)
    c.add_argument("--shadow", type=float, default=0.62)
    c.add_argument("--grain", type=float, default=3.5)
    c.add_argument("--rim", type=float, default=0.08)
    c.add_argument("--shrink", type=int, default=2)
    c.set_defaults(func=cmd_compose)

    m = sub.add_parser("masks", help="按框一次抠出多个独立锚点")
    m.add_argument("--src", required=True)
    m.add_argument("--boxes", required=True, help='JSON: [{"name":"机甲","box":[x0,y0,x1,y1]}]')
    m.add_argument("--outdir", required=True)
    m.add_argument("--model", default="isnet-general-use")
    m.set_defaults(func=cmd_masks)

    s = sub.add_parser("score", help="对齐度量：像不像锚点")
    s.add_argument("--anchor", required=True)
    s.add_argument("--frame", required=True)
    s.add_argument("--hf", type=float, default=0.52)
    s.add_argument("--cx", type=float, default=0.5)
    s.add_argument("--ground", type=float, default=0.84)
    s.add_argument("--rematte", action="store_true")
    s.add_argument("--model", default="isnet-general-use")
    s.set_defaults(func=cmd_score)

    p = sub.add_parser("pair", help="切镜头并配首尾帧对")
    p.add_argument("--video", required=True)
    p.add_argument("--outdir", required=True)
    p.set_defaults(func=cmd_pair)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
