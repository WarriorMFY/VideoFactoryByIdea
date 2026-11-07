#!/bin/bash
# kb_audit.sh — 摘要视频「运动平滑度」审计
# 只采样画面中部（避开底部字幕 / 顶部角标），剔除转场窗口，评估纯 Ken Burns 运动是否匀速。
# 用法: bash Tool/check/kb_audit.sh <video.mp4> [标签]
FF=Workspace/deps/ffmpeg/ffmpeg.exe
TMPD=Workspace/tmp/kbaudit; mkdir -p $TMPD
V="$1"; TAG="${2:-$1}"
TSV="$TMPD/kb_$$.txt"
$FF -hide_banner -loglevel error -i "$V" \
  -vf "crop=iw*0.6:ih*0.4:iw*0.2:ih*0.26,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" \
  -f null - 2>/dev/null | grep -o "YAVG=[0-9.]*" | sed 's/YAVG=//' > "$TSV"
node -e "
const fs=require('fs');
const v=fs.readFileSync('$TSV','utf8').trim().split('\n').map(Number).filter(x=>x>0);
// 剔除转场窗口（差异 > 1.2 视为交叉淡化），只保留段内匀速运动
const seg=v.filter(x=>x>0.005&&x<1.2);
const m=seg.reduce((a,b)=>a+b,0)/seg.length;
const sd=Math.sqrt(seg.reduce((a,b)=>a+(b-m)**2,0)/seg.length);
const s=[...seg].sort((a,b)=>a-b);
const p5=s[Math.floor(seg.length*0.05)], p95=s[Math.floor(seg.length*0.95)];
let jerk=0; for(let i=1;i<seg.length;i++) if(Math.abs(seg[i]-seg[i-1])>0.25*m) jerk++;
console.log('['+'$TAG'+']  样本 '+seg.length+' 帧');
console.log('  mean='+m.toFixed(4)+'  sd='+sd.toFixed(4)+'  CV='+(sd/m*100).toFixed(1)+'%   <- 越小越匀速');
console.log('  p5='+p5.toFixed(3)+'  p95='+p95.toFixed(3)+'  极差比='+(p95/Math.max(p5,1e-4)).toFixed(1)+'x');
console.log('  顿挫(相邻帧差跳变>25%均值)='+jerk+' 次');
"
rm -f "$TSV"
