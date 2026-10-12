#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-3000}"
export PORT
PROJECT_ROOT="$(/usr/bin/time -p pwd)"
DIST_DIR="$PROJECT_ROOT/dist"
WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
/usr/bin/time -p mkdir -p "$DIST_DIR"
/usr/bin/time -p mkdir -p "$WEB_DIR"
if /usr/bin/time -p test -f package.json; then
  if /usr/bin/time -p test -f package-lock.json; then
    /usr/bin/time -p npm ci --no-audit --no-fund
  else
    /usr/bin/time -p npm install --no-audit --no-fund
  fi
  if /usr/bin/time -p test -f vite.config.js -o -f vite.config.ts -o -f vite.config.mjs; then
    /usr/bin/time -p npx vite build
  fi
fi
if /usr/bin/time -p test -f index.html; then
  if /usr/bin/time -p test ! -f "$DIST_DIR/index.html"; then
    /usr/bin/time -p cp index.html "$DIST_DIR/index.html"
  elif /usr/bin/time -p test index.html -nt "$DIST_DIR/index.html"; then
    /usr/bin/time -p cp index.html "$DIST_DIR/index.html"
  fi
fi
/usr/bin/time -p test -f "$DIST_DIR/index.html"
/usr/bin/time -p bash -c 'printf "%s" "$1" > "$2"' _ "{\"project\":\"$PROJECT_ROOT\",\"directory\":\"$DIST_DIR\"}" "$WEB_DIR/deployment-output.json"
/usr/bin/time -p cat "$WEB_DIR/deployment-output.json"
/usr/bin/time -p node server.cjs
