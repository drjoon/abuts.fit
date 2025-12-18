#!/bin/bash
set -e

cd /var/app/current/web/backend
npm install --omit=dev --no-audit --no-fund

# 앱 재시작
sudo systemctl restart web.service
