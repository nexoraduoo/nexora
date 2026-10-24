#!/usr/bin/env bash
# Nexora - start on this computer (macOS / Linux).   bash start-nexora.sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo
  echo " Nexora needs Node.js (one-time install). Get the LTS version from https://nodejs.org"
  echo " (macOS with Homebrew: brew install node)   then run this again."
  echo
  exit 1
fi
if [ ! -d node_modules/wrangler ]; then
  echo "Installing components (one time, about a minute)..."
  npm install --no-audit --no-fund || exit 1
fi
node scripts/dev.mjs
