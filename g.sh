#!/usr/bin/env bash
set -euo pipefail

msg="${*:-}"
if [[ -z "$msg" ]]; then
  echo "Usage: ./git.sh <commit message>"
  exit 1
fi

git add . && git commit -m "$msg" && git push