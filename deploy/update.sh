#!/usr/bin/env bash
# Redeploy the latest from GitHub. Run as root: bash /opt/pastels/deploy/update.sh
# The SQLite DB in server/var/ is left untouched, so inventory + accounts persist.
set -euo pipefail
cd /opt/pastels
sudo -u pastels git pull --ff-only
sudo -u pastels pnpm install --frozen-lockfile
sudo -u pastels pnpm build
systemctl restart pastels
systemctl --no-pager status pastels | head -5
