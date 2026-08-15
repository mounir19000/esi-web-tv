#!/bin/sh
set -eu

required() {
  name="$1"
  value="${2:-}"

  if [ -z "$value" ]; then
    echo "LiveKit configuration error: $name is required." >&2
    exit 1
  fi
}

contains_newline() {
  case "$1" in
    *'
'*) return 0 ;;
    *) return 1 ;;
  esac
}

required LIVEKIT_API_KEY "${LIVEKIT_API_KEY:-}"
required LIVEKIT_API_SECRET "${LIVEKIT_API_SECRET:-}"

if contains_newline "$LIVEKIT_API_KEY" || contains_newline "$LIVEKIT_API_SECRET"; then
  echo "LiveKit configuration error: credentials must be single-line values." >&2
  exit 1
fi

case "$LIVEKIT_API_KEY" in
  *:*)
    echo "LiveKit configuration error: LIVEKIT_API_KEY must not contain ':'." >&2
    exit 1
    ;;
esac

if [ "${#LIVEKIT_API_SECRET}" -lt 32 ]; then
  echo "LiveKit configuration error: LIVEKIT_API_SECRET must be at least 32 characters." >&2
  exit 1
fi

config_path="${LIVEKIT_CONFIG_PATH:-/etc/livekit/livekit.yaml}"
key_file="${LIVEKIT_KEY_FILE:-/tmp/livekit.keys}"

if [ ! -r "$config_path" ]; then
  echo "LiveKit configuration error: config file is not readable." >&2
  exit 1
fi

umask 077
printf "%s: %s\n" "$LIVEKIT_API_KEY" "$LIVEKIT_API_SECRET" > "$key_file"

exec /livekit-server --config "$config_path" --key-file "$key_file"
