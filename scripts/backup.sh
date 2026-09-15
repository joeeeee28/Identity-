#!/usr/bin/env sh
# Smart-Corp AI — scheduled encrypted pg_dump backup (staging/self-hosted).
# Usage: BACKUP_DIR=/backups DATABASE_URL=postgres://... ENCRYPTION_PASSPHRASE=... ./scripts/backup.sh
# Keeps the last N backups (default 14). Uses `pg_dump` + `age` for encryption.
# For production, replace this with the managed provider's PITR (see docs).

set -eu

DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP="${KEEP:-14}"
ENCRYPTION_PASSPHRASE="${ENCRYPTION_PASSPHRASE:-}"

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="$BACKUP_DIR/smart-corp-$TIMESTAMP.sql"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "error: pg_dump not found (install postgresql-client)" >&2
  exit 1
fi

echo "Backing up to $DUMP_FILE ..."
pg_dump --dbname "$DATABASE_URL" --format=custom --file "$DUMP_FILE"

if [ -n "$ENCRYPTION_PASSPHRASE" ] && command -v age >/dev/null 2>&1; then
  printf '%s' "$ENCRYPTION_PASSPHRASE" | age -p -o "$DUMP_FILE.age" "$DUMP_FILE"
  rm -f "$DUMP_FILE"
  echo "Encrypted: $DUMP_FILE.age"
fi

# Rotate: keep the newest $KEEP files.
ls -1t "$BACKUP_DIR"/smart-corp-* 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "Backup complete."
