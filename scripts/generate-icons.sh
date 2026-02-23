#!/bin/bash

# Icon Generation Script
# Generates all required icon sizes and formats for both web and Electron builds

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ICON_DIR="$PROJECT_DIR/public/icon"
LOGO_DIR="$PROJECT_DIR/public/logo"
BUILD_DIR="$PROJECT_DIR/build"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
  echo -e "${RED}✗${NC} $1"
}

echo "🎨 Generating icon assets..."
echo ""

# ============================================================================
# SECTION 1: Generate Web Icons from illusions.png
# ============================================================================
echo "📱 Generating web icons from illusions.png..."

declare -a WEB_SIZES=(16 32 180 192 512)

for size in "${WEB_SIZES[@]}"; do
  output="$ICON_DIR/illusions-${size}.png"
  if convert "$ICON_DIR/illusions.png" -resize "${size}x${size}" "$output" 2>/dev/null; then
    log_info "Generated $(basename $output) (${size}×${size})"
  else
    log_error "Failed to generate $(basename $output)"
    exit 1
  fi
done

echo ""

# ============================================================================
# SECTION 2: Generate Web Icons from illusions-mdi.png
# ============================================================================
echo "📱 Generating MDI web icons from illusions-mdi.png..."

declare -a MDI_WEB_SIZES=(16 32 180 192 512)

for size in "${MDI_WEB_SIZES[@]}"; do
  output="$ICON_DIR/illusions-mdi-${size}.png"
  if convert "$ICON_DIR/illusions-mdi.png" -resize "${size}x${size}" "$output" 2>/dev/null; then
    log_info "Generated $(basename $output) (${size}×${size})"
  else
    log_error "Failed to generate $(basename $output)"
    exit 1
  fi
done

echo ""

# ============================================================================
# SECTION 3: Copy Icons for Linux Builds
# ============================================================================
echo "🐧 Copying PNG icons for Linux builds..."

if cp "$ICON_DIR/illusions.png" "$BUILD_DIR/icon.png" 2>/dev/null; then
  log_info "Copied build/icon.png (Linux)"
else
  log_error "Failed to copy build/icon.png"
  exit 1
fi

if cp "$ICON_DIR/illusions-mdi.png" "$BUILD_DIR/mdi-icon.png" 2>/dev/null; then
  log_info "Copied build/mdi-icon.png (Linux)"
else
  log_error "Failed to copy build/mdi-icon.png"
  exit 1
fi

echo ""

# ============================================================================
# SECTION 4: Generate .icns Files for macOS (icon)
# ============================================================================
echo "🍎 Generating icon.icns for macOS..."

ICON_ICONSET="$BUILD_DIR/icon.iconset"
rm -rf "$ICON_ICONSET"
mkdir -p "$ICON_ICONSET"

# Standard macOS icon sizes and @2x variants
declare -a ICONSET_SIZES=(
  "16:16x16"
  "32:16x16@2x"
  "32:32x32"
  "64:32x32@2x"
  "128:128x128"
  "256:128x128@2x"
  "256:256x256"
  "512:256x256@2x"
  "512:512x512"
  "1024:512x512@2x"
)

for entry in "${ICONSET_SIZES[@]}"; do
  size="${entry%:*}"
  filename="${entry#*:}"
  if convert "$ICON_DIR/illusions.png" -resize "${size}x${size}" "$ICON_ICONSET/icon_${filename}.png" 2>/dev/null; then
    log_info "Generated icon_${filename}.png (${size}×${size})"
  else
    log_error "Failed to generate icon_${filename}.png"
    exit 1
  fi
done

# Convert iconset to .icns
if iconutil -c icns "$ICON_ICONSET" -o "$BUILD_DIR/icon.icns" 2>/dev/null; then
  log_info "Generated build/icon.icns"
  rm -rf "$ICON_ICONSET"
else
  log_error "Failed to generate icon.icns"
  exit 1
fi

echo ""

# ============================================================================
# SECTION 5: Generate .icns Files for macOS (mdi-icon)
# ============================================================================
echo "🍎 Generating mdi-icon.icns for macOS..."

MDI_ICONSET="$BUILD_DIR/mdi-icon.iconset"
rm -rf "$MDI_ICONSET"
mkdir -p "$MDI_ICONSET"

for entry in "${ICONSET_SIZES[@]}"; do
  size="${entry%:*}"
  filename="${entry#*:}"
  if convert "$ICON_DIR/illusions-mdi.png" -resize "${size}x${size}" "$MDI_ICONSET/icon_${filename}.png" 2>/dev/null; then
    log_info "Generated mdi-icon_${filename}.png (${size}×${size})"
  else
    log_error "Failed to generate mdi-icon_${filename}.png"
    exit 1
  fi
done

# Convert iconset to .icns
if iconutil -c icns "$MDI_ICONSET" -o "$BUILD_DIR/mdi-icon.icns" 2>/dev/null; then
  log_info "Generated build/mdi-icon.icns"
  rm -rf "$MDI_ICONSET"
else
  log_error "Failed to generate mdi-icon.icns"
  exit 1
fi

echo ""

# ============================================================================
# SECTION 6: Generate .ico Files for Windows (icon)
# ============================================================================
echo "🪟 Generating icon.ico for Windows..."

if convert "$ICON_DIR/illusions.png" -define icon:auto-resize=256,128,64,48,32,16 "$BUILD_DIR/icon.ico" 2>/dev/null; then
  log_info "Generated build/icon.ico"
else
  log_error "Failed to generate icon.ico"
  exit 1
fi

echo ""

# ============================================================================
# SECTION 7: Generate .ico Files for Windows (mdi-icon)
# ============================================================================
echo "🪟 Generating mdi-icon.ico for Windows..."

if convert "$ICON_DIR/illusions-mdi.png" -define icon:auto-resize=256,128,64,48,32,16 "$BUILD_DIR/mdi-icon.ico" 2>/dev/null; then
  log_info "Generated build/mdi-icon.ico"
else
  log_error "Failed to generate mdi-icon.ico"
  exit 1
fi

echo ""

# ============================================================================
# SECTION 8: Generate AppX/MSIX Tile Assets for Windows Store
# ============================================================================
echo "🏪 Generating AppX/MSIX tile assets for Windows Store..."

APPX_DIR="$BUILD_DIR/appx"
mkdir -p "$APPX_DIR"

# Square44x44Logo — taskbar icon and small Start tile
if convert "$ICON_DIR/illusions.png" -resize 44x44 "$APPX_DIR/Square44x44Logo.png" 2>/dev/null; then
  log_info "Generated appx/Square44x44Logo.png (44×44)"
else
  log_error "Failed to generate appx/Square44x44Logo.png"
  exit 1
fi

# StoreLogo — Microsoft Store listing icon
if convert "$ICON_DIR/illusions.png" -resize 50x50 "$APPX_DIR/StoreLogo.png" 2>/dev/null; then
  log_info "Generated appx/StoreLogo.png (50×50)"
else
  log_error "Failed to generate appx/StoreLogo.png"
  exit 1
fi

# Square150x150Logo — medium Start tile
if convert "$ICON_DIR/illusions.png" -resize 150x150 "$APPX_DIR/Square150x150Logo.png" 2>/dev/null; then
  log_info "Generated appx/Square150x150Logo.png (150×150)"
else
  log_error "Failed to generate appx/Square150x150Logo.png"
  exit 1
fi

# LargeTile (Square310x310) — large Start tile
if convert "$ICON_DIR/illusions.png" -resize 310x310 "$APPX_DIR/LargeTile.png" 2>/dev/null; then
  log_info "Generated appx/LargeTile.png (310×310)"
else
  log_error "Failed to generate appx/LargeTile.png"
  exit 1
fi

# Wide310x150Logo — wide Start tile (non-square 310:150 ratio)
# Center the icon on a dark background to match the app tile color
if convert -size 310x150 xc:"#1a1a1a" \
  \( "$ICON_DIR/illusions.png" -resize 150x150 \) \
  -gravity Center -composite \
  "$APPX_DIR/Wide310x150Logo.png" 2>/dev/null; then
  log_info "Generated appx/Wide310x150Logo.png (310×150)"
else
  log_error "Failed to generate appx/Wide310x150Logo.png"
  exit 1
fi

echo ""

# ============================================================================
# SECTION 9: Verification
# ============================================================================
echo "🔍 Verifying generated files..."
echo ""

echo "Web Icons (public/icon/):"
ls -lh "$ICON_DIR"/illusions-{16,32,180,192,512}.png 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
echo ""

echo "MDI Web Icons (public/icon/):"
ls -lh "$ICON_DIR"/illusions-mdi-{16,32,180,192,512}.png 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
echo ""

echo "Electron Icons (build/):"
ls -lh "$BUILD_DIR"/{icon,mdi-icon}.{png,ico,icns} 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
echo ""

echo "AppX/MSIX Tile Assets (build/appx/):"
ls -lh "$APPX_DIR"/*.png 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
echo ""

# ============================================================================
# SECTION 10: Size Comparison
# ============================================================================
echo "📊 Icon Size Summary:"
echo ""
echo "  Original build/icon.png:     $(ls -lh "$BUILD_DIR/icon.png" | awk '{print $5}')"
echo "  Original build/icon.icns:    $(ls -lh "$BUILD_DIR/icon.icns" | awk '{print $5}')"
echo "  Original build/icon.ico:     $(ls -lh "$BUILD_DIR/icon.ico" | awk '{print $5}')"
echo ""
echo "  Original build/mdi-icon.png: $(ls -lh "$BUILD_DIR/mdi-icon.png" | awk '{print $5}')"
echo "  Original build/mdi-icon.icns: $(ls -lh "$BUILD_DIR/mdi-icon.icns" | awk '{print $5}')"
echo "  Original build/mdi-icon.ico: $(ls -lh "$BUILD_DIR/mdi-icon.ico" | awk '{print $5}')"
echo ""
echo "  AppX/MSIX Tile Assets:"
ls -lh "$APPX_DIR"/*.png 2>/dev/null | awk '{print "    " $9 " (" $5 ")"}'
echo ""

log_info "Icon generation complete! ✨"
