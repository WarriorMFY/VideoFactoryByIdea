"""只读：把 8720 条「视频生视频」工作流按用途归类，输出分组与 top40 表（零积分）。"""
import json
import re
from collections import Counter
from pathlib import Path

OUT = Path(__file__).resolve().parent
data = json.loads((OUT / "v2v-workflows.json").read_text(encoding="utf-8"))
rows = data["rows"]
top = json.loads((OUT / "v2v-top40.json").read_text(encoding="utf-8"))

GROUPS = [
    ("换脸/替换人物", r"换脸|face.?swap|替换|人物替换|人脸"),
    ("对口型/配音", r"对口型|口型|lip.?sync|数字人|配音|说话"),
    ("动作迁移/模仿", r"动作迁移|动作模仿|motion|跳舞|舞蹈|姿态"),
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
OTHER = "其他/通用"


def hit(txt):
    for name, pat in GROUPS:
        if re.search(pat, txt, re.I):
            return name
    return OTHER


lines = []
lines.append(f"# 视频生视频工作流（标签 1871131343570333697）共 {data['total']} 条\n")
groups = {}
for r in rows:
    g = hit(f"{r['name']} {r['desc']}")
    groups.setdefault(g, []).append(r)

lines.append("## 用途分组")
lines.append("| 组 | 条数 | 合计使用 | 最热三条 |")
lines.append("| --- | --- | --- | --- |")
for g, rs in sorted(groups.items(), key=lambda kv: -len(kv[1])):
    rs.sort(key=lambda x: -x["use"])
    tot = sum(x["use"] for x in rs)
    hot = "；".join(f"{x['name'][:26]}({x['use']})" for x in rs[:3])
    lines.append(f"| {g} | {len(rs)} | {tot} | {hot} |")

lines.append("\n## 使用量 top40")
lines.append("| # | 名称 | 使用 | 收藏 | 发布 | webappId | 背后模型 |")
lines.append("| --- | --- | --- | --- | --- | --- | --- |")
for i, r in enumerate(top, 1):
    models = ",".join((r.get("usedModels") or [])[:3])
    lines.append(f"| {i} | {r['name'][:30]} | {r['use']} | {r['collect']} | {r['pub']} | "
                 f"{r.get('webappId') or '—'} | {models} |")

mc = Counter()
for r in top:
    for m in (r.get("usedModels") or []):
        mc[m] += 1
lines.append("\n## top40 背后模型出现次数")
lines.append("、".join(f"{m}×{c}" for m, c in mc.most_common(25)) )

(OUT / "v2v-groups.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
print("saved v2v-groups.md")
for g, rs in sorted(groups.items(), key=lambda kv: -len(kv[1])):
    print(f"{g}\t{len(rs)}\t{sum(x['use'] for x in rs)}")
