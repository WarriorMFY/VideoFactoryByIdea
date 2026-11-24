"""只读：统计 top40 的 webappId 覆盖率，并按族挑「可 API 调」的代表（零积分）。"""
import json
import re
from pathlib import Path

OUT = Path(__file__).resolve().parent
top = json.loads((OUT / "v2v-top40.json").read_text(encoding="utf-8"))
data = json.loads((OUT / "v2v-workflows.json").read_text(encoding="utf-8"))

GROUPS = [
    ("换脸/替换人物", r"换脸|face.?swap|替换|人物替换|人脸"),
    ("动作迁移/模仿", r"动作迁移|动作模仿|motion|跳舞|舞蹈|姿态"),
    ("对口型/配音", r"对口型|口型|lip.?sync|数字人|配音|说话"),
    ("视频续写/延长", r"续写|延长|extend|接续|续接"),
    ("首尾帧过渡", r"首尾帧|首帧|尾帧|first.?last|过渡|转场|transition"),
    ("去字幕/水印", r"去字幕|字幕擦除|去水印|watermark|subtitle"),
    ("插帧/补帧", r"插帧|补帧|interpolat|fps|帧率|流畅"),
    ("超分/清晰化", r"超分|清晰|高清|4k|1080p|upscale|画质"),
    ("风格化/转绘", r"风格化|转绘|重绘|styliz|动漫化|滤镜"),
    ("修复/去噪", r"修复|去噪|denoise|repair|去闪烁|稳像"),
    ("编辑/改内容", r"编辑|edit|改|替换内容|局部重绘|inpaint|remove|擦除"),
    ("多图/参考融合", r"参考|多图|融合|multimodal|主体"),
]


def group_of(txt):
    for name, pat in GROUPS:
        if re.search(pat, txt, re.I):
            return name
    return "其他/通用"


if __name__ == "__main__":
    have = [r for r in top if r.get("webappId")]
    print(f"top40 webappId 覆盖: {len(have)}/40")
    # 全量按族统计「有 webappId」需要 detail，成本高；只对 top40 分族
    per = {}
    for r in top:
        per.setdefault(group_of(f"{r['name']} {r['desc']}"), []).append(r)
    for g, rs in per.items():
        ok = [r for r in rs if r.get("webappId")]
        print(f"\n## {g}  top{len(rs)} 有app{len(ok)}")
        for r in (ok or rs)[:3]:
            print(f"  - {r['name'][:34]} use={r['use']} app={r.get('webappId') or '—'}")
    ms = [r for r in top if not r.get("webappId")]
    print(f"\n无 webappId（只能复制工作流、不能调 app）: {len(ms)}")
    for r in ms[:8]:
        print(f"  - {r['name'][:34]} use={r['use']}")
