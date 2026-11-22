"""首帧统一裁成 3:4 并切掉右下角工具水印。只读 frames/ 里的原图，写到 frames/。"""
from PIL import Image
from pathlib import Path

F = Path(__file__).parent / "frames"
picks = {
    "S1.png": "绢本设色立轴_中国工笔重彩人物画_宋人院体笔意_夜里的道院一_2026-11-22T12-57-51.png",
    "S2.png": "绢本设色_中国画空景小品_宋人笔意_一处道院的矮墙下_一株白_2026-11-22T12-59-37.png",
    "S3.png": "绢本_中国画_白描向设色过渡的一瞬_画面中央土中抽出一支白牡_2026-11-22T12-58-54.png",
}
for name, src in picks.items():
    im = Image.open(F / src).convert("RGB")
    w, h = im.size
    target_h = round(w * 4 / 3)          # 3:4，从底部切
    im2 = im.crop((0, 0, w, target_h))
    im2.save(F / name, quality=95)
    print(f"{name}  {w}x{h} -> {im2.size[0]}x{im2.size[1]}")
