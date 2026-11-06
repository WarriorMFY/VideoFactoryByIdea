// 生成处决合集发布页 index.html（数据源 catalog_60.json）
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd(), '../..');
const CAT = path.join(ROOT, 'Prototype/loop38_exec_extract/catalog_60.json');
const SITE = path.join(ROOT, 'Workspace/site_exec_showcase');

const c = JSON.parse(fs.readFileSync(CAT, 'utf8'));
const U = c.units;
const total = U.reduce((s, u) => s + u.dur, 0);
const kinds = {};
for (const u of U) kinds[u.kind] = (kinds[u.kind] || 0) + 1;
const confBadges = {
  'cut-verified': ['切点验证', '#7fd6a4'],
  'verified': ['逐帧验证', '#7fd6a4'],
  'auto': ['自动提议', '#e0b060'],
};
let cards = '';
for (const u of U) {
  const id = String(u.id).padStart(2, '0');
  const cb = confBadges[u.conf] || ['存疑', '#e08080'];
  cards += `
  <div class="card" id="u${id}">
    <img loading="lazy" src="assets/u${id}.jpg" alt="#${id}">
    <div class="meta">
      <div class="hd"><span class="pid">#${id}</span><span class="kind k-${u.kind}">${u.kind}</span>
        <span class="ttl">${u.scene} · ${u.move}</span>
        <span class="conf" style="color:${cb[1]}">${cb[0]}</span></div>
      <div class="tc">源 ${u.t.toFixed(2)}s 起 · 时长 ${u.dur.toFixed(2)}s</div>
    </div>
  </div>`;
}
const kindChips = Object.entries(kinds).map(([k, n]) => `<span class="chip">${k} ${n}</span>`).join(' ');

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>影之刃零 · 处决单位合集（46）</title><style>
:root{--bg:#0d0f12;--card:#16191e;--line:#2a2f37;--txt:#e8eaee;--dim:#9aa3af;--gold:#ffc850}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:28px 18px 70px}
.wrap{max-width:1080px;margin:0 auto}
h1{font-size:22px;margin:0 0 8px}.sub{color:var(--dim);font-size:13.5px;line-height:1.9;margin-bottom:18px}.sub b{color:var(--gold)}
.chip{display:inline-block;font-size:12px;border:1px solid var(--line);border-radius:14px;padding:3px 12px;margin-right:8px;color:#cfd6de}
video{width:100%;border-radius:12px;background:#000;display:block;margin-bottom:26px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.card img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#000}
.meta{padding:11px 13px}
.hd{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.pid{font-family:ui-monospace,Consolas,monospace;color:var(--gold);font-size:14px;font-weight:700}
.kind{font-size:11px;border-radius:11px;padding:2px 8px;border:1px solid #4a4030;color:#ffd98a}
.k-仪式级{border-color:#8a3a3a;color:#ff9d9d;background:rgba(138,58,58,.18)}
.k-快杀{border-color:#3a5a8a;color:#9dc4ff;background:rgba(58,90,138,.15)}
.ttl{font-size:13.5px;font-weight:600;flex:1 1 100%;order:3}
.conf{font-size:11px;margin-left:auto}
.tc{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:var(--dim);margin-top:6px}
.foot{color:var(--dim);font-size:12.5px;line-height:1.9;border-top:1px solid var(--line);padding-top:16px;margin-top:28px}
</style></head><body><div class="wrap">
<h1>影之刃零 · 处决单位合集</h1>
<div class="sub">
  共 <b>${U.length}</b> 个完整处决单位 · 合计 <b>${total.toFixed(1)}s</b> · ${kindChips}<br>
  边界按「触发/抓取 → 命中 → 收招 → 余韵」规则逐帧核验，段内含内部切机位，尸体落定后收束。<br>
  上方合集片为 <b>1280×720 / 60fps</b> 转码预览版（原片与入库母版为 1920×1080 / 60fps CRF18，未插帧）。
</div>
<video src="showcase_720p60.mp4" controls playsinline preload="metadata" poster="assets/u01.jpg"></video>
<div class="grid">${cards}
</div>
<div class="foot">
  源片：影之刃零（1080P60）官方演示 · 处决合集段 173.0s ｜ 抽取工线：exec_extract（YDIF 动势 + scene 切点 + 逐帧目验）<br>
  边界含 0.3–0.5s 余韵；「切点验证」= 起止边界与真实剪辑切点重合。素材已按 sha256 入库 Material/library（185 条 / 928.9MB）。
</div>
</div></body></html>`;

fs.mkdirSync(SITE, { recursive: true });
fs.writeFileSync(path.join(SITE, 'index.html'), html);
console.log('ok ->', path.join(SITE, 'index.html'), 'units', U.length, 'total', total.toFixed(1) + 's');
