import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { checkRateLimit } from "../../src/lib/rate-limit"

describe("checkRateLimit", () => {
  it("blocks requests after the configured window limit", () => {
    const key = `unit-${Date.now()}`

    assert.equal(checkRateLimit(key, 2, 1_000, 100).allowed, true)
    assert.equal(checkRateLimit(key, 2, 1_000, 200).allowed, true)
    const blocked = checkRateLimit(key, 2, 1_000, 300)

    assert.equal(blocked.allowed, false)
    assert.equal(blocked.retryAfterSeconds, 1)
  })

  it("resets buckets after the window expires", () => {
    const key = `unit-reset-${Date.now()}`

    assert.equal(checkRateLimit(key, 1, 1_000, 100).allowed, true)
    assert.equal(checkRateLimit(key, 1, 1_000, 200).allowed, false)
    assert.equal(checkRateLimit(key, 1, 1_000, 1_200).allowed, true)
  })
})
