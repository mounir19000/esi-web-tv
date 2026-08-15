import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  getVideoMediaUrl,
  resolveStoredObjectKey,
  resolveVideoAssetObjectKey,
} from "../../src/lib/media"

describe("media URL helpers", () => {
  it("builds app-local media authorization URLs", () => {
    assert.equal(getVideoMediaUrl("video id", "source"), "/api/media/videos/video%20id/source")
  })

  it("normalizes stored object keys without exposing a public MinIO URL", () => {
    assert.equal(resolveStoredObjectKey("videos/demo.mp4"), "videos/demo.mp4")
    assert.equal(
      resolveStoredObjectKey("http://localhost:9000/esitv-videos/videos/demo.mp4"),
      "videos/demo.mp4",
    )
  })

  it("rejects unsafe or unsupported object locations", () => {
    assert.equal(resolveStoredObjectKey("../secret.mp4"), null)
    assert.equal(resolveStoredObjectKey("videos\\secret.mp4"), null)
    assert.equal(resolveStoredObjectKey("ftp://storage/videos/demo.mp4"), null)
  })

  it("only resolves media objects from the expected asset prefixes", () => {
    const video = {
      url: "videos/demo.mp4",
      thumbnailUrl: "thumbnails/demo.jpg",
    }

    assert.equal(resolveVideoAssetObjectKey(video, "source"), "videos/demo.mp4")
    assert.equal(resolveVideoAssetObjectKey(video, "thumbnail"), "thumbnails/demo.jpg")
    assert.equal(resolveVideoAssetObjectKey({ ...video, thumbnailUrl: "videos/demo.mp4" }, "thumbnail"), null)
  })
})
