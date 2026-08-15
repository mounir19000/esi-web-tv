import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { getLiveKitCredentials, LiveKitConfigurationError } from "../../src/lib/livekit-config"

describe("LiveKit configuration", () => {
  it("returns configured credentials", () => {
    const credentials = getLiveKitCredentials({
      LIVEKIT_API_KEY: "devkey",
      LIVEKIT_API_SECRET: "dev-secret-key-change-me-32-chars-minimum",
    })

    assert.deepEqual(credentials, {
      apiKey: "devkey",
      apiSecret: "dev-secret-key-change-me-32-chars-minimum",
    })
  })

  it("requires both credential values", () => {
    assert.throws(
      () => getLiveKitCredentials({ LIVEKIT_API_SECRET: "dev-secret-key-change-me-32-chars-minimum" }),
      LiveKitConfigurationError,
    )
    assert.throws(() => getLiveKitCredentials({ LIVEKIT_API_KEY: "devkey" }), LiveKitConfigurationError)
  })

  it("rejects secrets LiveKit will not accept", () => {
    assert.throws(
      () => getLiveKitCredentials({ LIVEKIT_API_KEY: "devkey", LIVEKIT_API_SECRET: "secret" }),
      /at least 32 characters/,
    )
  })
})
