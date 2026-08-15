#!/bin/sh
set -eu

compose_file="${COMPOSE_FILE:-compose.prod.yml}"
env_file="${ENV_FILE:-.env.production}"
backup_dir="${BACKUP_DIR:-backups/postgres}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"

if [ ! -r "$env_file" ]; then
  echo "Environment file $env_file is required." >&2
  exit 1
fi

set -a
. "$env_file"
set +a

mkdir -p "$backup_dir"
backup_path="$backup_dir/postgres-$timestamp.dump.gz"

docker compose --env-file "$env_file" -f "$compose_file" exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
  | gzip -9 > "$backup_path"

if [ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]; then
  encrypted_path="$backup_path.enc"
  openssl enc -aes-256-cbc -salt -pbkdf2 \
    -pass env:BACKUP_ENCRYPTION_PASSPHRASE \
    -in "$backup_path" \
    -out "$encrypted_path"
  rm "$backup_path"
  backup_path="$encrypted_path"
fi

if [ -n "${BACKUP_REMOTE_RSYNC_TARGET:-}" ]; then
  rsync -a "$backup_path" "$BACKUP_REMOTE_RSYNC_TARGET"
fi

echo "PostgreSQL backup written to $backup_path"
