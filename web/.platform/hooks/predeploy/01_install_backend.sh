#!/bin/bash
set -euo pipefail

echo "[predeploy] Running hook..."

STAGING_DIR="/var/app/staging"
CANDIDATES=(
  "$STAGING_DIR/backend"
  "$STAGING_DIR/web/backend"
)

for idx in "${!CANDIDATES[@]}"; do
  dir="${CANDIDATES[$idx]}"
  if [ -d "$dir" ]; then
    echo "[predeploy] Installing dependencies in $dir"
    cd "$dir"
    if npm install --omit=dev --no-audit --no-fund; then
      echo "[predeploy] npm install finished in $dir"
      exit 0
    else
      echo "[predeploy] npm install failed in $dir" >&2
      exit 1
    fi
  fi
done

echo "[predeploy] Backend directory not found. Tried:"
printf '  - %s\n' "${CANDIDATES[@]}"
echo "[predeploy] Contents of $STAGING_DIR:"
ls -al "$STAGING_DIR"
exit 1
