#!/bin/bash
set -euo pipefail

echo "[postdeploy] ensure /var/app/shared -> /var/app/current/shared"

SRC="/var/app/current/shared"
DEST="/var/app/shared"

if [ -d "$SRC" ]; then
  if [ -L "$DEST" ] || [ -d "$DEST" ]; then
    rm -rf "$DEST"
  fi
  ln -s "$SRC" "$DEST"
  echo "[postdeploy] linked $DEST -> $SRC"
else
  echo "[postdeploy] WARN: source shared dir not found at $SRC" >&2
fi
