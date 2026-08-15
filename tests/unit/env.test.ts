import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { ConfigurationError, loadAppConfig, type RuntimeEnv } from "../../src/lib/env"

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
    ...overrides,
  }
}

function expectConfigError(env: RuntimeEnv) {
  assert.throws(
    () => loadAppConfig(env),
    (error) => error instanceof ConfigurationError,
  )
}

describe("loadAppConfig", () => {
  it("returns typed config and ignores MinIO root variables for app credentials", () => {
    const config = loadAppConfig(baseEnv({
      MINIO_ROOT_USER: "root-user-should-not-be-used",
      MINIO_ROOT_PASSWORD: "root-password-should-not-be-used",
    }))

    assert.equal(config.deploymentMode, "test")
    assert.equal(config.minio.accessKey, "test-minio-app")
    assert.equal(config.minio.secretKey, "test-minio-secret")
    assert.equal(config.minio.videoBucket, "esitv-videos")
    assert.equal(config.queue.mediaWorkerConcurrency, 1)
    assert.equal(config.livekit.tokenTtlSeconds, 600)
    assert.equal(config.livekit.anonymousTokenTtlSeconds, 120)
    assert.equal(config.livekit.recordingEnabled, false)
  })

  it("fails production startup when APP_ENV is missing", () => {
    const env = baseEnv({ APP_ENV: undefined, NODE_ENV: "production" })

    assert.throws(() => loadAppConfig(env), /APP_ENV is required/)
  })

  it("accepts a complete production configuration with real service values", () => {
    const config = loadAppConfig(baseEnv({
      APP_ENV: "production",
      DATABASE_URL: "postgresql://prod_user:strong-db-password@db.example.edu:5432/esitvdb?schema=public",
      AUTH_SECRET: "prod-auth-random-value-32-characters-minimum",
      NEXTAUTH_URL: "https://web-tv.example.edu",
      LIVEKIT_API_KEY: "lk-prod-key",
      LIVEKIT_API_SECRET: "lk-prod-random-value-32-characters-minimum",
      NEXT_PUBLIC_LIVEKIT_URL: "wss://livekit.example.edu",
      LIVEKIT_WEBHOOK_URL: "https://web-tv.example.edu/api/livekit/webhook",
      MINIO_ENDPOINT: "s3.example.edu",
      MINIO_PORT: "443",
      MINIO_USE_SSL: "true",
      MINIO_ACCESS_KEY: "esitv-prod-app-access",
      MINIO_SECRET_KEY: "prod-minio-random-value-32-characters-minimum",
      REDIS_URL: "rediss://redis.example.edu:6379",
      MEDIA_WORKER_VERSION: "release-a1b2c3d4",
    }))

    assert.equal(config.deploymentMode, "production")
    assert.equal(config.minio.useSSL, true)
    assert.equal(config.livekit.publicUrl, "wss://livekit.example.edu")
    assert.equal(config.livekit.webhookUrl, "https://web-tv.example.edu/api/livekit/webhook")
  })

  it("fails clearly for each missing production variable", () => {
    const requiredNames = [
      "DATABASE_URL",
      "AUTH_SECRET",
      "NEXTAUTH_URL",
      "LIVEKIT_API_KEY",
      "LIVEKIT_API_SECRET",
      "NEXT_PUBLIC_LIVEKIT_URL",
      "MINIO_ENDPOINT",
      "MINIO_PORT",
      "MINIO_USE_SSL",
      "MINIO_ACCESS_KEY",
      "MINIO_SECRET_KEY",
      "MINIO_VIDEO_BUCKET",
      "REDIS_URL",
      "MEDIA_WORKER_VERSION",
    ]

    for (const name of requiredNames) {
      const env = baseEnv({ APP_ENV: "production", [name]: undefined })
      assert.throws(() => loadAppConfig(env), new RegExp(name))
    }
  })

  it("rejects known local/demo values in production", () => {
    const env = baseEnv({
      APP_ENV: "production",
      ALLOW_DEMO_SEED: "true",
      DATABASE_URL: "postgresql://esitv:esitvpassword@localhost:5433/esitvdb",
      AUTH_SECRET: "replace-with-a-long-random-secret",
      LIVEKIT_API_KEY: "devkey",
      LIVEKIT_API_SECRET: "secret",
      MINIO_ACCESS_KEY: "minioadmin",
      MINIO_SECRET_KEY: "minioadmin",
      MEDIA_WORKER_VERSION: "local-dev",
      LIVEKIT_WEBHOOK_URL: "http://localhost:3000/api/livekit/webhook",
    })

    assert.throws(() => loadAppConfig(env), (error) => {
      assert(error instanceof ConfigurationError)
      assert.match(error.message, /DATABASE_URL/)
      assert.match(error.message, /AUTH_SECRET/)
      assert.match(error.message, /LIVEKIT_API_KEY/)
      assert.match(error.message, /LIVEKIT_API_SECRET/)
      assert.match(error.message, /MINIO_ACCESS_KEY/)
      assert.match(error.message, /MINIO_SECRET_KEY/)
      assert.match(error.message, /NEXTAUTH_URL/)
      assert.match(error.message, /NEXT_PUBLIC_LIVEKIT_URL/)
      assert.match(error.message, /LIVEKIT_WEBHOOK_URL/)
      assert.match(error.message, /ALLOW_DEMO_SEED/)
      return true
    })
  })

  it("rejects unsafe LiveKit lifecycle limits", () => {
    assert.throws(
      () => loadAppConfig(baseEnv({ LIVEKIT_ANONYMOUS_TOKEN_TTL_SECONDS: "601" })),
      /LIVEKIT_ANONYMOUS_TOKEN_TTL_SECONDS/,
    )

    assert.throws(
      () => loadAppConfig(baseEnv({ LIVEKIT_PUBLIC_MAX_PARTICIPANTS: "101" })),
      /LIVEKIT_PUBLIC_MAX_PARTICIPANTS/,
    )
  })

  it("allows demo seeding only in explicitly local or test deployments", () => {
    assert.equal(loadAppConfig(baseEnv({ APP_ENV: "local", ALLOW_DEMO_SEED: "true" })).seed.allowDemoSeed, true)
    assert.equal(loadAppConfig(baseEnv({ APP_ENV: "test", ALLOW_DEMO_SEED: "true" })).seed.allowDemoSeed, true)

    expectConfigError(baseEnv({ APP_ENV: "production", ALLOW_DEMO_SEED: "true" }))
  })
})
