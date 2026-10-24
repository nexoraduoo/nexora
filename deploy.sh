#!/usr/bin/env bash
# Nexora - put it online for free on Cloudflare (macOS / Linux).   bash deploy.sh
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Install Node.js (LTS) from https://nodejs.org first."; exit 1; }
[ -d node_modules/wrangler ] || npm install --no-audit --no-fund || exit 1
node scripts/deploy.mjs
