#!/usr/bin/env bash
# Downloads a small set of CC0 sample files from raw.pixls.us into Fixtures/raw (git-ignored).
# Only used for tests during development; the app itself never accesses the network.
set -euo pipefail
DEST="$(cd "$(dirname "$0")/.." && pwd)/Fixtures/raw"
mkdir -p "$DEST"
BASE="https://raw.pixls.us/data"
while read -r path name; do
  [[ -f "$DEST/$name" ]] || curl -fL --retry 2 -o "$DEST/$name" "$BASE/$path"
done <<'LIST'
Canon/EOS%205D%20Mark%20III/5G4A9394.CR2 Canon_5DMkIII.CR2
Nikon/D750/compressed_12_bit.NEF Nikon_D750.NEF
Nikon/Z%206/DSC_0750.NEF Nikon_Z6.NEF
Sony/ILCE-7M3/UNCOMPRESSED_14bit.ARW Sony_A7III.ARW
Fujifilm/X-T3/AFXT2720.RAF Fuji_XT3.RAF
Leica/M10/f5381888.dng Leica_M10.dng
Canon/EOS%205D%20Mark%20III/M24-1221_000202.dng Canon_5DMkIII_converted.dng
Canon/EOS%20Digital%20Rebel%20XT/IMG_8728.CR2 Canon_350D_portrait.CR2
LIST
ls -la "$DEST"

# Face detection sample (NASA portrait, public domain, via scikit-image)
FACES="$(dirname "$DEST")/faces"
mkdir -p "$FACES"
[[ -f "$FACES/astronaut.png" ]] || curl -fL --retry 2 -o "$FACES/astronaut.png" https://raw.githubusercontent.com/scikit-image/scikit-image/v0.22.0/skimage/data/astronaut.png

# JPEG fixture with EXIF, converted locally from the NEF
# (macOS only; skipped elsewhere)
command -v sips >/dev/null || exit 0
[[ -f "$DEST/Nikon_D750_sips.jpg" ]] || sips -s format jpeg -Z 2000 "$DEST/Nikon_D750.NEF" --out "$DEST/Nikon_D750_sips.jpg" >/dev/null
