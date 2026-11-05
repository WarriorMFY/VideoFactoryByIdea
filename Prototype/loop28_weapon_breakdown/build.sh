#!/usr/bin/env bash
# loop28 构建脚本 —— 紫冥剑三招拆解短视频（39.5s / 1280x720）
# 单命令 filter_complex 拼装（concat 滤镜），避免中间文件时基/音频流错乱
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/../.."; cd "$ROOT"
FF="Workspace/deps/ffmpeg/ffmpeg.exe"
SRC="Workspace/tmp/ign_yt/source.mp4"
LP="Prototype/loop28_weapon_breakdown"

$FF -hide_banner -loglevel error -y \
  -loop 1 -t 4   -i $LP/cards/intro.png \
  -ss 295 -t 10  -i "$SRC" \
  -ss 315 -t 10  -i "$SRC" \
  -ss 376 -t 10  -i "$SRC" \
  -loop 1 -t 5.5 -i $LP/cards/outro.png \
  -f lavfi -t 4   -i anullsrc=r=48000:cl=stereo \
  -f lavfi -t 5.5 -i anullsrc=r=48000:cl=stereo \
  -filter_complex "\
[0:v]scale=1280:720,setsar=1,fps=30,format=yuv420p[v0];\
[1:v]scale=1280:720:flags=lanczos,ass=$LP/build/clip1.ass,fps=30,format=yuv420p[v1];\
[2:v]scale=1280:720:flags=lanczos,ass=$LP/build/clip2.ass,fps=30,format=yuv420p[v2];\
[3:v]scale=1280:720:flags=lanczos,ass=$LP/build/clip3.ass,fps=30,format=yuv420p[v3];\
[4:v]scale=1280:720,setsar=1,fps=30,format=yuv420p[v4];\
[1:a]loudnorm=I=-16:TP=-1.5,aresample=48000,aformat=channel_layouts=stereo[a1];\
[2:a]loudnorm=I=-16:TP=-1.5,aresample=48000,aformat=channel_layouts=stereo[a2];\
[3:a]loudnorm=I=-16:TP=-1.5,aresample=48000,aformat=channel_layouts=stereo[a3];\
[5:a]anull[as0];[6:a]anull[as4];\
[v0][as0][v1][a1][v2][a2][v3][a3][v4][as4]concat=n=5:v=1:a=1[v][a]" \
  -map "[v]" -map "[a]" \
  -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p \
  -c:a aac -b:a 160k \
  $LP/out.mp4
echo "OK $LP/out.mp4"
