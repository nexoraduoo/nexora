#!/bin/sh
# Adds Nexora to your app menu on Linux. It opens the Nexora website in its own window (no browser bars).
# Run:  sh install-linux.sh        Remove:  sh install-linux.sh --remove
URL="__URL__"
APPS="$HOME/.local/share/applications"
ICONS="$HOME/.local/share/icons"

if [ "$1" = "--remove" ]; then
  rm -f "$APPS/nexora.desktop" "$ICONS/nexora.png"
  echo "Nexora was removed from your app menu."
  exit 0
fi

BROWSER=""
for b in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge microsoft-edge-stable brave-browser vivaldi; do
  if command -v "$b" >/dev/null 2>&1; then BROWSER="$b"; break; fi
done

mkdir -p "$APPS" "$ICONS"
if command -v curl >/dev/null 2>&1; then curl -fsSL "$URL/icons/icon-512.png" -o "$ICONS/nexora.png" 2>/dev/null
elif command -v wget >/dev/null 2>&1; then wget -q "$URL/icons/icon-512.png" -O "$ICONS/nexora.png" 2>/dev/null; fi

if [ -n "$BROWSER" ]; then EXEC="$BROWSER --app=$URL"; else EXEC="xdg-open $URL"; fi
cat > "$APPS/nexora.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Nexora
Comment=Ad-free music for you and your circle
Exec=$EXEC
Icon=$ICONS/nexora.png
Terminal=false
Categories=AudioVideo;Audio;Player;
StartupWMClass=Nexora
DESK
chmod +x "$APPS/nexora.desktop"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" >/dev/null 2>&1

if [ -z "$BROWSER" ]; then echo "No Chrome, Chromium, Edge or Brave found: Nexora will open in your default browser. For the best result install Chromium."; fi
echo "Done. Search for 'Nexora' in your app menu."
( [ -n "$BROWSER" ] && nohup $EXEC >/dev/null 2>&1 & ) || true
