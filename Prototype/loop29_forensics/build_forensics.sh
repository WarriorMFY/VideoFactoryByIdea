#!/usr/bin/env bash
# loop29 · 逐帧取证试片（14.4s / 1280x720 / 无声）
# 关键：不用 input seek（该源上会落 keyframe 导致错帧，见 ops.md 坑30），
#       改为单输入 split + trim 精确切片，一次解码全解决。
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/../.."; cd "$ROOT"
FF="Workspace/deps/ffmpeg/ffmpeg.exe"
SRC="Workspace/tmp/ign_yt/source.mp4"
LP="Prototype/loop29_forensics"
C="$LP/build"

GRADE="eq=gamma=1.18:brightness=0.015:saturation=1.06"

$FF -hide_banner -loglevel error -y \
  -t 305 -i "$SRC" \
  -f lavfi -t 2.6 -i color=c=black:s=1280x720:r=30 \
  -f lavfi -t 4.0 -i color=c=black:s=1280x720:r=30 \
  -filter_complex "\
[0:v]split=5[m0][m1][m2][m3][m4];\
[m0]trim=302.45:303.6167,setpts=PTS-STARTPTS,fps=30,scale=1280:720:flags=lanczos,$GRADE,ass=$C/cap_s1.ass,format=yuv420p[v1];\
[m1]trim=302.5667:302.8333,setpts=6.6667*(PTS-STARTPTS),fps=30,scale=1280:720:flags=lanczos,$GRADE,ass=$C/cap_s2.ass,format=yuv420p[v2];\
[m2]trim=302.9667:303.5333,setpts=3.3333*(PTS-STARTPTS),fps=30,scale=1280:720:flags=lanczos,$GRADE,ass=$C/cap_s3.ass,format=yuv420p[v3];\
[m3]trim=303.5333:303.9667,setpts=4*(PTS-STARTPTS),fps=30,scale=1280:720:flags=lanczos,$GRADE,ass=$C/cap_s4.ass,format=yuv420p[v4];\
[m4]trim=303.8667:304.1667,setpts=4*(PTS-STARTPTS),fps=30,scale=1280:720:flags=lanczos,$GRADE,ass=$C/cap_s5.ass,format=yuv420p[v5];\
[1:v]ass=$C/cap_s0.ass,fps=30,format=yuv420p[v0];\
[2:v]ass=$C/cap_s6.ass,fps=30,format=yuv420p[v6];\
[v0][v1][v2][v3][v4][v5][v6]concat=n=7:v=1:a=0[v]" \
  -map "[v]" -an \
  -c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p -movflags +faststart \
  $LP/out_forensics.mp4
echo "OK $LP/out_forensics.mp4"
