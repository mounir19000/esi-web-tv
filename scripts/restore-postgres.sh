#!/bin/sh
set -eu

compose_file="${COMPOSE_FILE:-compose.prod.yml}"
env_file="${ENV_FILE:-.env.production}"
backup_path="${1:-}"

if [ -z "$backup_path" ] || [ ! -r "$backup_path" ]; then
  echo "Usage: $0 path/to/postgres-backup.dump.gz[.enc]" >&2
  exit 1
fi

if [ "${CONFIRM_RESTORE:-}" != "yes" ]; then
  echo "Set CONFIRM_RESTORE=yes to restore PostgreSQL. This overwrites database objects." >&2
  exit 1
fi

if [ ! -r "$env_file" ]; then
  echo "Environment file $env_file is required." >&2
  exit 1
fi

set -a
. "$env_file"
set +a

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

case "$backup_path" in
  *.enc)
    if [ -z "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]; then
      echo "BACKUP_ENCRYPTION_PASSPHRASE is required to restore encrypted backups." >&2
      exit 1
    fi
    openssl enc -d -aes-256-cbc -salt -pbkdf2 \
      -pass env:BACKUP_ENCRYPTION_PASSPHRASE \
      -in "$backup_path" \
      | gunzip > "$tmp_file"
    ;;
  *.gz)
    gunzip -c "$backup_path" > "$tmp_file"
    ;;
  *)
    cp "$backup_path" "$tmp_file"
    ;;
esac

docker compose --env-file "$env_file" -f "$compose_file" exec -T db \
  pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$tmp_file"

echo "PostgreSQL restore completed from $backup_path"
