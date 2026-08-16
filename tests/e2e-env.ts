import "dotenv/config"

function normalizedRunId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "local"
}

function databaseNameForRun(runId: string) {
  return `esitv_e2e_${runId.replace(/-/g, "_")}`
}

function bucketNameForRun(runId: string) {
  return `esitv-e2e-${runId}`.slice(0, 63).replace(/-+$/g, "")
}

function withDatabaseName(connectionString: string, databaseName: string) {
  const url = new URL(connectionString)
  url.pathname = `/${databaseName}`
  return url.toString()
}

const defaultDatabaseUrl = "postgresql://esitv:esitvpassword@localhost:5433/esitvdb?schema=public"
const runId = normalizedRunId(process.env.E2E_RUN_ID ?? "local")
const databaseName = process.env.E2E_DATABASE_NAME ?? databaseNameForRun(runId)
const databaseUrl = process.env.E2E_DATABASE_URL ?? withDatabaseName(process.env.DATABASE_URL ?? defaultDatabaseUrl, databaseName)
const bucketName = process.env.E2E_MINIO_BUCKET ?? bucketNameForRun(runId)
const liveKitApiSecret =
  process.env.E2E_LIVEKIT_API_SECRET ??
  (process.env.LIVEKIT_API_SECRET && process.env.LIVEKIT_API_SECRET.length >= 32
    ? process.env.LIVEKIT_API_SECRET
    : "dev-secret-key-change-me-32-chars-minimum")

export const e2ePort = Number.parseInt(process.env.E2E_PORT ?? "3100", 10)
const nextAuthUrl = process.env.E2E_NEXTAUTH_URL ?? `http://localhost:${e2ePort}`
const minioEndpoint = process.env.E2E_MINIO_ENDPOINT ?? process.env.MINIO_ENDPOINT ?? "localhost"
const minioPort = process.env.E2E_MINIO_PORT ?? process.env.MINIO_PORT ?? "9000"
const minioUseSsl = process.env.E2E_MINIO_USE_SSL ?? process.env.MINIO_USE_SSL ?? "false"
const minioProtocol = minioUseSsl === "true" ? "https" : "http"

export const e2eRun = {
  id: runId,
  databaseName,
  bucketName,
  databaseUrl,
}

export const e2eEnv = {
  ...process.env,
  E2E_RUN_ID: runId,
  E2E_DATABASE_NAME: databaseName,
  E2E_DATABASE_URL: databaseUrl,
  E2E_MINIO_BUCKET: bucketName,
  APP_ENV: "test",
  ALLOW_DEMO_SEED: "false",
  DATABASE_URL: databaseUrl,
  AUTH_SECRET: process.env.E2E_AUTH_SECRET ?? "e2e-auth-secret-with-at-least-32-characters",
  NEXTAUTH_URL: nextAuthUrl,
  NEXT_PUBLIC_APP_URL: process.env.E2E_PUBLIC_APP_URL ?? nextAuthUrl,
  AUTH_TRUST_HOST: "true",
  LIVEKIT_API_KEY: process.env.E2E_LIVEKIT_API_KEY ?? process.env.LIVEKIT_API_KEY ?? "devkey",
  LIVEKIT_API_SECRET: liveKitApiSecret,
  NEXT_PUBLIC_LIVEKIT_URL: process.env.E2E_LIVEKIT_URL ?? "ws://127.0.0.1:7880",
  LIVEKIT_TOKEN_TTL_SECONDS: process.env.LIVEKIT_TOKEN_TTL_SECONDS ?? "600",
  LIVEKIT_ANONYMOUS_TOKEN_TTL_SECONDS: process.env.LIVEKIT_ANONYMOUS_TOKEN_TTL_SECONDS ?? "120",
  LIVEKIT_ROOM_EMPTY_TIMEOUT_SECONDS: process.env.LIVEKIT_ROOM_EMPTY_TIMEOUT_SECONDS ?? "600",
  LIVEKIT_ROOM_DEPARTURE_TIMEOUT_SECONDS: process.env.LIVEKIT_ROOM_DEPARTURE_TIMEOUT_SECONDS ?? "60",
  LIVEKIT_MAX_PARTICIPANTS: process.env.LIVEKIT_MAX_PARTICIPANTS ?? "100",
  LIVEKIT_PUBLIC_MAX_PARTICIPANTS: process.env.LIVEKIT_PUBLIC_MAX_PARTICIPANTS ?? "50",
  LIVEKIT_RECORDING_ENABLED: process.env.LIVEKIT_RECORDING_ENABLED ?? "false",
  MINIO_ENDPOINT: minioEndpoint,
  MINIO_PORT: minioPort,
  MINIO_USE_SSL: minioUseSsl,
  MINIO_ACCESS_KEY: process.env.E2E_MINIO_ACCESS_KEY ?? process.env.MINIO_ROOT_USER ?? "local-minio-root",
  MINIO_SECRET_KEY:
    process.env.E2E_MINIO_SECRET_KEY ?? process.env.MINIO_ROOT_PASSWORD ?? "local-minio-root-password-change-me",
  MINIO_VIDEO_BUCKET: bucketName,
  NEXT_PUBLIC_MEDIA_URL: process.env.E2E_PUBLIC_MEDIA_URL ?? `${minioProtocol}://${minioEndpoint}:${minioPort}`,
  REDIS_URL: process.env.E2E_REDIS_URL ?? process.env.REDIS_URL ?? "redis://localhost:6379",
  MEDIA_SIGNED_URL_TTL_SECONDS: process.env.MEDIA_SIGNED_URL_TTL_SECONDS ?? "60",
  MEDIA_MAX_DURATION_SECONDS: process.env.MEDIA_MAX_DURATION_SECONDS ?? "14400",
  MEDIA_MAX_FRAME_PIXELS: process.env.MEDIA_MAX_FRAME_PIXELS ?? "8294400",
  MEDIA_FFMPEG_TIMEOUT_SECONDS: process.env.MEDIA_FFMPEG_TIMEOUT_SECONDS ?? "3600",
  MEDIA_FFMPEG_THREADS: process.env.MEDIA_FFMPEG_THREADS ?? "2",
  MEDIA_HLS_SEGMENT_SECONDS: process.env.MEDIA_HLS_SEGMENT_SECONDS ?? "6",
  MEDIA_WORKER_VERSION: `e2e-${runId}`,
  MEDIA_WORKER_CONCURRENCY: "1",
} satisfies NodeJS.ProcessEnv

Object.assign(process.env, e2eEnv)
