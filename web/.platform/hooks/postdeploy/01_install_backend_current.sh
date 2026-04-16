#!/bin/bash
set -euo pipefail

echo "[postdeploy] Running hook..."

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

echo "[postdeploy] Expected backend dir: $TARGET"

if [ -z "$TARGET" ] || [ ! -d "$TARGET" ]; then
  echo "[postdeploy] Backend directory not found" >&2
  echo "[postdeploy] Contents of $CURRENT_DIR:" >&2
  ls -al "$CURRENT_DIR" || true
  exit 1
fi

# ensure shared symlink inside backend (shared is at /var/app/current/shared)
if [ -e "$TARGET/shared" ] && [ ! -L "$TARGET/shared" ]; then
  echo "[postdeploy] removing non-symlink $TARGET/shared"
  rm -rf "$TARGET/shared"
fi
if [ ! -L "$TARGET/shared" ]; then
  ln -s ../shared "$TARGET/shared"
  echo "[postdeploy] linked $TARGET/shared -> ../shared"
fi

echo "[postdeploy] Restarting service (dependencies already installed in predeploy)..."

if command -v systemctl >/dev/null 2>&1; then
  systemctl reset-failed web.service || true
  systemctl restart web.service || true
fi

exit 0
