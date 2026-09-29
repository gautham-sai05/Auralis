#!/usr/bin/env bash
# Installs a locally built Auralis AppImage for the current user: copies it
# to ~/.local/bin, and registers a desktop entry + icon so it shows up in
# your application launcher like any native app. No root required.
set -euo pipefail

APPIMAGE_SRC="${1:-release/Auralis-0.1.0.AppImage}"

if [ ! -f "$APPIMAGE_SRC" ]; then
  echo "error: AppImage not found at '$APPIMAGE_SRC'" >&2
  echo "Build it first with: npm run package:appimage" >&2
  echo "Or pass the path explicitly: $0 /path/to/Auralis.AppImage" >&2
  exit 1
fi

BIN_DIR="$HOME/.local/bin"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"
DESKTOP_DIR="$HOME/.local/share/applications"

mkdir -p "$BIN_DIR" "$ICON_DIR" "$DESKTOP_DIR"

install -m 755 "$APPIMAGE_SRC" "$BIN_DIR/auralis"

if [ -f "build/icon.png" ]; then
  install -m 644 "build/icon.png" "$ICON_DIR/auralis.png"
fi

cat > "$DESKTOP_DIR/auralis.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Auralis
GenericName=Apple Music Client
Comment=Unofficial Apple Music client for Linux
Exec=$BIN_DIR/auralis %U
Icon=auralis
Terminal=false
Categories=AudioVideo;Audio;Player;Network;
StartupWMClass=Auralis
StartupNotify=true
EOF

update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true

echo "Installed Auralis to $BIN_DIR/auralis"
echo "It should now appear in your application launcher. If not, log out and back in."
echo "Uninstall with: rm -f '$BIN_DIR/auralis' '$DESKTOP_DIR/auralis.desktop' '$ICON_DIR/auralis.png'"
