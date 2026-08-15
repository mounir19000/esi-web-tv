import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildMediaProcessingJobId,
  getMediaProcessingJobOptions,
} from "../../src/lib/media-queue"

describe("media processing queue", () => {
  it("uses deterministic job IDs per video processing version", () => {
    assert.equal(buildMediaProcessingJobId("video-123", 2), "video:video-123:v2")
  })

  it("uses bounded retry and retention options", () => {
    const options = getMediaProcessingJobOptions("video-123", 1)

    assert.equal(options.jobId, "video:video-123:v1")
    assert.equal(options.attempts, 3)
    assert.deepEqual(options.backoff, { type: "exponential", delay: 30_000 })
    assert.equal(options.removeOnFail, false)
  })
})
