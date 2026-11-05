#!/usr/bin/env bash
# loop28 v4 —— 还原动捕速率版（0.7×，全片 20s / 1280x720）
# 变更：v3 的 0.25× 慢放改为 0.7×——比游戏内 1× 慢一档（游戏把动捕动画提速约 1.4×播放），
#       即回到"演员原始动捕速度"；动作小节字幕与古谱纸笺按新时间轴重排。
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/../.."; cd "$ROOT"
FF="Workspace/deps/ffmpeg/ffmpeg.exe"
SRC="Workspace/tmp/ign_yt/source.mp4"
LP="Prototype/loop28_weapon_breakdown"
P="$LP/plates"
PX=26; PY=26
SP=1.4      # setpts 系数 → 1/1.4 = 0.714x
AT=0.7143   # 音频同步 atempo

$FF -hide_banner -loglevel error -y \
  -loop 1 -t 4      -i $LP/cards/intro.png \
  -ss 302.4 -t 3.0  -i "$SRC" \
  -ss 319.5 -t 2.0  -i "$SRC" \
  -ss 378.4 -t 2.5  -i "$SRC" \
  -loop 1 -t 5.5    -i $LP/cards/outro.png \
  -f lavfi -t 4     -i anullsrc=r=48000:cl=stereo \
  -f lavfi -t 5.5   -i anullsrc=r=48000:cl=stereo \
  -loop 1 -t 4.2 -i $P/pA1.png \
  -loop 1 -t 4.2 -i $P/pA2.png \
  -loop 1 -t 4.2 -i $P/pA3.png \
  -loop 1 -t 2.8 -i $P/pB1.png \
  -loop 1 -t 2.8 -i $P/pB2.png \
  -loop 1 -t 2.8 -i $P/pB3.png \
  -loop 1 -t 3.5 -i $P/pC1.png \
  -loop 1 -t 3.5 -i $P/pC2.png \
  -loop 1 -t 3.5 -i $P/pC3.png \
  -filter_complex "\
[0:v]scale=1280:720,setsar=1,fps=30,format=yuv420p[v0];\
[1:v]setpts=$SP*PTS,scale=1280:720:flags=lanczos,ass=$LP/build/cap4A.ass,fps=30,format=yuv420p[v1];\
[2:v]setpts=$SP*PTS,scale=1280:720:flags=lanczos,ass=$LP/build/cap4B.ass,fps=30,format=yuv420p[v2];\
[3:v]setpts=$SP*PTS,eq=gamma=1.35:brightness=0.04:saturation=1.12,scale=1280:720:flags=lanczos,ass=$LP/build/cap4C.ass,fps=30,format=yuv420p[v3];\
[4:v]scale=1280:720,setsar=1,fps=30,format=yuv420p[v4];\
[1:a]atempo=$AT,loudnorm=I=-16:TP=-1.5,aresample=48000,aformat=channel_layouts=stereo[a1];\
[2:a]atempo=$AT,loudnorm=I=-16:TP=-1.5,aresample=48000,aformat=channel_layouts=stereo[a2];\
[3:a]atempo=$AT,loudnorm=I=-16:TP=-1.5,aresample=48000,aformat=channel_layouts=stereo[a3];\
[5:a]anull[as0];[6:a]anull[as4];\
[7:v]format=rgba,fade=t=in:st=0.12:d=0.15:alpha=1,fade=t=out:st=1.28:d=0.15:alpha=1[fa1];\
[8:v]format=rgba,fade=t=in:st=1.47:d=0.15:alpha=1,fade=t=out:st=2.62:d=0.15:alpha=1[fa2];\
[9:v]format=rgba,fade=t=in:st=2.80:d=0.15:alpha=1,fade=t=out:st=4.02:d=0.15:alpha=1[fa3];\
[10:v]format=rgba,fade=t=in:st=0.12:d=0.15:alpha=1,fade=t=out:st=0.87:d=0.15:alpha=1[fb1];\
[11:v]format=rgba,fade=t=in:st=1.05:d=0.15:alpha=1,fade=t=out:st=1.50:d=0.15:alpha=1[fb2];\
[12:v]format=rgba,fade=t=in:st=1.68:d=0.15:alpha=1,fade=t=out:st=2.62:d=0.15:alpha=1[fb3];\
[13:v]format=rgba,fade=t=in:st=0.12:d=0.15:alpha=1,fade=t=out:st=1.08:d=0.15:alpha=1[fc1];\
[14:v]format=rgba,fade=t=in:st=1.26:d=0.15:alpha=1,fade=t=out:st=2.20:d=0.15:alpha=1[fc2];\
[15:v]format=rgba,fade=t=in:st=2.38:d=0.15:alpha=1,fade=t=out:st=3.32:d=0.15:alpha=1[fc3];\
[v1][fa1]overlay=x=W-w-$PX:y=H-h-$PY:enable='between(t,0.12,1.45)'[v1a];\
[v1a][fa2]overlay=x=W-w-$PX:y=H-h-$PY:enable='between(t,1.47,2.78)'[v1b];\
[v1b][fa3]overlay=x=W-w-$PX:y=H-h-$PY:enable='between(t,2.80,4.2)'[v1c];\
[v2][fb1]overlay=x=W-w-$PX:y=H-h-$PY:enable='between(t,0.12,1.03)'[v2a];\
[v2a][fb2]overlay=x=W-w-$PX:y=H-h-$PY:enable='between(t,1.05,1.66)'[v2b];\
[v2b][fb3]overlay=x=W-w-$PX:y=H-h-$PY:enable='between(t,1.68,2.8)'[v2c];\
[v3][fc1]overlay=x=W-w-$PX:y=H-h-$PY:enable='between(t,0.12,1.24)'[v3a];\
[v3a][fc2]overlay=x=W-w-$PX:y=H-h-$PY:enable='between(t,1.26,2.36)'[v3b];\
[v3b][fc3]overlay=x=W-w-$PX:y=H-h-$PY:enable='between(t,2.38,3.5)'[v3c];\
[v0][as0][v1c][a1][v2c][a2][v3c][a3][v4][as4]concat=n=5:v=1:a=1[v][a]" \
  -map "[v]" -map "[a]" \
  -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p \
  -c:a aac -b:a 160k \
  $LP/out_v4.mp4
echo "OK $LP/out_v4.mp4"
