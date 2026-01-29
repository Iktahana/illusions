#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC_DIR="${ROOT_DIR}/quicklook/MDIQuickLook"
OUT_DIR="${ROOT_DIR}/build/quicklook/MDIQuickLook.qlgenerator/Contents"

mkdir -p "${OUT_DIR}/MacOS" "${OUT_DIR}/Resources"

cp "${SRC_DIR}/Info.plist" "${OUT_DIR}/Info.plist"

xcrun swiftc \
  -O \
  -module-name MDIQuickLook \
  -emit-library \
  -Xlinker -bundle \
  -target arm64-apple-macos11 \
  -target x86_64-apple-macos10.13 \
  -framework QuickLook \
  -framework Cocoa \
  -framework UniformTypeIdentifiers \
  "${SRC_DIR}/Source/MDIQuickLook.swift" \
  -o "${OUT_DIR}/MacOS/MDIQuickLook"

echo "Built ${OUT_DIR}/MacOS/MDIQuickLook"
