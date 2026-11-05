#!/usr/bin/env bash
# Builds LibRaw from source into a static arm64 xcframework (Packages/RawAICore/Binaries/CLibRaw.xcframework).
# Static linking avoids shipping/notarizing an extra dylib inside the .app bundle.
# Optional features (lossy-DNG JPEG, JPEG2000, LCMS, OpenMP) are disabled to keep zero third-party runtime deps;
# zlib (deflate DNG) comes from the macOS SDK; it is wired via CPPFLAGS because configure probes zlib through pkg-config.
set -euo pipefail

LIBRAW_VERSION="${LIBRAW_VERSION:-0.21.4}"
LIBRAW_SHA256="${LIBRAW_SHA256:-6be43f19397e43214ff56aab056bf3ff4925ca14012ce5a1538a172406a09e63}"
MIN_MACOS="${MIN_MACOS:-14.0}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/Vendor"
SRC_DIR="$VENDOR/src"
BUILD_DIR="$VENDOR/build/libraw"
OUT="$ROOT/Packages/RawAICore/Binaries/CLibRaw.xcframework"
TARBALL="$SRC_DIR/LibRaw-$LIBRAW_VERSION.tar.gz"

mkdir -p "$SRC_DIR"
if [[ ! -f "$TARBALL" ]]; then
  curl -fL "https://www.libraw.org/data/LibRaw-$LIBRAW_VERSION.tar.gz" -o "$TARBALL"
fi
if [[ -n "$LIBRAW_SHA256" ]]; then
  echo "$LIBRAW_SHA256  $TARBALL" | shasum -a 256 -c -
fi

rm -rf "$BUILD_DIR" "$OUT"
mkdir -p "$(dirname "$OUT")"
mkdir -p "$BUILD_DIR"
tar xzf "$TARBALL" -C "$BUILD_DIR" --strip-components 1

SDK="$(xcrun --sdk macosx --show-sdk-path)"
FLAGS="-arch arm64 -isysroot $SDK -mmacosx-version-min=$MIN_MACOS -O3 -fPIC -w"

pushd "$BUILD_DIR" >/dev/null
./configure \
  --host=aarch64-apple-darwin \
  --prefix="$BUILD_DIR/_prefix" \
  --enable-static --disable-shared \
  --disable-openmp --disable-jpeg --disable-jasper --disable-lcms --disable-examples \
  --disable-zlib CPPFLAGS="-DUSE_ZLIB" LIBS="-lz" \
  CC="$(xcrun -f clang)" CXX="$(xcrun -f clang++)" \
  CFLAGS="$FLAGS" CXXFLAGS="$FLAGS -std=c++14" LDFLAGS="$FLAGS" >/dev/null
make -j"$(sysctl -n hw.ncpu)" >/dev/null 2>&1 || make >/dev/null
make install >/dev/null
popd >/dev/null

HEADERS="$BUILD_DIR/xcf_headers"
mkdir -p "$HEADERS"
cp -R "$BUILD_DIR/_prefix/include/libraw" "$HEADERS/"
cat > "$HEADERS/module.modulemap" <<'MAP'
module CLibRaw {
    header "libraw/libraw.h"
    link "z"
    link "c++"
    export *
}
MAP

xcodebuild -create-xcframework \
  -library "$BUILD_DIR/_prefix/lib/libraw_r.a" \
  -headers "$HEADERS" \
  -output "$OUT" >/dev/null

echo "LibRaw $LIBRAW_VERSION -> $OUT"
