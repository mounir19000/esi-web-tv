#!/bin/sh
set -eu

required() {
  if [ -z "${2:-}" ]; then
    echo "MinIO init configuration error: $1 is required." >&2
    exit 1
  fi
}

required MINIO_ENDPOINT "${MINIO_ENDPOINT:-}"
required MINIO_ROOT_USER "${MINIO_ROOT_USER:-}"
required MINIO_ROOT_PASSWORD "${MINIO_ROOT_PASSWORD:-}"
required MINIO_ACCESS_KEY "${MINIO_ACCESS_KEY:-}"
required MINIO_SECRET_KEY "${MINIO_SECRET_KEY:-}"
required MINIO_VIDEO_BUCKET "${MINIO_VIDEO_BUCKET:-}"

policy_file="/tmp/esitv-media-app-policy.json"

until mc alias set local "$MINIO_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  echo "Waiting for MinIO at $MINIO_ENDPOINT..."
  sleep 2
done

mc mb --ignore-existing "local/$MINIO_VIDEO_BUCKET"
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    *__MINIO_VIDEO_BUCKET__*)
      prefix=${line%%__MINIO_VIDEO_BUCKET__*}
      suffix=${line#*__MINIO_VIDEO_BUCKET__}
      printf "%s%s%s\n" "$prefix" "$MINIO_VIDEO_BUCKET" "$suffix"
      ;;
    *)
      printf "%s\n" "$line"
      ;;
  esac
done < /etc/minio/app-policy.json > "$policy_file"
mc admin policy create local esitv-media-app "$policy_file" >/dev/null 2>&1 || true

if ! mc admin user info local "$MINIO_ACCESS_KEY" >/dev/null 2>&1; then
  mc admin user add local "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
fi

mc admin policy attach local esitv-media-app --user "$MINIO_ACCESS_KEY"
echo "MinIO bucket and limited application user are ready."
