#!/usr/bin/env bash
set -euo pipefail
ROOT="/Users/joonholee/Joon/1-Project/dev/abuts.fit/web"

echo "==> Seeding E2E user"
ABUTS_DB_FORCE=1 npm --prefix "${ROOT}/backend" run db:seed:e2e-user

echo "==> Resetting guide progress"
ABUTS_DB_FORCE=1 npm --prefix "${ROOT}/backend" run db:seed:guide-progress

echo "==> Running E2E"
npm --prefix "${ROOT}/frontend" run e2e

echo "==> Cleaning up E2E user"
ABUTS_DB_FORCE=1 npm --prefix "${ROOT}/backend" run db:cleanup:e2e-user