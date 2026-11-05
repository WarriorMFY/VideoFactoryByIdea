#!/usr/bin/env bash
# loop28 v2 —— 逐帧慢放 + 动力链弧线版（39.5s / 1280x720）
# 前置：Workspace/tmp/ign_yt/source.mp4、cards/intro.png、cards/outro.png、build/chain{A,B,C}.ass
# 复现：bash build_v2.sh   （gen_chain.mjs 改锚点后重跑即可）
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/../.."; cd "$ROOT"
FF="Workspace/deps/ffmpeg/ffmpeg.exe"
SRC="Workspace/tmp/ign_yt/source.mp4"
LP="Prototype/loop28_weapon_breakdown"

$FF -hide_banner -loglevel error -y \
  -loop 1 -t 4      -i $LP/cards/intro.png \
  -ss 302.4 -t 3.0  -i "$SRC" \
  -ss 319.5 -t 2.0  -i "$SRC" \
  -ss 378.4 -t 2.5  -i "$SRC" \
  -loop 1 -t 5.5    -i $LP/cards/outro.png \
  -f lavfi -t 4     -i anullsrc=r=48000:cl=stereo \
  -f lavfi -t 5.5   -i anullsrc=r=48000:cl=stereo \
  -filter_complex "\
[0:v]scale=1280:720,setsar=1,fps=30,format=yuv420p[v0];\
[1:v]setpts=4*PTS,scale=1280:720:flags=lanczos,ass=$LP/build/chainA.ass,fps=30,format=yuv420p[v1];\
[2:v]setpts=4*PTS,scale=1280:720:flags=lanczos,ass=$LP/build/chainB.ass,fps=30,format=yuv420p[v2];\
[3:v]setpts=4*PTS,eq=gamma=1.35:brightness=0.04:saturation=1.12,scale=1280:720:flags=lanczos,ass=$LP/build/chainC.ass,fps=30,format=yuv420p[v3];\
[4:v]scale=1280:720,setsar=1,fps=30,format=yuv420p[v4];\
[1:a]atempo=0.5,atempo=0.5,loudnorm=I=-16:TP=-1.5,aresample=48000,aformat=channel_layouts=stereo[a1];\
[2:a]atempo=0.5,atempo=0.5,loudnorm=I=-16:TP=-1.5,aresample=48000,aformat=channel_layouts=stereo[a2];\
[3:a]atempo=0.5,atempo=0.5,loudnorm=I=-16:TP=-1.5,aresample=48000,aformat=channel_layouts=stereo[a3];\
[5:a]anull[as0];[6:a]anull[as4];\
[v0][as0][v1][a1][v2][a2][v3][a3][v4][as4]concat=n=5:v=1:a=1[v][a]" \
  -map "[v]" -map "[a]" \
  -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p \
  -c:a aac -b:a 160k \
  $LP/out_v2.mp4
echo "OK $LP/out_v2.mp4"
