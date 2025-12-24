#!/bin/bash
set -euo pipefail

echo "[predeploy] Running hook..."

STAGING_DIR="/var/app/staging"
CANDIDATES=(
  "$STAGING_DIR/backend"
  "$STAGING_DIR/web/backend"
)

TARGET="$STAGING_DIR/backend"

echo "[predeploy] Expected backend dir: $TARGET"

if [ -d "$TARGET" ]; then
  # ensure shared symlink inside backend (shared is at /var/app/staging/shared)
  if [ -e "$TARGET/shared" ] && [ ! -L "$TARGET/shared" ]; then
    echo "[predeploy] removing non-symlink $TARGET/shared"
    rm -rf "$TARGET/shared"
  fi
  if [ ! -L "$TARGET/shared" ]; then
    ln -s ../shared "$TARGET/shared"
    echo "[predeploy] linked $TARGET/shared -> ../shared"
  fi

  echo "[predeploy] Installing dependencies in $TARGET"
  cd "$TARGET"
  if npm ci --omit=dev --no-audit --no-fund; then
    echo "[predeploy] npm ci finished in $TARGET"
    exit 0
  else
    echo "[predeploy] npm ci failed in $TARGET" >&2
    exit 1
  fi
fi

echo "[predeploy] Backend directory not found at $TARGET"
echo "[predeploy] Contents of $STAGING_DIR:"
ls -al "$STAGING_DIR"
exit 1
