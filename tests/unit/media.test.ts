import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  getVideoHlsUrl,
  getVideoMediaUrl,
  rewriteHlsPlaylist,
  resolveStoredObjectKey,
  resolveVideoAssetObjectKey,
} from "../../src/lib/media"
import { buildAdaptiveRenditionPlan } from "../../src/lib/ffmpeg"
import {
  CaptionValidationError,
  normalizeCaptionLanguage,
  normalizeCaptionLabel,
  validateWebVttText,
} from "../../src/lib/captions"

describe("media URL helpers", () => {
  it("builds app-local media authorization URLs", () => {
    assert.equal(getVideoMediaUrl("video id", "source"), "/api/media/videos/video%20id/source")
    assert.equal(getVideoHlsUrl("video id", "720p/index.m3u8"), "/api/media/videos/video%20id/hls/720p/index.m3u8")
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

  it("rewrites relative HLS playlist URIs to protected app routes", () => {
    const playlist = [
      "#EXTM3U",
      "#EXT-X-STREAM-INF:BANDWIDTH=800000",
      "360p/index.m3u8",
      "#EXTINF:6.0,",
      "segment-0001.ts",
      "",
    ].join("\n")

    assert.equal(
      rewriteHlsPlaylist("video id", "master.m3u8", playlist),
      [
        "#EXTM3U",
        "#EXT-X-STREAM-INF:BANDWIDTH=800000",
        "/api/media/videos/video%20id/hls/360p/index.m3u8",
        "#EXTINF:6.0,",
        "/api/media/videos/video%20id/hls/segment-0001.ts",
        "",
      ].join("\n"),
    )
  })
})

describe("buildAdaptiveRenditionPlan", () => {
  it("generates a full landscape ladder up to source height", () => {
    assert.deepEqual(
      buildAdaptiveRenditionPlan({ width: 1920, height: 1080 }).map((rendition) => `${rendition.width}x${rendition.height}`),
      ["640x360", "854x480", "1280x720", "1920x1080"],
    )
  })

  it("does not upscale low-resolution sources", () => {
    assert.deepEqual(
      buildAdaptiveRenditionPlan({ width: 320, height: 180 }).map((rendition) => `${rendition.width}x${rendition.height}`),
      ["320x180"],
    )
  })

  it("preserves portrait and square source aspect ratios", () => {
    assert.deepEqual(
      buildAdaptiveRenditionPlan({ width: 720, height: 1280 }).map((rendition) => `${rendition.width}x${rendition.height}`),
      ["202x360", "270x480", "406x720", "608x1080"],
    )
    assert.deepEqual(
      buildAdaptiveRenditionPlan({ width: 600, height: 600 }).map((rendition) => `${rendition.width}x${rendition.height}`),
      ["360x360", "480x480", "600x600"],
    )
  })
})

describe("caption helpers", () => {
  it("normalizes caption language and labels", () => {
    assert.equal(normalizeCaptionLanguage(" EN-US "), "en-us")
    assert.equal(normalizeCaptionLabel(" Intro captions ", "en"), "Intro captions")
    assert.equal(normalizeCaptionLabel("", "fr"), "FR")
  })

  it("accepts valid WebVTT text", () => {
    assert.equal(
      validateWebVttText("\uFEFFWEBVTT\r\n\r\n00:00.000 --> 00:01.000\r\nHello"),
      "WEBVTT\n\n00:00.000 --> 00:01.000\nHello\n",
    )
  })

  it("rejects invalid caption metadata and files", () => {
    assert.throws(() => normalizeCaptionLanguage("not a locale!"), CaptionValidationError)
    assert.throws(() => validateWebVttText("00:00.000 --> 00:01.000\nHello"), CaptionValidationError)
  })
})
