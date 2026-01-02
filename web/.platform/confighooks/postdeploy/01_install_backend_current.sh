#!/bin/bash
set -euo pipefail

echo "[confighooks-postdeploy] Running hook..."

CURRENT_DIR="/var/app/current"
CANDIDATES=(
  "$CURRENT_DIR/backend"
  "$CURRENT_DIR/web/backend"
)

TARGET=""
for c in "${CANDIDATES[@]}"; do
  if [ -d "$c" ]; then
    TARGET="$c"
    break
  fi
done

echo "[confighooks-postdeploy] Expected backend dir: $TARGET"

if [ -z "$TARGET" ] || [ ! -d "$TARGET" ]; then
  echo "[confighooks-postdeploy] Backend directory not found" >&2
  echo "[confighooks-postdeploy] Contents of $CURRENT_DIR:" >&2
  ls -al "$CURRENT_DIR" || true
  exit 1
fi

if [ -e "$TARGET/shared" ] && [ ! -L "$TARGET/shared" ]; then
  echo "[confighooks-postdeploy] removing non-symlink $TARGET/shared"
  rm -rf "$TARGET/shared"
fi
if [ ! -L "$TARGET/shared" ]; then
  ln -s ../shared "$TARGET/shared"
  echo "[confighooks-postdeploy] linked $TARGET/shared -> ../shared"
fi

echo "[confighooks-postdeploy] Installing dependencies in $TARGET"

cd "$TARGET"

if [ -f "package-lock.json" ] || [ -f "npm-shrinkwrap.json" ]; then
  if npm ci --omit=dev --no-audit --no-fund; then
    echo "[confighooks-postdeploy] npm ci finished in $TARGET"
  else
    echo "[confighooks-postdeploy] npm ci failed. Falling back to npm install in $TARGET" >&2
    npm install --omit=dev --no-audit --no-fund
    echo "[confighooks-postdeploy] npm install finished in $TARGET"
  fi
else
  echo "[confighooks-postdeploy] lockfile not found. Falling back to npm install in $TARGET" >&2
  npm install --omit=dev --no-audit --no-fund
  echo "[confighooks-postdeploy] npm install finished in $TARGET"
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl reset-failed web.service || true
  systemctl restart web.service || true
fi
