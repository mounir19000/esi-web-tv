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
runtime_config="${LIVEKIT_RUNTIME_CONFIG:-/tmp/livekit.runtime.yaml}"

if [ ! -r "$config_path" ]; then
  echo "LiveKit configuration error: config file is not readable." >&2
  exit 1
fi

cp "$config_path" "$runtime_config"

if grep -q "__TURN_DOMAIN__" "$runtime_config"; then
  required TURN_DOMAIN "${TURN_DOMAIN:-}"
  if contains_newline "$TURN_DOMAIN"; then
    echo "LiveKit configuration error: TURN_DOMAIN must be a single-line value." >&2
    exit 1
  fi
  sed -i "s/__TURN_DOMAIN__/$TURN_DOMAIN/g" "$runtime_config"
fi

if [ -n "${LIVEKIT_WEBHOOK_URL:-}" ]; then
  if contains_newline "$LIVEKIT_WEBHOOK_URL"; then
    echo "LiveKit configuration error: LIVEKIT_WEBHOOK_URL must be a single-line value." >&2
    exit 1
  fi

  case "$LIVEKIT_WEBHOOK_URL" in
    http://*|https://*) ;;
    *)
      echo "LiveKit configuration error: LIVEKIT_WEBHOOK_URL must start with http:// or https://." >&2
      exit 1
      ;;
  esac

  case "$LIVEKIT_WEBHOOK_URL" in
    *"'"*|*'"'*)
      echo "LiveKit configuration error: LIVEKIT_WEBHOOK_URL must not contain quotes." >&2
      exit 1
      ;;
  esac

  {
    printf "\nwebhook:\n"
    printf "  api_key: '%s'\n" "$LIVEKIT_API_KEY"
    printf "  urls:\n"
    printf "    - '%s'\n" "$LIVEKIT_WEBHOOK_URL"
  } >> "$runtime_config"
fi

umask 077
printf "%s: %s\n" "$LIVEKIT_API_KEY" "$LIVEKIT_API_SECRET" > "$key_file"

exec /livekit-server --config "$runtime_config" --key-file "$key_file"
