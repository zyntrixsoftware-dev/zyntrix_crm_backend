#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Rotating backup of the uploads folder (candidate resumes + onboarding docs).
# Run daily via cron. Keeps the 7 most recent archives.
#
#   chmod +x ~/zyntrix/Backend/scripts/backup-uploads.sh
#   crontab -e   then add:
#   0 2 * * * /bin/bash $HOME/zyntrix/Backend/scripts/backup-uploads.sh >> $HOME/backups/backup.log 2>&1
# ---------------------------------------------------------------------------
set -euo pipefail

SRC="$HOME/zyntrix/Backend/uploads"
DEST="$HOME/backups"
KEEP=7

mkdir -p "$DEST"
STAMP=$(date +%Y%m%d-%H%M%S)

if [ -d "$SRC" ] && [ -n "$(ls -A "$SRC" 2>/dev/null)" ]; then
  tar -czf "$DEST/uploads-$STAMP.tar.gz" -C "$(dirname "$SRC")" "$(basename "$SRC")"
  echo "[$(date '+%F %T')] backup created: $DEST/uploads-$STAMP.tar.gz ($(du -h "$DEST/uploads-$STAMP.tar.gz" | cut -f1))"
  # rotate: keep only the newest $KEEP archives
  ls -1t "$DEST"/uploads-*.tar.gz 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f
else
  echo "[$(date '+%F %T')] nothing to back up ($SRC empty or missing)"
fi
