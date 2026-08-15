export const LIVEKIT_MINIMUM_SECRET_LENGTH = 32

export class LiveKitConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LiveKitConfigurationError"
  }
}

type LiveKitCredentialEnv = {
  LIVEKIT_API_KEY?: string
  LIVEKIT_API_SECRET?: string
}

export function getLiveKitCredentials(env: LiveKitCredentialEnv = process.env) {
  const apiKey = env.LIVEKIT_API_KEY?.trim()
  const apiSecret = env.LIVEKIT_API_SECRET?.trim()

  if (!apiKey) {
    throw new LiveKitConfigurationError("LIVEKIT_API_KEY is required")
  }

  if (!apiSecret) {
    throw new LiveKitConfigurationError("LIVEKIT_API_SECRET is required")
  }

  if (apiSecret.length < LIVEKIT_MINIMUM_SECRET_LENGTH) {
    throw new LiveKitConfigurationError(
      `LIVEKIT_API_SECRET must be at least ${LIVEKIT_MINIMUM_SECRET_LENGTH} characters`,
    )
  }

  return { apiKey, apiSecret }
}
