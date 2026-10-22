#!/bin/bash
set -euo pipefail

echo "[predeploy] Running hook..."

# 한글 폰트는 backend/assets/fonts/NotoSansKR-VF.ttf 로 배포한다.
# 인스턴스마다 dnf 로 Noto CJK 를 설치하지 않는다.

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

  CACHE_DIR="/var/cache/abuts-fit/node_modules"

  # package-lock.json 해시 비교로 캐시 사용 여부 결정
  if [ -f "$TARGET/package-lock.json" ] && [ -d "$CACHE_DIR/node_modules" ] && [ -f "$CACHE_DIR/package-lock.hash" ]; then
    CURRENT_HASH=$(md5sum "$TARGET/package-lock.json" | cut -d' ' -f1)
    CACHED_HASH=$(cat "$CACHE_DIR/package-lock.hash")
    echo "[predeploy] package-lock hash: current=$CURRENT_HASH cached=$CACHED_HASH"

    if [ "$CURRENT_HASH" = "$CACHED_HASH" ]; then
      echo "[predeploy] Cache hit! Restoring node_modules from cache..."
      rm -rf "$TARGET/node_modules"
      cp -a "$CACHE_DIR/node_modules" "$TARGET/node_modules"
      echo "[predeploy] node_modules restored from cache ($(du -sh $TARGET/node_modules | cut -f1))"
      exit 0
    fi

    echo "[predeploy] Cache miss (hash changed), installing..."
  else
    echo "[predeploy] No cache found, installing..."
  fi

  cd "$TARGET"

  if [ -f "package-lock.json" ] || [ -f "npm-shrinkwrap.json" ]; then
    if npm ci --omit=dev --no-audit --no-fund; then
      echo "[predeploy] npm ci finished in $TARGET"
    else
      echo "[predeploy] npm ci failed. Falling back to npm install in $TARGET" >&2
      npm install --omit=dev --no-audit --no-fund
      echo "[predeploy] npm install finished in $TARGET"
    fi
  else
    echo "[predeploy] lockfile not found. Falling back to npm install in $TARGET" >&2
    npm install --omit=dev --no-audit --no-fund
    echo "[predeploy] npm install finished in $TARGET"
  fi

  # 캐시 저장
  if [ -d "$TARGET/node_modules" ] && [ -f "$TARGET/package-lock.json" ]; then
    echo "[predeploy] Saving node_modules to cache..."
    mkdir -p "$CACHE_DIR"
    rm -rf "$CACHE_DIR/node_modules"
    cp -a "$TARGET/node_modules" "$CACHE_DIR/node_modules"
    md5sum "$TARGET/package-lock.json" | cut -d' ' -f1 > "$CACHE_DIR/package-lock.hash"
    echo "[predeploy] Cache saved ($(du -sh $CACHE_DIR/node_modules | cut -f1))"
  fi

  exit 0
fi

echo "[predeploy] Backend directory not found at $TARGET"
echo "[predeploy] Contents of $STAGING_DIR:"
ls -al "$STAGING_DIR"
exit 1
