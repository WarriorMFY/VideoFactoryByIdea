// 瀛椾綋娓叉煋楠岃瘉锛氱敤鍚屼竴濂?lib/ff.mjs 鐜锛堣嚜寤?fonts.conf锛夋祴璇?CJK 鏄惁姝ｅ父鍑哄瓧
import path from 'node:path';
import { ffmpeg, ROOT } from '../../Tool/lib/ff.mjs';

const outDir = path.join(ROOT, 'History', 'probe');
const fonts = [
  ['simhei', 'C\\:/Windows/Fonts/simhei.ttf'],
  ['msyhbd', 'C\\:/Windows/Fonts/msyhbd.ttc'],
  ['dengb', 'C\\:/Windows/Fonts/Dengb.ttf'],
];
for (const [name, font] of fonts) {
  const out = path.join(outDir, `font_${name}.jpg`);
  const vf = `drawtext=fontfile=${font}:text='鍓緫宸ュ巶 CJK 娴嬭瘯':fontsize=64:fontcolor=white:x=20:y=40`;
  const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=900x160:d=1', '-vf', vf, '-frames:v', '1', out], path.join(outDir, `font_${name}.log`));
  console.log(name, 'status=', r.status, r.status === 0 ? 'OK' : r.text.split('\n').slice(-3).join(' | '));
}
