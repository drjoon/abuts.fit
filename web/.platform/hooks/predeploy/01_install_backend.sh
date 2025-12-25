#!/bin/bash
set -euo pipefail

echo "[predeploy] Running hook..."

mkdir -p /var/pids
chown root:root /var/pids
chmod 1777 /var/pids

STAGING_DIR="/var/app/staging"
CANDIDATES=(
  "$STAGING_DIR/backend"
  "$STAGING_DIR/web/backend"
)

TARGET=""

for c in "${CANDIDATES[@]}"; do
  if [ -d "$c" ]; then
    TARGET="$c"
    break
  fi
done

echo "[predeploy] Expected backend dir: $TARGET"

if [ -n "$TARGET" ] && [ -d "$TARGET" ]; then
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

  if [ -f "package-lock.json" ] || [ -f "npm-shrinkwrap.json" ]; then
    npm ci --omit=dev --no-audit --no-fund
    echo "[predeploy] npm ci finished in $TARGET"
    exit 0
  fi

  echo "[predeploy] lockfile not found. Falling back to npm install in $TARGET" >&2
  npm install --omit=dev --no-audit --no-fund
  echo "[predeploy] npm install finished in $TARGET"
  exit 0
fi

echo "[predeploy] Backend directory not found at $TARGET"
echo "[predeploy] Contents of $STAGING_DIR:"
ls -al "$STAGING_DIR"
exit 1
