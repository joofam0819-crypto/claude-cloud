#!/bin/bash
# ClipMint installer for macOS.
# Downloads the latest release, installs the app into /Applications, removes the
# Gatekeeper quarantine flag (the apps are ad-hoc signed, not notarized) and launches them.
#   curl -fsSL https://raw.githubusercontent.com/joofam0819-crypto/claude-cloud/main/scripts/install-mac-apps.sh | bash
set -euo pipefail
BASE="https://github.com/joofam0819-crypto/claude-cloud/releases/latest/download"
TMP="$(mktemp -d)"
echo "==> 최신 버전 내려받는 중…"
curl -fL --progress-bar -o "$TMP/ClipMint.zip" "$BASE/ClipMint-1.0.0-mac.zip"
echo "==> 응용 프로그램 폴더에 설치 중…"
for app in ClipMint; do
  rm -rf "/Applications/$app.app"
  ditto -x -k "$TMP/$app.zip" /Applications
  xattr -dr com.apple.quarantine "/Applications/$app.app" 2>/dev/null || true
done
rm -rf "$TMP"
echo "==> 실행 중…"
open /Applications/ClipMint.app
echo "완료! 메뉴 막대(화면 위 오른쪽)에 📋 아이콘이 ClipMint입니다. 아무 데서나 ⇧⌘V 로 엽니다."
