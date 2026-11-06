// 生成 index.html（移动端友好：卡片式布局 + 内嵌播放器 + 帧图）
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ev = JSON.parse(readFileSync(join(ROOT, 'build/events.json'), 'utf8'));

const rows = ev.map(r => `<tr>
<td class='id'>${r.id}</td>
<td class='nm'><span class='seg'>${r.name}</span><span class='input'>${r.input}</span></td>
<td class='tc'>${r.a}–${r.b}s<span class='pk'>发力峰 ${r.pk}s</span></td>
<td class='media'>
  <video controls preload="none" poster="frames/zmj_${r.id}.jpg" playsinline>
    <source src="clips/zmj_${r.id}.mp4" type="video/mp4">
  </video>
</td>
<td class='desc'>${r.desc}<div class='meta'>原速 ${r.dur}s → 0.7× 动捕实速 ${(r.dur * 1.4).toFixed(1)}s</div></td>
</tr>`).join('\n');

const html = `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>紫冥剑 · 动作拆解表</title><style>
*{box-sizing:border-box}
body{font-family:-apple-system,'Microsoft YaHei',sans-serif;background:#171310;color:#e8e0d0;margin:0;padding:20px 16px 48px}
h1{font-size:19px;color:#ffc850;margin:0 0 6px;line-height:1.4}
.sub{color:#9a8f7a;font-size:12px;line-height:1.7;margin-bottom:16px;max-width:760px}
table{border-collapse:collapse;width:100%;font-size:13px}
th{background:#2a241c;color:#ffc850;padding:8px 10px;text-align:left;border-bottom:2px solid #4a3f2c;font-weight:600}
td{padding:12px 10px;border-bottom:1px solid #2e2820;vertical-align:top}
td.id{color:#ffc850;font-weight:700;font-size:15px;width:34px}
.seg{color:#f0e6d2;font-weight:600;display:block;line-height:1.4}
.input{color:#8fd0ff;font-size:11px;display:block;margin-top:3px;letter-spacing:.5px}
.tc{white-space:nowrap;color:#c8b890;font-size:12px}.pk{display:block;color:#7a6f58;font-size:10px;margin-top:3px}
video{width:100%;max-width:340px;border:1px solid #4a3f2c;background:#000;display:block}
.desc{max-width:460px;line-height:1.65;font-size:12.5px}
.meta{color:#7a6f58;font-size:11px;margin-top:6px}
tr:hover{background:#1e1811}
@media(max-width:760px){
  body{padding:14px 10px 40px}
  thead{display:none}
  table,tbody,tr,td{display:block;width:100%}
  tr{border-bottom:1px solid #2e2820;padding:14px 4px;position:relative}
  td{border:0;padding:4px 0}
  td.id{position:absolute;left:4px;top:14px;width:auto}
  td.nm{padding-left:34px}
  td.tc{margin-top:2px;padding-left:34px}
  td.media{padding-left:34px;margin:8px 0}
  video{max-width:100%}
  td.desc{padding-left:34px}
}
</style></head><body>
<h1>紫冥剑 · 动作单元拆解表</h1>
<div class="sub">源：IGN《影之刃零》全单手武器招式演示 288–399s（真 1080p）· 拆解粒度：标注段 → 段内发力事件 · 全部视频 <b>0.7× 动捕实速</b>（setpts=1.4 逆推）· 画面左上角为源片真实时间码 · 共 ${ev.length} 个动作单元</div>
<table><thead><tr><th>#</th><th>招式段 / 输入</th><th>源时间码</th><th>动作视频（点开播放）</th><th>招式说明</th></tr></thead>
<tbody>
${rows}
</tbody></table></body></html>`;
writeFileSync(join(ROOT, 'index.html'), html);
console.log('index.html written,', ev.length, 'rows');
