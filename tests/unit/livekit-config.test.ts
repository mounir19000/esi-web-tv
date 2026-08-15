import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { getLiveKitCredentials, LiveKitConfigurationError } from "../../src/lib/livekit-config"
import type { RuntimeEnv } from "../../src/lib/env"

function baseEnv(overrides: RuntimeEnv = {}): RuntimeEnv {
  return {
    APP_ENV: "test",
    ALLOW_DEMO_SEED: "false",
    DATABASE_URL: "postgresql://test_user:test_password@localhost:5433/esitvdb?schema=public",
    AUTH_SECRET: "test-auth-secret-with-at-least-32-characters",
    NEXTAUTH_URL: "http://localhost:3000",
    LIVEKIT_API_KEY: "test-livekit-key",
    LIVEKIT_API_SECRET: "test-livekit-secret-with-at-least-32-chars",
    NEXT_PUBLIC_LIVEKIT_URL: "ws://localhost:7880",
    LIVEKIT_TOKEN_TTL_SECONDS: "600",
    LIVEKIT_ANONYMOUS_TOKEN_TTL_SECONDS: "120",
    LIVEKIT_ROOM_EMPTY_TIMEOUT_SECONDS: "600",
    LIVEKIT_ROOM_DEPARTURE_TIMEOUT_SECONDS: "60",
    LIVEKIT_MAX_PARTICIPANTS: "100",
    LIVEKIT_PUBLIC_MAX_PARTICIPANTS: "50",
    LIVEKIT_RECORDING_ENABLED: "false",
    MINIO_ENDPOINT: "localhost",
    MINIO_PORT: "9000",
    MINIO_USE_SSL: "false",
    MINIO_ACCESS_KEY: "test-minio-app",
    MINIO_SECRET_KEY: "test-minio-secret",
    MINIO_VIDEO_BUCKET: "esitv-videos",
    REDIS_URL: "redis://localhost:6379",
    MEDIA_WORKER_VERSION: "test-suite",
    MEDIA_WORKER_CONCURRENCY: "1",
    MEDIA_MAX_DURATION_SECONDS: "14400",
    MEDIA_MAX_FRAME_PIXELS: "8294400",
    MEDIA_FFMPEG_TIMEOUT_SECONDS: "3600",
    MEDIA_FFMPEG_THREADS: "2",
    MEDIA_HLS_SEGMENT_SECONDS: "6",
    ...overrides,
  }
}

describe("LiveKit configuration", () => {
  it("returns configured credentials", () => {
    const credentials = getLiveKitCredentials(baseEnv())

    assert.deepEqual(credentials, {
      apiKey: "test-livekit-key",
      apiSecret: "test-livekit-secret-with-at-least-32-chars",
    })
  })

  it("requires both credential values", () => {
    assert.throws(
      () => getLiveKitCredentials(baseEnv({ LIVEKIT_API_KEY: undefined })),
      LiveKitConfigurationError,
    )
    assert.throws(
      () => getLiveKitCredentials(baseEnv({ LIVEKIT_API_SECRET: undefined })),
      LiveKitConfigurationError,
    )
  })

  it("rejects secrets LiveKit will not accept", () => {
    assert.throws(
      () => getLiveKitCredentials(baseEnv({ LIVEKIT_API_SECRET: "short" })),
      /at least 32 characters/,
    )
  })
})
