#!/usr/bin/env bash
# Generates demo media into server/media:
#   players/<name>-64.webp, players/<name>-128.webp   (player photos, 1x/2x)
#   videos/match-N.mp4 + videos/match-N.webp          (match replay + poster frame)
#
# Video choices (see README "Images & video"):
#   - H.264 + yuv420p: plays in every browser
#   - -movflags +faststart: moves the index (moov atom) to the start of the file
#     so playback begins before the whole file has downloaded
#   - 640x360, CRF 30, no audio: small files for a demo
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p media/players media/videos

python3 scripts/make_avatars.py media/players

SOURCES=(
  "testsrc2=size=640x360:rate=30"
  "mandelbrot=size=640x360:rate=30"
  "life=size=640x360:rate=30:mold=10:ratio=0.2:death_color=#1b1f3a:life_color=#53e0b0"
  "cellauto=size=640x360:rate=30:rule=110"
  "smptehdbars=size=640x360:rate=30"
  "gradients=size=640x360:rate=30:speed=0.05"
)

for i in "${!SOURCES[@]}"; do
  n=$((i + 1))
  ffmpeg -loglevel error -y -f lavfi -i "${SOURCES[$i]}" -t 8 \
    -vf "format=yuv420p" -c:v libx264 -preset veryfast -crf 30 -an \
    -movflags +faststart "media/videos/match-$n.mp4"
  ffmpeg -loglevel error -y -ss 2 -i "media/videos/match-$n.mp4" -frames:v 1 \
    -vf "scale=320:-2" -c:v libwebp -quality 70 "media/videos/match-$n.webp"
done
echo "wrote ${#SOURCES[@]} videos + posters to media/videos"
du -sh media/players media/videos
