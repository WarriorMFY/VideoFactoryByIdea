"""只读：读 PNG 内嵌元数据（ComfyUI 常把 workflow/prompt 写进 tEXt），
对比 880 组与 1086 组的实际工作流差异。"""
import json
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIR = ROOT / "Log/Circle8/output/v3-fixed10"
KEYS = ("EmptyLatentImage", "EmptySD3LatentImage", "KSampler", "KSamplerAdvanced",
        "CheckpointLoaderSimple", "UNETLoader", "CLIPLoader", "VAELoader",
        "ImageScale", "ImageScaleBy", "UpscaleModelLoader", "LatentUpscale",
        "SaveImage", "CLIPTextEncode", "BasicScheduler", "ModelSamplingAuraFlow",
        "FluxGuidance", "ConditioningZeroOut")

for name in sys.argv[1:] or ["portrait-01.png", "portrait-02.png"]:
    p = DIR / name
    with Image.open(p) as im:
        size = im.size
        text = dict(getattr(im, "text", {}) or {})
        info_keys = sorted(im.info)
    print(f"\n=== {name}  {size[0]}x{size[1]}  MB={p.stat().st_size//1024}K")
    print("  info 键:", info_keys)
    print("  text 键:", list(text))
    raw = text.get("prompt") or text.get("workflow") or ""
    if not raw:
        print("  → 无内嵌工作流")
        continue
    try:
        wf = json.loads(raw)
    except json.JSONDecodeError:
        print("  → 内嵌文本非 JSON，前 200 字:", raw[:200])
        continue
    print(f"  → 内嵌 {len(wf)} 个节点")
    for nid, node in sorted(wf.items(), key=lambda kv: str(kv[0])):
        ct = node.get("class_type", "")
        if ct in KEYS:
            inputs = {k: v for k, v in (node.get("inputs") or {}).items()
                      if not isinstance(v, list)}
            keep = {k: v for k, v in inputs.items()
                    if k in ("width", "height", "seed", "noise_seed", "steps", "cfg",
                             "ckpt_name", "unet_name", "vae_name", "model_name",
                             "filename_prefix", "scale_by", "upscale_method", "batch_size",
                             "text", "scheduler", "denoise", "sampler_name")}
            if "text" in keep:
                keep["text"] = str(keep["text"])[:40] + "…"
            print(f"    {nid:>4} {ct:<26} {keep}")
