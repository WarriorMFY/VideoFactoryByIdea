"""SkillViewer：只读列出 Skill/<技能名> 的整棵挂载树，目录只列名称，每个文件附一句摘自其自身的描述。

用法：
  python view_tree.py <技能名|桶/技能>            # 打印到对话
  python view_tree.py <技能名> --out <目录>      # 留痕 <技能名>-tree.md
  python view_tree.py <技能名> --html <目录>     # 生成可折叠的单文件 HTML <技能名>-tree.html
  python view_tree.py <技能名> --full            # 描述不截断（默认首句，上限 120 字）
  python view_tree.py <技能名> --filter .md,.py   # 只看指定后缀的文件；默认全部展示
  python view_tree.py <技能名> --mode hover       # HTML 描述模式：hover 悬浮 / side 右侧常驻（默认 side）

边界：只读 Skill/ 下节点；目录不挂描述（描述归其内部 SKILL.md 自己所有），文件描述取自其自身（frontmatter description / 首标题 / 首引用 / docstring 首行 / 首注释 / JSON 顶层 description），取不到输出（无自带描述）；不编写、不跟随符号链接。HTML 为单文件、零外部依赖，数据同样来自只读抽取；页面内可按后缀过滤，鼠标悬停文件节点可显示其一句话描述。
"""
import ast
import html
import json
import re
import sys
from pathlib import Path

ROOT = next(p for p in Path(__file__).resolve().parents if (p / "Skill").is_dir() and (p / "Tool").is_dir())
SKILLS = ROOT / "Skill"
SENT_END = "。！？;"
NO_DESC = "（无自带描述）"

HTML_TPL = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__ · 挂载树</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; padding:24px; background:#f6f7f9; color:#1f2328;
         font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; }
  .wrap { max-width:1100px; margin:0 auto; background:#fff; border:1px solid #e1e4e8;
          border-radius:10px; padding:22px 26px 30px; box-shadow:0 1px 3px rgba(27,31,36,.04); }
  h1 { font-size:20px; margin:0 0 6px; font-weight:650; }
  h1 code { background:#f0f3f6; border-radius:5px; padding:2px 7px; font-size:18px; }
  .badge { font-size:11px; color:#57606a; border:1px solid #d0d7de; border-radius:20px;
           padding:2px 9px; margin-left:8px; vertical-align:middle; font-weight:500; }
  .meta { color:#57606a; font-size:12px; margin:0 0 16px; }
  .bar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding-bottom:14px; border-bottom:1px solid #eaeef2; margin-bottom:14px; }
  button { font:inherit; font-size:12px; padding:5px 12px; border:1px solid #d0d7de; background:#f6f8fa;
           color:#24292f; border-radius:6px; cursor:pointer; }
  button:hover { background:#eef1f4; }
  .hint { color:#8c959f; font-size:12px; margin-left:auto; }
  .rootline { padding:8px 10px; background:#f0f6ff; border:1px solid #d5e4f7; border-radius:6px; margin-bottom:12px; }
  .rootline .nm { font-weight:650; }
  ul.tree { list-style:none; margin:0; padding-left:18px; }
  ul.tree ul.tree { border-left:1px solid #eaeef2; margin-left:6px; }
  li { margin:2px 0; }
  summary { list-style:none; cursor:pointer; padding:3px 6px; border-radius:5px; display:flex; gap:8px; align-items:baseline; }
  summary::-webkit-details-marker { display:none; }
  summary:hover { background:#f6f8fa; }
  .leaf { padding:3px 6px 3px 20px; display:flex; gap:8px; align-items:baseline; }
  .ico { color:#0969da; font-size:11px; width:12px; flex:none; }
  .file .ico { color:#8c959f; }
  .nm { color:#24292f; font-family:ui-monospace,SFMono-Regular,Consolas,monospace; font-size:12.5px; }
  .ds { color:#57606a; font-size:12.5px; }
  .none { color:#a3aab2; font-style:italic; }
  .skill .nm { color:#1a7f37; font-weight:600; }
  .lbl { color:#57606a; font-size:12px; }
  .flt { padding:3px 9px; font-size:11.5px; border-radius:20px; opacity:.45; }
  .flt.active { opacity:1; background:#ddf4ff; border-color:#54aeff; color:#0550ae; }
  .flt[data-ext="*"].active { background:#dafbe1; border-color:#4ac26b; color:#116329; }
  #tree { min-height:24px; }
  .tip { position:relative; }
  .tip:hover { z-index:30; }
  body.mode-hover .ds { display:none; }
  body.mode-hover .tip:hover::after { content:attr(data-tip); position:absolute; left:10px; top:calc(100% - 1px);
           z-index:40; max-width:400px; min-width:180px; padding:7px 10px; border-radius:6px;
           background:#24292f; color:#f6f8fa; font-size:12px; line-height:1.5; white-space:normal;
           box-shadow:0 6px 18px rgba(27,31,36,.22); pointer-events:none; }
  .mode { padding:3px 10px; font-size:11.5px; border-radius:6px; opacity:.55; }
  .mode.active { opacity:1; background:#ddf4ff; border-color:#54aeff; color:#0550ae; }
  .empty { color:#8c959f; font-size:12px; padding:10px 6px; }
</style>
</head>
<body class="mode-__MODE__">
<div class="wrap">
  <h1><code>__TITLE__</code><span class="badge">SkillViewer · 挂载树</span></h1>
  <p class="meta">__STATS__ · 数据只读自 Skill/，描述摘自节点自身，未编写</p>
  <div class="bar">
    <button onclick="setAll(true)">全部展开</button>
    <button onclick="setAll(false)">全部折叠</button>
    <span class="lbl" style="margin-left:12px">描述</span>
    <button class="mode __SIDE_ACT__" data-mode="side" onclick="setMode('side')">右侧展示</button>
    <button class="mode __HOVER_ACT__" data-mode="hover" onclick="setMode('hover')">悬浮提示</button>
    <span class="lbl" style="margin-left:12px">文件类型</span>
    <span id="filters">__FILTERS__</span>
    <span class="hint">点目录名可展开／折叠该层</span>
  </div>
  <div class="rootline"><span class="ico">▸</span><span class="nm">__TITLE__/</span></div>
  <div id="tree">__TREE__</div>
</div>
<script>
function setAll(open) { document.querySelectorAll('details').forEach(function(d){ d.open = open; }); }
function setMode(mode) {
  document.body.className = 'mode-' + mode;
  document.querySelectorAll('.mode').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-mode') === mode);
  });
}
setMode('__MODE__');
function applyFilter() {
  var active = {};
  document.querySelectorAll('.flt.active').forEach(function(b){ active[b.getAttribute('data-ext')] = 1; });
  var nodes = Array.prototype.slice.call(document.querySelectorAll('#tree li')).reverse();
  nodes.forEach(function(li){
    if (li.hasAttribute('data-ext')) {
      li.style.display = active[li.getAttribute('data-ext')] ? '' : 'none';
    } else if (li.hasAttribute('data-dir')) {
      var ul = li.querySelector(':scope > details > ul.tree');
      var any = ul && Array.prototype.some.call(ul.children, function(c){ return c.style.display !== 'none'; });
      li.style.display = any ? '' : 'none';
    }
  });
}
document.querySelectorAll('.flt').forEach(function(b){
  b.addEventListener('click', function(){
    if (b.getAttribute('data-ext') === '*') {
      document.querySelectorAll('.flt').forEach(function(x){ x.classList.add('active'); });
    } else {
      b.classList.toggle('active');
    }
    applyFilter();
  });
});
</script>
</body>
</html>
"""


def first_sentence(text: str, full: bool) -> str:
    s = " ".join(str(text).split())
    s = s.strip().strip("\"'").strip()
    if not s:
        return ""
    if full:
        return s
    cut = len(s)
    for ch in SENT_END:
        i = s.find(ch)
        if 0 <= i < cut:
            cut = i + 1
    s = s[:cut]
    return s if len(s) <= 120 else s[:117] + "…"


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return ""


def yaml_description(text: str) -> str:
    """从 frontmatter 取 description（支持标量与 | 块），不引入 YAML 依赖。"""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return ""
    end = next((i for i in range(1, len(lines)) if lines[i].strip() == "---"), None)
    if end is None:
        return ""
    i = 1
    while i < end:
        line = lines[i]
        m = re.match(r"^description:\s*(.*)$", line)
        if m:
            val = m.group(1).strip()
            if val in ("|", ">"):
                block = []
                i += 1
                while i < end and (not lines[i].strip() or lines[i].startswith((" ", "\t"))):
                    block.append(lines[i].strip())
                    i += 1
                return " ".join(block)
            return val
        i += 1
    return ""


def first_md_sentence(path: Path) -> str:
    text = read_text(path)
    for line in text.splitlines():
        line = line.strip()
        if line == "---":
            continue
        if line.startswith("# "):
            return line[2:]
        if line.startswith("> "):
            return line[2:]
    for line in text.splitlines():
        if line.strip() and line.strip() != "---":
            return line.strip()
    return ""


def file_desc(path: Path, full: bool) -> str:
    suffix = path.suffix.lower()
    if suffix == ".md":
        raw = yaml_description(read_text(path)) or first_md_sentence(path)
    elif suffix == ".py":
        raw = ""
        text = read_text(path)
        try:
            doc = ast.get_docstring(ast.parse(text))
            if doc:
                raw = doc.splitlines()[0]
        except (SyntaxError, ValueError):
            pass
        if not raw:
            raw = next((l.lstrip("# ").strip() for l in text.splitlines() if l.startswith("#")), "")
    elif suffix == ".json":
        try:
            data = json.loads(read_text(path))
            raw = data.get("description", "") if isinstance(data, dict) else ""
        except (ValueError, TypeError):
            raw = ""
    else:
        raw = ""
    return first_sentence(raw, full)


def ext_of(name: str) -> str:
    """文件后缀（小写、含前导点）；无后缀及 .gitkeep 一类归为「（无后缀）」。"""
    if name.startswith(".") and name.count(".") == 1:
        return "（无后缀）"
    return Path(name).suffix.lower() or "（无后缀）"


def children_of(path: Path, exts: set = None) -> list:
    """目录在前、名字排序；exts 非空时只留后缀命中的文件，目录始终保留。"""
    def keep(e: Path) -> bool:
        if e.is_dir():
            return True
        return exts is None or ext_of(e.name) in exts
    return sorted(
        (e for e in path.iterdir() if not e.is_symlink() and keep(e)),
        key=lambda e: (not e.is_dir(), e.name.lower()),
    )


def has_visible(path: Path, exts: set) -> bool:
    """目录下是否还有任一可见节点（过滤后递归判空，避免留下空壳目录）。"""
    for e in children_of(path, exts):
        if not e.is_dir() or has_visible(e, exts):
            return True
    return False


def visible_entries(path: Path, exts: set) -> list:
    return [e for e in children_of(path, exts)
            if not e.is_dir() or has_visible(e, exts)]


def collect_exts(path: Path, exts: set) -> set:
    found = set()
    for e in children_of(path, exts):
        if e.is_dir():
            found |= collect_exts(e, exts)
        else:
            found.add(ext_of(e.name))
    return found


def node_desc(entry: Path, full: bool) -> str:
    """只用文件自身的描述；目录节点不挂描述（描述归它内部的 SKILL.md 自己所有）。"""
    return file_desc(entry, full) or NO_DESC if entry.is_file() else ""


def render(path: Path, prefix: str, full: bool, lines: list, exts: set = None) -> None:
    entries = visible_entries(path, exts)
    for idx, entry in enumerate(entries):
        last = idx == len(entries) - 1
        branch = "└── " if last else "├── "
        label = entry.name + ("/" if entry.is_dir() else "")
        if entry.is_dir():
            lines.append(f"{prefix}{branch}{label}")
            render(entry, prefix + ("    " if last else "│   "), full, lines, exts)
        else:
            lines.append(f"{prefix}{branch}{label}  ← {node_desc(entry, full)}")


def desc_html(desc: str) -> str:
    if desc == NO_DESC:
        return '<span class="ds none">' + html.escape(desc) + "</span>"
    return '<span class="ds">' + html.escape(desc) + "</span>"


def build_html(path: Path, full: bool, stat: dict, exts: set = None) -> str:
    entries = visible_entries(path, exts)
    if not entries:
        return ""
    parts = ['<ul class="tree">']
    for entry in entries:
        isdir = entry.is_dir()
        stat["nodes"] += 1
        stat["dirs" if isdir else "files"] += 1
        label = html.escape(entry.name + ("/" if isdir else ""))
        cls = "dir" if isdir else "file"
        if entry.name == "SKILL.md":
            cls += " skill"
        if isdir:
            inner = build_html(entry, full, stat, exts)
            parts.append(
                '<li class="' + cls + '" data-dir="1"><details open><summary>'
                '<span class="ico">▾</span><span class="nm">' + label + "</span></summary>"
                + inner + "</details></li>"
            )
        else:
            desc = node_desc(entry, full)
            if desc == NO_DESC:
                stat["nod"] += 1
            tip = html.escape(desc, quote=True)
            parts.append(
                '<li class="' + cls + '" data-ext="' + html.escape(ext_of(entry.name), quote=True) + '">'
                '<div class="leaf tip" data-tip="' + tip + '">'
                '<span class="ico">·</span><span class="nm">' + label + "</span>"
                + desc_html(desc) + "</div></li>"
            )
    parts.append("</ul>")
    return "".join(parts)


def write_html(skill: str, root: Path, full: bool, out_dir: Path, exts: set = None, mode: str = "side") -> Path:
    stat = {"nodes": 0, "dirs": 0, "files": 0, "nod": 0}
    tree = build_html(root, full, stat, exts=exts)
    stats = "节点 {nodes}（目录 {dirs} / 文件 {files}）· 文件无自带描述 {nod}".format(**stat)
    if exts is not None:
        stats += " · 生成时仅含 " + "/".join(sorted(exts))
    chips = ['<button class="flt active" data-ext="*">全部</button>']
    for ext in sorted(collect_exts(root, exts)):
        chips.append('<button class="flt active" data-ext="' + html.escape(ext, quote=True) + '">'
                     + html.escape(ext) + "</button>")
    out = (HTML_TPL
           .replace("__TITLE__", html.escape(skill))
           .replace("__MODE__", mode)
           .replace("__SIDE_ACT__", "active" if mode == "side" else "")
           .replace("__HOVER_ACT__", "active" if mode == "hover" else "")
           .replace("__STATS__", html.escape(stats))
           .replace("__FILTERS__", "".join(chips))
           .replace("__TREE__", tree))
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / f"{Path(skill).name}-tree.html"
    dest.write_text(out, encoding="utf-8")
    return dest


def take_opt(args: list, flag: str) -> tuple:
    if flag not in args:
        return None, args
    i = args.index(flag)
    if i + 1 >= len(args):
        print(f"错误：{flag} 后需跟目录", file=sys.stderr)
        raise SystemExit(2)
    return Path(args[i + 1]), args[:i] + args[i + 2:]


def take_opt_str(args: list, flag: str) -> tuple:
    if flag not in args:
        return None, args
    i = args.index(flag)
    if i + 1 >= len(args):
        print(f"错误：{flag} 后需跟后缀列表", file=sys.stderr)
        raise SystemExit(2)
    return args[i + 1], args[:i] + args[i + 2:]


def parse_filter(raw: str) -> set:
    """把 '.md,.py' 归一成后缀集合；空 / all / * 表示不过滤。"""
    if raw is None:
        return None
    parts = [x.strip().lower() for x in raw.split(",") if x.strip()]
    if not parts or any(p in ("all", "*") for p in parts):
        return None
    out = set()
    for p in parts:
        out.add(p if p.startswith(".") or p == "（无后缀）" else "." + p)
    return out


def main() -> int:
    args = sys.argv[1:]
    full = "--full" in args
    args = [a for a in args if a != "--full"]
    try:
        out_dir, args = take_opt(args, "--out")
        html_dir, args = take_opt(args, "--html")
        filter_raw, args = take_opt_str(args, "--filter")
        mode_raw, args = take_opt_str(args, "--mode")
    except SystemExit as e:
        return int(e.code)
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    skill = args[0].strip("/").replace("\\", "/")
    target = (SKILLS / skill).resolve()
    if SKILLS.resolve() not in target.parents or not target.is_dir() or target.is_symlink():
        print(f"错误：{target} 不是 Skill/ 下的目录", file=sys.stderr)
        return 2
    exts = parse_filter(filter_raw)
    mode = mode_raw.strip().lower() if mode_raw and mode_raw.strip().lower() in ("hover", "side") else "side"

    if html_dir is not None:
        dest = write_html(skill, target, full, html_dir, exts, mode)
        print(f"已生成 HTML：{dest}", file=sys.stderr)

    if html_dir is None or out_dir is not None:
        lines = [f"{skill}/"]
        render(target, "", full, lines, exts=exts)
        text = "\n".join(lines) + "\n"
        sys.stdout.write(text)
    if out_dir is not None:
        out_dir.mkdir(parents=True, exist_ok=True)
        dest = out_dir / f"{Path(skill).name}-tree.md"
        dest.write_text(text, encoding="utf-8")
        print(f"已留痕：{dest}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
