"""Build constraint-class matrix: which endpoints carry which anchor slots."""
import io, json, re, collections

CAP = r"F:\AgentWorkArea\WorkBuddy\CardStudio\Skill\hub\generation\runninghub\data\capabilities.json"
IDX = r"F:\AgentWorkArea\WorkBuddy\CardStudio\Log\Circle21\llms_index_en.txt"
d = json.load(io.open(CAP, encoding="utf-8"))
eps = d["endpoints"]

VIDEO_TASKS = {
    "text-to-video", "image-to-video", "start-end-to-video", "reference-to-video",
    "multimodal-video", "motion-control", "video-extend", "video-edit",
    "video-transition", "video-to-video", "lip-sync-video", "video-upscale",
    "video-frame-interpolation", "video-fps-increase", "video-denoise",
}

def slots(e):
    imgs = [p for p in e.get("params", []) if p.get("type") == "IMAGE"]
    vids = [p for p in e.get("params", []) if p.get("type") == "VIDEO"]
    auds = [p for p in e.get("params", []) if p.get("type") == "AUDIO"]
    keys = " ".join((p.get("key") or "").lower() for p in imgs)
    return {
        "img": imgs, "vid": vids, "aud": auds,
        "first": ("first" in keys) or (len(imgs) == 1 and not imgs[0].get("multiple")),
        "last": "last" in keys,
        "ref": any(p.get("multiple") or (p.get("maxCount") or 0) > 1 for p in imgs),
        "vidsrc": len(vids) > 0,
    }

mat = collections.defaultdict(lambda: collections.Counter())
for e in eps:
    t = e.get("task")
    s = slots(e)
    cls = []
    if s["vid"]: cls.append("V+")
    if s["last"]: cls.append("首尾")
    elif s["first"]: cls.append("首帧")
    if s["ref"]: cls.append("多图参考")
    if s["aud"]: cls.append("音频")
    if not cls: cls.append("纯文本")
    mat[t]["/".join(cls)] += 1

for t in sorted(mat, key=lambda x: -sum(mat[x].values())):
    print(f"{t:<26} " + "  ".join(f"{k}:{v}" for k, v in mat[t].most_common()))

# official one-line descriptions for a few key endpoints
text = io.open(IDX, encoding="utf-8").read()
want = ["kling-video-o1/start-to-end", "kling-v3.0-pro-motion-control",
        "wan-2.7/video-extend", "kling-video-o3-pro/video-edit",
        "kling-video-o1-std/refrence-to-video", "rh-video-upscaler",
        "topazlabs-video-frame-interpolation", "kling-lip-sync/lip-sync-video"]
print("\n== official blurbs ==")
for w in want:
    i = text.find("[" + w + "]")
    if i < 0:
        print(f"{w}: (not found)")
        continue
    seg = text[i:i + 900]
    m = re.search(r"\.md\):\s*(.+)", seg)
    desc = (m.group(1) if m else seg).split("\n")[0]
    print(f"\n* {w}\n  {desc[:420]}")
