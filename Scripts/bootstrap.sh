#!/usr/bin/env bash
# One-shot developer setup: tools, LibRaw xcframework, Xcode project generation.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
command -v xcodegen >/dev/null || brew install xcodegen
xcodebuild -showComponent MetalToolchain 2>/dev/null | grep -q "Status: installed" || xcodebuild -downloadComponent MetalToolchain
[[ -d "$ROOT/Packages/RawAICore/Binaries/CLibRaw.xcframework" ]] || "$ROOT/Scripts/build_libraw.sh"
(cd "$ROOT" && xcodegen generate --quiet)
echo "Done. Open $ROOT/RawAIBatch.xcodeproj"
