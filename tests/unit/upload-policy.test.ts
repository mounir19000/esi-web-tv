import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  assertValidChecksum,
  getMultipartUploadParts,
  uploadPartSizeBytes,
  validateUploadedParts,
} from "../../src/lib/upload-policy"

describe("multipart upload policy", () => {
  it("plans bounded byte ranges for direct multipart uploads", () => {
    const parts = getMultipartUploadParts(uploadPartSizeBytes + 123, uploadPartSizeBytes)

    assert.deepEqual(parts, [
      {
        partNumber: 1,
        startByte: 0,
        endByte: uploadPartSizeBytes,
        size: uploadPartSizeBytes,
      },
      {
        partNumber: 2,
        startByte: uploadPartSizeBytes,
        endByte: uploadPartSizeBytes + 123,
        size: 123,
      },
    ])
  })

  it("validates the uploaded part list before completing the object", () => {
    const completionParts = validateUploadedParts(
      [
        { part: 2, etag: "etag-2", size: 123 },
        { part: 1, etag: "etag-1", size: uploadPartSizeBytes },
      ],
      uploadPartSizeBytes + 123,
      uploadPartSizeBytes,
    )

    assert.deepEqual(completionParts, [
      { part: 1, etag: "etag-1" },
      { part: 2, etag: "etag-2" },
    ])
  })

  it("rejects missing or mismatched uploaded parts", () => {
    assert.throws(
      () => validateUploadedParts([{ part: 1, size: 1 }], uploadPartSizeBytes + 123, uploadPartSizeBytes),
      /unexpected size/,
    )

    assert.throws(
      () => validateUploadedParts([{ part: 1, size: uploadPartSizeBytes }], uploadPartSizeBytes + 123),
      /Missing upload part 2/,
    )
  })

  it("accepts only SHA-256 checksum digests", () => {
    assert.equal(assertValidChecksum("A".repeat(64)), "a".repeat(64))
    assert.equal(assertValidChecksum(null), null)
    assert.throws(() => assertValidChecksum("not-a-checksum"), /SHA-256/)
  })
})
