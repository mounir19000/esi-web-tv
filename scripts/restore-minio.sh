#!/bin/sh
set -eu

compose_file="${COMPOSE_FILE:-compose.prod.yml}"
env_file="${ENV_FILE:-.env.production}"
backup_path="${1:-}"

if [ -z "$backup_path" ] || [ ! -r "$backup_path" ]; then
  echo "Usage: $0 path/to/minio-backup.tar.gz[.enc]" >&2
  exit 1
fi

if [ "${CONFIRM_RESTORE:-}" != "yes" ]; then
  echo "Set CONFIRM_RESTORE=yes to restore MinIO objects into the video bucket." >&2
  exit 1
fi

if [ ! -r "$env_file" ]; then
  echo "Environment file $env_file is required." >&2
  exit 1
fi

set -a
. "$env_file"
set +a

restore_root="$(mktemp -d)"
trap 'rm -rf "$restore_root"' EXIT
archive_path="$restore_root/minio-restore.tar.gz"

case "$backup_path" in
  *.enc)
    if [ -z "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]; then
      echo "BACKUP_ENCRYPTION_PASSPHRASE is required to restore encrypted backups." >&2
      exit 1
    fi
    openssl enc -d -aes-256-cbc -salt -pbkdf2 \
      -pass env:BACKUP_ENCRYPTION_PASSPHRASE \
      -in "$backup_path" \
      -out "$archive_path"
    ;;
  *)
    cp "$backup_path" "$archive_path"
    ;;
esac

tar -C "$restore_root" -xzf "$archive_path"
payload_dir="$(find "$restore_root" -mindepth 1 -maxdepth 1 -type d | head -n 1)"

if [ -z "$payload_dir" ]; then
  echo "Backup archive did not contain a payload directory." >&2
  exit 1
fi

docker compose --env-file "$env_file" -f "$compose_file" run --rm \
  -v "$payload_dir:/restore:ro" \
  --entrypoint sh \
  minio-init \
  -c 'set -eu
    mc alias set local "$MINIO_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
    mc mb --ignore-existing "local/$MINIO_VIDEO_BUCKET"
    mc mirror --overwrite /restore "local/$MINIO_VIDEO_BUCKET"
  '

echo "MinIO restore completed from $backup_path"
