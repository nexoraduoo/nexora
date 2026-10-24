#!/usr/bin/env bash
# Builds the Nexora app for Linux (run this ON a Linux computer): dist/Nexora-Linux/nexora, plus a tar.gz to share.
# Needs Node.js 18+ and internet the first time. After building: ./dist/Nexora-Linux/nexora
#   bash desktop/build-linux-app.sh
set -euo pipefail
cd "$(dirname "$0")"

command -v node >/dev/null || { echo "Node.js was not found. Install it from https://nodejs.org (or: sudo apt install nodejs npm) and run this again."; exit 1; }
[ -d node_modules/electron ] || { echo "Installing Electron (one time, about 250 MB)..."; npm install --no-audit --no-fund; }
[ -f node_modules/electron/dist/electron ] || node node_modules/electron/install.js

OUT="dist/Nexora-Linux"
rm -rf dist
mkdir -p "$OUT/resources/app"
cp -a node_modules/electron/dist/. "$OUT/"
for f in main.js offline.html config.json icon.png; do cp "$f" "$OUT/resources/app/$f"; done
cat > "$OUT/resources/app/package.json" <<EOF
{ "name": "nexora", "productName": "Nexora", "version": "1.0.0", "main": "main.js" }
EOF
mv "$OUT/electron" "$OUT/nexora"
chmod +x "$OUT/nexora"

# a launcher entry so Nexora shows up in the app menu (Applications > Sound & Video)
DESK="$OUT/nexora.desktop"
cat > "$DESK" <<EOF
[Desktop Entry]
Type=Application
Name=Nexora
Comment=Ad-free music for you and your circle
Exec=$(pwd)/$OUT/nexora --no-sandbox %U
Icon=$(pwd)/icon.png
Terminal=false
Categories=AudioVideo;Audio;Player;
EOF

tar -czf dist/Nexora-Linux.tar.gz -C dist Nexora-Linux
echo
echo "Done. Run it with:  $(pwd)/$OUT/nexora"
echo "Menu entry:  cp $(pwd)/$DESK ~/.local/share/applications/   (edit the Exec/Icon paths if you move the folder)"
echo "To share it: $(pwd)/dist/Nexora-Linux.tar.gz"
echo "Tip: on Linux, installing the website from Chrome/Edge (install icon in the address bar) works too and needs no build."
