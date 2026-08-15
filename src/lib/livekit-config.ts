import { appConfig, ConfigurationError, loadAppConfig, type RuntimeEnv } from "@/lib/env"

export const LIVEKIT_MINIMUM_SECRET_LENGTH = 32

export class LiveKitConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LiveKitConfigurationError"
  }
}

export function getLiveKitCredentials(env?: RuntimeEnv) {
  try {
    const livekit = env ? loadAppConfig(env).livekit : appConfig.livekit
    return {
      apiKey: livekit.apiKey,
      apiSecret: livekit.apiSecret,
    }
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw new LiveKitConfigurationError(error.message)
    }

    throw error
  }
}
