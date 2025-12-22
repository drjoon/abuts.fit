#!/usr/bin/env bash
set -euo pipefail

(
  cd web
  ABUTS_DB_FORCE=true npm --prefix backend run db:reset-and-seed
)