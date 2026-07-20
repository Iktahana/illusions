#!/usr/bin/env bash
set -euo pipefail

# Builds the MDI Quick Look Preview Extension (.appex).
#
# Modern macOS (Big Sur+, Apple Silicon) no longer loads legacy `.qlgenerator`
# plug-ins, so the preview is provided by a Quick Look Preview Extension whose
# principal class conforms to `QLPreviewingController`. The resulting bundle is
# embedded into illusions.app/Contents/PlugIns by electron-builder.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC_DIR="${ROOT_DIR}/native/quicklook/MDIQuickLook"
APPEX_DIR="${ROOT_DIR}/build/quicklook/MDIQuickLook.appex"
OUT_DIR="${APPEX_DIR}/Contents"

rm -rf "${APPEX_DIR}"
mkdir -p "${OUT_DIR}/MacOS"

cp "${SRC_DIR}/Info.plist" "${OUT_DIR}/Info.plist"

SOURCES=("${SRC_DIR}/Source/PreviewViewController.swift" "${SRC_DIR}/Source/MarkdownRenderer.swift")

# App extensions are launched through Foundation's NSExtensionMain entry point.
# The binary is an executable (not a loadable bundle) with that custom entry.
build_arch() {
  local triple="$1"
  local out="$2"
  xcrun swiftc \
    -O \
    -parse-as-library \
    -application-extension \
    -module-name MDIQuickLook \
    -target "${triple}" \
    -framework Quartz \
    -framework Cocoa \
    -framework WebKit \
    -Xlinker -e -Xlinker _NSExtensionMain \
    "${SOURCES[@]}" \
    -o "${out}"
}

ARM64_BIN="$(mktemp -t mdiql_arm64)"
X64_BIN="$(mktemp -t mdiql_x64)"
trap 'rm -f "${ARM64_BIN}" "${X64_BIN}"' EXIT

build_arch "arm64-apple-macos11" "${ARM64_BIN}"
build_arch "x86_64-apple-macos10.15" "${X64_BIN}"

# Combine into a universal binary so the extension loads on both architectures.
lipo -create "${ARM64_BIN}" "${X64_BIN}" -output "${OUT_DIR}/MacOS/MDIQuickLook"

# NOTE: do NOT code-sign here. The .appex is embedded into the app by the
# electron-builder afterPack hook (scripts/embed-quicklook.js) and signed by
# electron-builder's osx-sign step with the Developer ID identity, hardened
# runtime, and a secure timestamp. A pre-applied ad-hoc signature would only
# risk interfering with that flow.

echo "Built ${APPEX_DIR}"
lipo -info "${OUT_DIR}/MacOS/MDIQuickLook"
