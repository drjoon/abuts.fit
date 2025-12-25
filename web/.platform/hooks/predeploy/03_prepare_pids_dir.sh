#!/bin/bash
set -euo pipefail

mkdir -p /var/pids
chown webapp:webapp /var/pids
chmod 755 /var/pids
