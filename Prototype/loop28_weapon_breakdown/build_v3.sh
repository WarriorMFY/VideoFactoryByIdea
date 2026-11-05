#!/usr/bin/env bash
# loop28 v3 —— 逐帧慢放 + 右下角古谱纸笺版（39.5s / 1280x720）
# 变更：去掉动力链弧线（v2 效果一般）；每动作小节右下角贴明代兵书木刻风古谱插图
# 前置：cards/intro.png outro.png、build/cap{A,B,C}.ass、plates/p*.png、源片
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/../.."; cd "$ROOT"
FF="Workspace/deps/ffmpeg/ffmpeg.exe"
SRC="Workspace/tmp/ign_yt/source.mp4"
LP="Prototype/loop28_weapon_breakdown"
P="$LP/plates"
PX=26; PY=26   # 纸笺贴右下角边距

$FF -hide_banner -loglevel error -y \
  -loop 1 -t 4      -i $LP/cards/intro.png \
  -ss 302.4 -t 3.0  -i "$SRC" \
  -ss 319.5 -t 2.0  -i "$SRC" \
  -ss 378.4 -t 2.5  -i "$SRC" \
  -loop 1 -t 5.5    -i $LP/cards/outro.png \
  -f lavfi -t 4     -i anullsrc=r=48000:cl=stereo \
  -f lavfi -t 5.5   -i anullsrc=r=48000:cl=stereo \
  -loop 1 -t 12 -i $P/pA1.png \
  -loop 1 -t 12 -i $P/pA2.png \
  -loop 1 -t 12 -i $P/pA3.png \
  -loop 1 -t 8  -i $P/pB1.png \
  -loop 1 -t 8  -i $P/pB2.png \
  -loop 1 -t 8  -i $P/pB3.png \
  -loop 1 -t 10 -i $P/pC1.png \
  -loop 1 -t 10 -i $P/pC2.png \
  -loop 1 -t 10 -i $P/pC3.png \
  -filter_complex "\
[0:v]scale=1280:720,setsar=1,fps=30,format=yuv420p[v0];\
[1:v]setpts=4*PTS,scale=1280:720:flags=lanczos,ass=$LP/build/capA.ass,fps=30,format=yuv420p[v1];\
[2:v]setpts=4*PTS,scale=1280:720:flags=lanczos,ass=$LP/build/capB.ass,fps=30,format=yuv420p[v2];\
[3:v]setpts=4*PTS,eq=gamma=1.35:brightness=0.04:saturation=1.12,scale=1280:720:flags=lanczos,ass=$LP/build/capC.ass,fps=30,format=yuv420p[v3];\
[4:v]scale=1280:720,setsar=1,fps=30,format=yuv420p[v4];\
[1:a]atempo=0.5,atempo=0.5,loudnorm=I=-16:TP=-1.5,aresample=48000,aformat=channel_layouts=stereo[a1];\
[2:a]atempo=0.5,atempo=0.5,loudnorm=I=-16:TP=-1.5,aresample=48000,aformat=channel_layouts=stereo[a2];\
[3:a]atempo=0.5,atempo=0.5,loudnorm=I=-16:TP=-1.5,aresample=48000,aformat=channel_layouts=stereo[a3];\
[5:a]anull[as0];[6:a]anull[as4];\
[7:v]format=rgba,fade=t=in:st=0.30:d=0.30:alpha=1,fade=t=out:st=3.70:d=0.30:alpha=1[fa1];\
[8:v]format=rgba,fade=t=in:st=4.20:d=0.30:alpha=1,fade=t=out:st=7.50:d=0.30:alpha=1[fa2];\
[9:v]format=rgba,fade=t=in:st=8.00:d=0.30:alpha=1,fade=t=out:st=11.40:d=0.30:alpha=1[fa3];\
[10:v]format=rgba,fade=t=in:st=0.30:d=0.30:alpha=1,fade=t=out:st=2.50:d=0.30:alpha=1[fb1];\
[11:v]format=rgba,fade=t=in:st=3.00:d=0.30:alpha=1,fade=t=out:st=4.30:d=0.30:alpha=1[fb2];\
[12:v]format=rgba,fade=t=in:st=4.80:d=0.30:alpha=1,fade=t=out:st=7.40:d=0.30:alpha=1[fb3];\
[13:v]format=rgba,fade=t=in:st=0.30:d=0.30:alpha=1,fade=t=out:st=3.10:d=0.30:alpha=1[fc1];\
[14:v]format=rgba,fade=t=in:st=3.60:d=0.30:alpha=1,fade=t=out:st=6.30:d=0.30:alpha=1[fc2];\
[15:v]format=rgba,fade=t=in:st=6.80:d=0.30:alpha=1,fade=t=out:st=9.40:d=0.30:alpha=1[fc3];\
[v1][fa1]overlay=x=W-w-$PX:y=H-h-$PY:enable='between(t,0.3,4.2)'[v1a];\
[v1a][fa2]overlay=x=W-w-$PX:y=H-h-$PY:enable='between(t,4.2,8.0)'[v1b];\
[v1b][fa3]overlay=x=W-w-$PX:y=H-h-$PY:enable='between(t,8.0,12)'[v1c];\
[v2][fb1]overlay=x=W-w-$PX:y=H-h-$PY:enable='between(t,0.3,3.0)'[v2a];\
[v2a][fb2]overlay=x=W-w-$PX:y=H-h-$PY:enable='between(t,3.0,4.8)'[v2b];\
[v2b][fb3]overlay=x=W-w-$PX:y=H-h-$PY:enable='between(t,4.8,8)'[v2c];\
[v3][fc1]overlay=x=W-w-$PX:y=H-h-$PY:enable='between(t,0.3,3.6)'[v3a];\
[v3a][fc2]overlay=x=W-w-$PX:y=H-h-$PY:enable='between(t,3.6,6.8)'[v3b];\
[v3b][fc3]overlay=x=W-w-$PX:y=H-h-$PY:enable='between(t,6.8,10)'[v3c];\
[v0][as0][v1c][a1][v2c][a2][v3c][a3][v4][as4]concat=n=5:v=1:a=1[v][a]" \
  -map "[v]" -map "[a]" \
  -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p \
  -c:a aac -b:a 160k \
  $LP/out_v3.mp4
echo "OK $LP/out_v3.mp4"
