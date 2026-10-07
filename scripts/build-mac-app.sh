#!/usr/bin/env bash
# Build a macOS .app bundle (universal arm64 + x86_64) from a Swift Package, then
# ad-hoc sign it and package it as .zip and .dmg.  Runs on macOS (CI or local).
#
#   usage: scripts/build-mac-app.sh <project-dir> [out-dir]
#
# <project-dir> must contain Package.swift and app.conf (shell variables):
#   APP_NAME       product name of the executable target (also the .app name)
#   BUNDLE_ID      e.g. com.example.MyApp
#   APP_VERSION    e.g. 1.0.0
#   MIN_MACOS      e.g. 14.0
#   UI_ELEMENT     1 = menu-bar-only app (no Dock icon), 0 = normal app
#   CATEGORY       LSApplicationCategoryType, e.g. public.app-category.utilities
#   ICON_PNG       path (relative to project) of a 1024x1024 PNG icon
#   RESOURCE_DIRS  space-separated dirs (relative to project) copied into Contents/Resources
#   COPYRIGHT      human readable copyright line
#   EXTRA_PLIST    optional: extra Info.plist XML fragment (key/value pairs)
set -euo pipefail

PROJ="${1:?project dir required}"
PROJ="$(cd "$PROJ" && pwd)"
OUT="${2:-$PROJ/dist}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"

# shellcheck disable=SC1091
source "$PROJ/app.conf"
: "${APP_NAME:?}" "${BUNDLE_ID:?}" "${APP_VERSION:?}" "${MIN_MACOS:=14.0}" "${UI_ELEMENT:=0}"
: "${CATEGORY:=public.app-category.utilities}" "${ICON_PNG:=icon.png}" "${RESOURCE_DIRS:=}"
: "${COPYRIGHT:=}" "${EXTRA_PLIST:=}"

echo "==> Building $APP_NAME $APP_VERSION (universal) from $PROJ"
pushd "$PROJ" >/dev/null
swift build -c release --arch arm64 --arch x86_64 --product "$APP_NAME"
BIN_DIR="$(swift build -c release --arch arm64 --arch x86_64 --product "$APP_NAME" --show-bin-path)"
popd >/dev/null
BIN="$BIN_DIR/$APP_NAME"
[ -x "$BIN" ] || { echo "binary not found at $BIN"; exit 1; }
file "$BIN"

APP="$OUT/$APP_NAME.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/$APP_NAME"

echo "==> Icon"
ICONSET="$OUT/AppIcon.iconset"
rm -rf "$ICONSET"; mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  d=$((s * 2))
  sips -z "$s" "$s" "$PROJ/$ICON_PNG" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z "$d" "$d" "$PROJ/$ICON_PNG" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
rm -rf "$ICONSET"

echo "==> Resources"
for r in $RESOURCE_DIRS; do
  cp -R "$PROJ/$r" "$APP/Contents/Resources/"
done

UI_ELEMENT_XML=""
if [ "$UI_ELEMENT" = "1" ]; then
  UI_ELEMENT_XML="<key>LSUIElement</key><true/>"
fi

echo "==> Info.plist"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>ko</string>
  <key>CFBundleExecutable</key><string>$APP_NAME</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$APP_VERSION</string>
  <key>CFBundleVersion</key><string>${BUILD_NUMBER:-1}</string>
  <key>CFBundleSupportedPlatforms</key><array><string>MacOSX</string></array>
  <key>LSMinimumSystemVersion</key><string>$MIN_MACOS</string>
  <key>LSApplicationCategoryType</key><string>$CATEGORY</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSSupportsAutomaticGraphicsSwitching</key><true/>
  <key>NSHumanReadableCopyright</key><string>$COPYRIGHT</string>
  $UI_ELEMENT_XML
  $EXTRA_PLIST
</dict>
</plist>
PLIST
plutil -lint "$APP/Contents/Info.plist"
printf 'APPL????' > "$APP/Contents/PkgInfo"

echo "==> Ad-hoc code signing"
codesign --force --deep --sign - --timestamp=none "$APP"
codesign --verify --verbose=2 "$APP"

echo "==> Packaging"
ZIP="$OUT/$APP_NAME-$APP_VERSION-mac.zip"
DMG="$OUT/$APP_NAME-$APP_VERSION-mac.dmg"
rm -f "$ZIP" "$DMG"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"

DMGROOT="$OUT/dmgroot"
rm -rf "$DMGROOT"; mkdir -p "$DMGROOT"
cp -R "$APP" "$DMGROOT/"
ln -s /Applications "$DMGROOT/Applications"
hdiutil create -volname "$APP_NAME" -srcfolder "$DMGROOT" -ov -format UDZO "$DMG" >/dev/null
rm -rf "$DMGROOT"

ls -la "$OUT"
echo "==> Done: $APP"
