#!/usr/bin/env bash
# ============================================================================
# contact-sheet.sh — one image to eyeball a whole video or a QA run.
#
#   contact-sheet.sh video out/reel.mp4 [cols] [rows]     frames sampled evenly
#   contact-sheet.sh cuts  out/reel.mp4                   one tile per scene cut
#   contact-sheet.sh shots qa-shots desktop [cols]        tile QA screenshots
#   contact-sheet.sh audio out/audio.wav                  waveform + loudness
#
# Output lands next to the input (…_sheet.jpg / …_wave.png). Needs ffmpeg.
# Reading the sheet: look for type clipped at frame edges, HUD collisions,
# text-on-field contrast, dead frames, and cuts that land between beats.
# ============================================================================
set -euo pipefail
mode=${1:-}; src=${2:-}
[[ -z "$mode" || -z "$src" ]] && { sed -n '4,9p' "$0"; exit 1; }

case "$mode" in
  video)
    cols=${3:-6}; rows=${4:-5}
    dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src")
    n=$((cols * rows))
    fps=$(awk -v n="$n" -v d="$dur" 'BEGIN { printf "%.5f", n / d }')
    ffmpeg -v error -y -i "$src" -vf "fps=${fps},scale=480:-2,tile=${cols}x${rows}:padding=4:color=black" -frames:v 1 -q:v 3 "${src%.*}_sheet.jpg"
    echo "${src%.*}_sheet.jpg"
    ;;
  cuts)
    # scene-change detection: tiles show the first frame after each hard cut
    ffmpeg -v error -y -i "$src" -vf "select='gt(scene,0.3)',scale=480:-2,tile=6x4:padding=4" -fps_mode vfr -frames:v 1 -q:v 3 "${src%.*}_cuts.jpg"
    echo "${src%.*}_cuts.jpg"
    ;;
  shots)
    prefix=${3:-desktop}; cols=${4:-4}
    ffmpeg -v error -y -pattern_type glob -i "$src/${prefix}_*.jpg" -vf "scale=360:-2,tile=${cols}x10:padding=4" -frames:v 1 -q:v 3 "$src/${prefix}_sheet.jpg"
    echo "$src/${prefix}_sheet.jpg"
    ;;
  audio)
    # You cannot listen: verify by eye (hits on beats, silence before the final hit) and by numbers.
    ffmpeg -v error -y -i "$src" -filter_complex "color=c=black:s=1800x360[bg];[0:a]showwavespic=s=1800x360:split_channels=1:colors=white[w];[bg][w]overlay=shortest=1" -frames:v 1 "${src%.*}_wave.png"
    ffmpeg -hide_banner -nostats -i "$src" -af ebur128=peak=true:framelog=quiet -f null - 2>&1 | grep -A14 Summary || true
    echo "${src%.*}_wave.png"
    ;;
  *) echo "unknown mode: $mode"; exit 1 ;;
esac
