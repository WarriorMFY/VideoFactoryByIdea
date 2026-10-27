// 鎺掓煡锛歞rawtext 瀛椾綋璺緞杞箟鏂瑰紡锛屽摢绉嶈兘鐪熸鍔犺浇 CJK 瀛椾綋
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg, ROOT } from '../../Tool/lib/ff.mjs';

const outDir = path.join(ROOT, 'History', 'probe');
const fontDir = path.join(ROOT, 'Workspace', 'assets', 'fonts');
fs.mkdirSync(fontDir, { recursive: true });
fs.copyFileSync('C:/Windows/Fonts/simhei.ttf', path.join(fontDir, 'simhei.ttf'));

const variants = [
  ['v1_escaped', `fontfile=C\\:/Windows/Fonts/simhei.ttf`],
  ['v2_quoted', `fontfile='C\\:/Windows/Fonts/simhei.ttf'`],
  ['v3_double', `fontfile=C\\\\:/Windows/Fonts/simhei.ttf`],
  ['v4_family', `font=SimHei`],
  ['v5_relative', `fontfile=Workspace/assets/fonts/simhei.ttf`],
  ['v6_ws_escaped', `fontfile=${path.join(fontDir, 'simhei.ttf').replace(/\\/g, '/').replace(':', '\\:')}`],
];

for (const [name, f] of variants) {
  const out = path.join(outDir, `fontvari_${name}.jpg`);
  const vf = `drawtext=${f}:text='鍓緫宸ュ巶 CJK':fontsize=64:fontcolor=white:x=20:y=40`;
  const r = ffmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=900x160:d=1', '-vf', vf, '-frames:v', '1', out], path.join(outDir, `fontvari_${name}.log`));
  const sz = fs.existsSync(out) ? fs.statSync(out).size : 0;
  console.log(name, 'status=', r.status, 'bytes=', sz, r.status !== 0 ? r.text.split('\n').slice(-2).join(' | ') : '');
}
