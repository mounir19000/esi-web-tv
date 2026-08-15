const deploymentModes = ["local", "test", "production"] as const
const localHostnames = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"])

export type DeploymentMode = (typeof deploymentModes)[number]

export type AppConfig = {
  deploymentMode: DeploymentMode
  isLocalLike: boolean
  database: {
    url: string
  }
  auth: {
    secret: string
    url: string
    google:
      | { enabled: false }
      | { enabled: true; clientId: string; clientSecret: string }
  }
  livekit: {
    apiKey: string
    apiSecret: string
    publicUrl: string
    webhookUrl: string | null
    tokenTtlSeconds: number
    anonymousTokenTtlSeconds: number
    roomEmptyTimeoutSeconds: number
    roomDepartureTimeoutSeconds: number
    maxParticipants: number
    publicMaxParticipants: number
    recordingEnabled: boolean
  }
  minio: {
    endpoint: string
    port: number
    useSSL: boolean
    accessKey: string
    secretKey: string
    videoBucket: string
  }
  media: {
    signedUrlTtlSeconds: number
    maxDurationSeconds: number
    maxFramePixels: number
    ffmpegTimeoutSeconds: number
    ffmpegThreads: number
    hlsSegmentSeconds: number
  }
  queue: {
    redisUrl: string
    mediaWorkerVersion: string
    mediaWorkerConcurrency: number
  }
  seed: {
    allowDemoSeed: boolean
  }
  bootstrap: {
    adminEmail: string | null
    adminName: string
    adminPassword: string | null
  }
}

export type RuntimeEnv = Record<string, string | undefined>

export class ConfigurationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid application configuration:\n- ${issues.join("\n- ")}`)
    this.name = "ConfigurationError"
  }
}

function isDeploymentMode(value: string): value is DeploymentMode {
  return deploymentModes.includes(value as DeploymentMode)
}

function readOptional(env: RuntimeEnv, name: string) {
  const value = env[name]?.trim()
  return value ? value : null
}

function readRequired(env: RuntimeEnv, name: string, issues: string[]) {
  const value = readOptional(env, name)
  if (!value) {
    issues.push(`${name} is required.`)
    return ""
  }

  return value
}

function readFirstRequired(env: RuntimeEnv, names: string[], issues: string[]) {
  for (const name of names) {
    const value = readOptional(env, name)
    if (value) {
      return value
    }
  }

  issues.push(`${names.join(" or ")} is required.`)
  return ""
}

function parseDeploymentMode(env: RuntimeEnv, issues: string[]) {
  const value = readOptional(env, "APP_ENV")
  if (!value) {
    if (env.NODE_ENV === "production") {
      issues.push("APP_ENV is required when NODE_ENV=production.")
    }

    return "local" satisfies DeploymentMode
  }

  if (!isDeploymentMode(value)) {
    issues.push(`APP_ENV must be one of: ${deploymentModes.join(", ")}.`)
    return "production" satisfies DeploymentMode
  }

  return value
}

function parseBoolean(env: RuntimeEnv, name: string, issues: string[]) {
  const value = readRequired(env, name, issues).toLowerCase()
  if (value === "true") {
    return true
  }

  if (value === "false") {
    return false
  }

  issues.push(`${name} must be "true" or "false".`)
  return false
}

function parseOptionalBoolean(env: RuntimeEnv, name: string, defaultValue: boolean, issues: string[]) {
  const value = readOptional(env, name)
  if (!value) {
    return defaultValue
  }

  if (value.toLowerCase() === "true") {
    return true
  }

  if (value.toLowerCase() === "false") {
    return false
  }

  issues.push(`${name} must be "true" or "false".`)
  return defaultValue
}

function parseInteger(
  env: RuntimeEnv,
  name: string,
  defaultValue: number | null,
  min: number,
  max: number,
  issues: string[],
) {
  const rawValue = defaultValue === null ? readRequired(env, name, issues) : readOptional(env, name)
  if (!rawValue) {
    return defaultValue ?? min
  }

  const value = Number.parseInt(rawValue, 10)
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    issues.push(`${name} must be an integer between ${min} and ${max}.`)
    return defaultValue ?? min
  }

  return value
}

function parseUrl(env: RuntimeEnv, name: string, protocols: string[], issues: string[]) {
  const value = readRequired(env, name, issues)
  if (!value) {
    return ""
  }

  try {
    const url = new URL(value)
    if (!protocols.includes(url.protocol)) {
      issues.push(`${name} must use one of these protocols: ${protocols.join(", ")}.`)
    }
  } catch {
    issues.push(`${name} must be a valid URL.`)
  }

  return value
}

function parseOptionalUrl(env: RuntimeEnv, name: string, protocols: string[], issues: string[]) {
  const value = readOptional(env, name)
  if (!value) {
    return null
  }

  try {
    const url = new URL(value)
    if (!protocols.includes(url.protocol)) {
      issues.push(`${name} must use one of these protocols: ${protocols.join(", ")}.`)
    }
  } catch {
    issues.push(`${name} must be a valid URL.`)
  }

  return value
}

function parseOptionalEmail(env: RuntimeEnv, name: string, issues: string[]) {
  const value = readOptional(env, name)
  if (!value) {
    return null
  }

  if (!/^[^@\s]+@esi\.dz$/i.test(value)) {
    issues.push(`${name} must be an @esi.dz email address.`)
  }

  return value.toLowerCase()
}

function parseGoogleConfig(env: RuntimeEnv, issues: string[]): AppConfig["auth"]["google"] {
  const clientId = readOptional(env, "GOOGLE_CLIENT_ID")
  const clientSecret = readOptional(env, "GOOGLE_CLIENT_SECRET")

  if (!clientId && !clientSecret) {
    return { enabled: false }
  }

  if (!clientId || !clientSecret) {
    issues.push("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together.")
    return { enabled: false }
  }

  return { enabled: true, clientId, clientSecret }
}

function urlHostname(value: string) {
  try {
    return new URL(value).hostname
  } catch {
    return ""
  }
}

function urlProtocol(value: string) {
  try {
    return new URL(value).protocol
  } catch {
    return ""
  }
}

function containsAny(value: string, tokens: string[]) {
  const normalizedValue = value.toLowerCase()
  return tokens.some((token) => normalizedValue.includes(token))
}

function rejectProductionValue(
  issues: string[],
  name: string,
  value: string,
  tokens: string[],
) {
  if (value && containsAny(value, tokens)) {
    issues.push(`${name} uses a known local/demo value and is not allowed in production.`)
  }
}

function rejectProductionExactValue(issues: string[], name: string, value: string, exactValues: string[]) {
  const normalizedValue = value.toLowerCase()
  if (exactValues.some((exactValue) => normalizedValue === exactValue.toLowerCase())) {
    issues.push(`${name} uses a known local/demo value and is not allowed in production.`)
  }
}

function rejectProductionLocalUrl(issues: string[], name: string, value: string) {
  const hostname = urlHostname(value)
  if (localHostnames.has(hostname)) {
    issues.push(`${name} must not point at localhost in production.`)
  }
}

function rejectProductionOnly(
  issues: string[],
  config: Omit<AppConfig, "deploymentMode" | "isLocalLike">,
) {
  rejectProductionValue(issues, "DATABASE_URL", config.database.url, ["esitvpassword", "localhost", "127.0.0.1"])
  rejectProductionValue(issues, "AUTH_SECRET", config.auth.secret, [
    "supersecretkey123456789",
    "generate-",
    "replace-with",
    "change-me",
  ])
  rejectProductionValue(issues, "LIVEKIT_API_KEY", config.livekit.apiKey, ["devkey", "replace-with", "change-me"])
  rejectProductionExactValue(issues, "LIVEKIT_API_SECRET", config.livekit.apiSecret, ["secret"])
  rejectProductionValue(issues, "LIVEKIT_API_SECRET", config.livekit.apiSecret, ["replace-with", "change-me"])
  rejectProductionValue(issues, "MINIO_ACCESS_KEY", config.minio.accessKey, ["minioadmin", "replace-with", "change-me"])
  rejectProductionValue(issues, "MINIO_SECRET_KEY", config.minio.secretKey, ["minioadmin", "replace-with", "change-me"])
  rejectProductionValue(issues, "REDIS_URL", config.queue.redisUrl, ["localhost", "127.0.0.1"])
  rejectProductionValue(issues, "MEDIA_WORKER_VERSION", config.queue.mediaWorkerVersion, [
    "local-dev",
    "docker-local",
  ])

  rejectProductionLocalUrl(issues, "NEXTAUTH_URL", config.auth.url)
  rejectProductionLocalUrl(issues, "NEXT_PUBLIC_LIVEKIT_URL", config.livekit.publicUrl)
  if (config.livekit.webhookUrl) {
    rejectProductionLocalUrl(issues, "LIVEKIT_WEBHOOK_URL", config.livekit.webhookUrl)
  }

  if (urlProtocol(config.auth.url) !== "https:") {
    issues.push("NEXTAUTH_URL must use https in production.")
  }

  if (urlProtocol(config.livekit.publicUrl) !== "wss:") {
    issues.push("NEXT_PUBLIC_LIVEKIT_URL must use wss in production.")
  }

  if (config.seed.allowDemoSeed) {
    issues.push("ALLOW_DEMO_SEED cannot be true in production.")
  }
}

export function loadAppConfig(env: RuntimeEnv = process.env): AppConfig {
  const issues: string[] = []
  const deploymentMode = parseDeploymentMode(env, issues)
  const isLocalLike = deploymentMode === "local" || deploymentMode === "test"
  const authSecret = readFirstRequired(env, ["AUTH_SECRET", "NEXTAUTH_SECRET"], issues)
  const minioPort = parseInteger(env, "MINIO_PORT", null, 1, 65535, issues)
  const mediaSignedUrlTtlSeconds = parseInteger(
    env,
    "MEDIA_SIGNED_URL_TTL_SECONDS",
    60,
    15,
    15 * 60,
    issues,
  )
  const mediaWorkerConcurrency = parseInteger(env, "MEDIA_WORKER_CONCURRENCY", 1, 1, 64, issues)
  const mediaMaxDurationSeconds = parseInteger(env, "MEDIA_MAX_DURATION_SECONDS", 4 * 60 * 60, 1, 8 * 60 * 60, issues)
  const mediaMaxFramePixels = parseInteger(env, "MEDIA_MAX_FRAME_PIXELS", 3840 * 2160, 1, 7680 * 4320, issues)
  const mediaFfmpegTimeoutSeconds = parseInteger(env, "MEDIA_FFMPEG_TIMEOUT_SECONDS", 60 * 60, 30, 6 * 60 * 60, issues)
  const mediaFfmpegThreads = parseInteger(env, "MEDIA_FFMPEG_THREADS", 2, 1, 16, issues)
  const mediaHlsSegmentSeconds = parseInteger(env, "MEDIA_HLS_SEGMENT_SECONDS", 6, 2, 30, issues)
  const allowDemoSeed = parseOptionalBoolean(env, "ALLOW_DEMO_SEED", false, issues)
  const livekitTokenTtlSeconds = parseInteger(env, "LIVEKIT_TOKEN_TTL_SECONDS", 10 * 60, 60, 60 * 60, issues)
  const livekitAnonymousTokenTtlSeconds = parseInteger(
    env,
    "LIVEKIT_ANONYMOUS_TOKEN_TTL_SECONDS",
    2 * 60,
    30,
    15 * 60,
    issues,
  )
  const livekitRoomEmptyTimeoutSeconds = parseInteger(
    env,
    "LIVEKIT_ROOM_EMPTY_TIMEOUT_SECONDS",
    10 * 60,
    60,
    60 * 60,
    issues,
  )
  const livekitRoomDepartureTimeoutSeconds = parseInteger(
    env,
    "LIVEKIT_ROOM_DEPARTURE_TIMEOUT_SECONDS",
    60,
    5,
    10 * 60,
    issues,
  )
  const livekitMaxParticipants = parseInteger(env, "LIVEKIT_MAX_PARTICIPANTS", 100, 1, 500, issues)
  const livekitPublicMaxParticipants = parseInteger(env, "LIVEKIT_PUBLIC_MAX_PARTICIPANTS", 50, 1, 500, issues)
  const livekitRecordingEnabled = parseOptionalBoolean(env, "LIVEKIT_RECORDING_ENABLED", false, issues)

  if (authSecret && authSecret.length < 32) {
    issues.push("AUTH_SECRET or NEXTAUTH_SECRET must be at least 32 characters.")
  }

  const configWithoutMode = {
    database: {
      url: parseUrl(env, "DATABASE_URL", ["postgres:", "postgresql:"], issues),
    },
    auth: {
      secret: authSecret,
      url: parseUrl(env, "NEXTAUTH_URL", ["http:", "https:"], issues),
      google: parseGoogleConfig(env, issues),
    },
    livekit: {
      apiKey: readRequired(env, "LIVEKIT_API_KEY", issues),
      apiSecret: readRequired(env, "LIVEKIT_API_SECRET", issues),
      publicUrl: parseUrl(env, "NEXT_PUBLIC_LIVEKIT_URL", ["ws:", "wss:"], issues),
      webhookUrl: parseOptionalUrl(env, "LIVEKIT_WEBHOOK_URL", ["http:", "https:"], issues),
      tokenTtlSeconds: livekitTokenTtlSeconds,
      anonymousTokenTtlSeconds: livekitAnonymousTokenTtlSeconds,
      roomEmptyTimeoutSeconds: livekitRoomEmptyTimeoutSeconds,
      roomDepartureTimeoutSeconds: livekitRoomDepartureTimeoutSeconds,
      maxParticipants: livekitMaxParticipants,
      publicMaxParticipants: livekitPublicMaxParticipants,
      recordingEnabled: livekitRecordingEnabled,
    },
    minio: {
      endpoint: readRequired(env, "MINIO_ENDPOINT", issues),
      port: minioPort,
      useSSL: parseBoolean(env, "MINIO_USE_SSL", issues),
      accessKey: readRequired(env, "MINIO_ACCESS_KEY", issues),
      secretKey: readRequired(env, "MINIO_SECRET_KEY", issues),
      videoBucket: readRequired(env, "MINIO_VIDEO_BUCKET", issues),
    },
    media: {
      signedUrlTtlSeconds: mediaSignedUrlTtlSeconds,
      maxDurationSeconds: mediaMaxDurationSeconds,
      maxFramePixels: mediaMaxFramePixels,
      ffmpegTimeoutSeconds: mediaFfmpegTimeoutSeconds,
      ffmpegThreads: mediaFfmpegThreads,
      hlsSegmentSeconds: mediaHlsSegmentSeconds,
    },
    queue: {
      redisUrl: parseUrl(env, "REDIS_URL", ["redis:", "rediss:"], issues),
      mediaWorkerVersion: readRequired(env, "MEDIA_WORKER_VERSION", issues),
      mediaWorkerConcurrency,
    },
    seed: {
      allowDemoSeed,
    },
    bootstrap: {
      adminEmail: parseOptionalEmail(env, "BOOTSTRAP_ADMIN_EMAIL", issues),
      adminName: readOptional(env, "BOOTSTRAP_ADMIN_NAME") ?? "Bootstrap Admin",
      adminPassword: readOptional(env, "BOOTSTRAP_ADMIN_PASSWORD"),
    },
  } satisfies Omit<AppConfig, "deploymentMode" | "isLocalLike">

  if (configWithoutMode.livekit.apiSecret && configWithoutMode.livekit.apiSecret.length < 32) {
    issues.push("LIVEKIT_API_SECRET must be at least 32 characters.")
  }

  if (configWithoutMode.livekit.anonymousTokenTtlSeconds > configWithoutMode.livekit.tokenTtlSeconds) {
    issues.push("LIVEKIT_ANONYMOUS_TOKEN_TTL_SECONDS must be less than or equal to LIVEKIT_TOKEN_TTL_SECONDS.")
  }

  if (configWithoutMode.livekit.publicMaxParticipants > configWithoutMode.livekit.maxParticipants) {
    issues.push("LIVEKIT_PUBLIC_MAX_PARTICIPANTS must be less than or equal to LIVEKIT_MAX_PARTICIPANTS.")
  }

  if (configWithoutMode.minio.videoBucket && !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(configWithoutMode.minio.videoBucket)) {
    issues.push("MINIO_VIDEO_BUCKET must be a valid S3 bucket name.")
  }

  if (configWithoutMode.bootstrap.adminPassword && configWithoutMode.bootstrap.adminPassword.length < 14) {
    issues.push("BOOTSTRAP_ADMIN_PASSWORD must be at least 14 characters.")
  }

  if (!isLocalLike) {
    rejectProductionOnly(issues, configWithoutMode)
  }

  if (issues.length > 0) {
    throw new ConfigurationError(issues)
  }

  return {
    deploymentMode,
    isLocalLike,
    ...configWithoutMode,
  }
}

let cachedConfig: AppConfig | null = null

export function getAppConfig() {
  cachedConfig ??= loadAppConfig()
  return cachedConfig
}

export const appConfig = getAppConfig()
