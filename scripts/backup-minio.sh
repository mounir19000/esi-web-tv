#!/bin/sh
set -eu

compose_file="${COMPOSE_FILE:-compose.prod.yml}"
env_file="${ENV_FILE:-.env.production}"
backup_dir="${BACKUP_DIR:-backups/minio}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"

if [ ! -r "$env_file" ]; then
  echo "Environment file $env_file is required." >&2
  exit 1
fi

set -a
. "$env_file"
set +a

case "$backup_dir" in
  /*) backup_root="$backup_dir" ;;
  *) backup_root="$PWD/$backup_dir" ;;
esac

mirror_dir="minio-$timestamp"
archive_path="$backup_root/$mirror_dir.tar.gz"
mkdir -p "$backup_root"

docker compose --env-file "$env_file" -f "$compose_file" run --rm \
  -v "$backup_root:/backup" \
  --entrypoint sh \
  minio-init \
  -c 'set -eu
    mc alias set local "$MINIO_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
    mc mirror --overwrite "local/$MINIO_VIDEO_BUCKET" "/backup/'"$mirror_dir"'"
  '

tar -C "$backup_root" -czf "$archive_path" "$mirror_dir"
rm -rf "$backup_root/$mirror_dir"

if [ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]; then
  encrypted_path="$archive_path.enc"
  openssl enc -aes-256-cbc -salt -pbkdf2 \
    -pass env:BACKUP_ENCRYPTION_PASSPHRASE \
    -in "$archive_path" \
    -out "$encrypted_path"
  rm "$archive_path"
  archive_path="$encrypted_path"
fi

if [ -n "${BACKUP_REMOTE_RSYNC_TARGET:-}" ]; then
  rsync -a "$archive_path" "$BACKUP_REMOTE_RSYNC_TARGET"
fi

echo "MinIO backup written to $archive_path"
