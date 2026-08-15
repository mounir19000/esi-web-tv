import { createHash } from "node:crypto"
import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { pipeline } from "node:stream/promises"
import ffmpeg from "fluent-ffmpeg"
import { MediaAssetType, ThumbnailStatus } from "@prisma/client"
import { appConfig } from "@/lib/env"
import { MEDIA_OBJECT_PREFIXES } from "@/lib/media"
import { getMinioClient, initBuckets, VIDEO_BUCKET_NAME } from "@/lib/minio"

type FfprobeStream = {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  duration?: string | number
}

type FfprobeData = {
  streams: FfprobeStream[]
  format: {
    format_name?: string
    duration?: string | number
    bit_rate?: string | number
  }
}

type FfmpegCommand = ReturnType<typeof ffmpeg>

export type SourceMediaMetadata = {
  durationSeconds: number
  width: number
  height: number
  videoCodec: string
  audioCodec: string | null
  container: string
  bitrate: number | null
  hasAudio: boolean
}

export type RenditionPlan = {
  label: string
  width: number
  height: number
  bitrate: number
  maxrate: number
  bufsize: number
}

export type GeneratedMediaAsset = {
  type: MediaAssetType
  storageKey: string
  contentType: string
  sizeBytes: bigint
  checksumSha256: string
  variantLabel?: string
  label?: string
  language?: string
  isDefault?: boolean
}

export type GeneratedVideoVariant = {
  label: string
  width: number
  height: number
  bitrate: number
  codec: string
  playlistKey: string
}

export type TranscodeResult = {
  videoUrl: string
  thumbnailUrl: string | null
  thumbnailStatus: ThumbnailStatus
  variants: GeneratedVideoVariant[]
  assets: GeneratedMediaAsset[]
}

export class MediaPipelineError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message)
    this.name = "MediaPipelineError"
  }
}

const supportedContainers = new Set(["mov", "mp4", "m4a", "3gp", "3g2", "mj2"])
const supportedVideoCodecs = new Set(["h264", "hevc", "mpeg4", "av1", "vp9"])
const supportedAudioCodecs = new Set(["aac", "mp3", "opus", "vorbis"])
const renditionLadder = [
  { label: "360p", height: 360, bitrate: 800_000 },
  { label: "480p", height: 480, bitrate: 1_400_000 },
  { label: "720p", height: 720, bitrate: 2_800_000 },
  { label: "1080p", height: 1080, bitrate: 5_000_000 },
]

function streamDurationSeconds(stream: FfprobeStream | undefined) {
  const duration = Number.parseFloat(String(stream?.duration ?? ""))
  return Number.isFinite(duration) && duration > 0 ? duration : null
}

function formatDurationSeconds(format: FfprobeData["format"]) {
  const duration = Number.parseFloat(String(format.duration ?? ""))
  return Number.isFinite(duration) && duration > 0 ? duration : null
}

function formatBitrate(format: FfprobeData["format"]) {
  const bitrate = Number.parseInt(String(format.bit_rate ?? ""), 10)
  return Number.isSafeInteger(bitrate) && bitrate > 0 ? bitrate : null
}

function roundEven(value: number) {
  return Math.max(2, Math.round(value / 2) * 2)
}

function parseContainer(formatName: string | undefined) {
  return (formatName || "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
}

function firstVideoStream(metadata: FfprobeData) {
  return metadata.streams.find((stream) => stream.codec_type === "video")
}

function firstAudioStream(metadata: FfprobeData) {
  return metadata.streams.find((stream) => stream.codec_type === "audio")
}

function hlsCodecString(hasAudio: boolean) {
  return hasAudio ? "avc1.4d401f,mp4a.40.2" : "avc1.4d401f"
}

function objectContentType(storageKey: string) {
  if (storageKey.endsWith(".m3u8")) {
    return "application/vnd.apple.mpegurl"
  }

  if (storageKey.endsWith(".ts")) {
    return "video/mp2t"
  }

  if (storageKey.endsWith(".jpg") || storageKey.endsWith(".jpeg")) {
    return "image/jpeg"
  }

  if (storageKey.endsWith(".vtt")) {
    return "text/vtt; charset=utf-8"
  }

  return "application/octet-stream"
}

function formatTimestamp(seconds: number) {
  const safeSeconds = Math.max(0, seconds)
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const wholeSeconds = Math.floor(safeSeconds % 60)
  const milliseconds = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 1000)
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`
}

export async function probeMediaSource(inputFilePath: string): Promise<SourceMediaMetadata> {
  const metadata = await new Promise<FfprobeData>((resolve, reject) => {
    ffmpeg.ffprobe(inputFilePath, (error: Error | null, data: FfprobeData) => {
      if (error) {
        reject(new MediaPipelineError("MEDIA_VALIDATION_FAILED", "Uploaded file is not readable media", false))
        return
      }

      resolve(data)
    })
  })

  const videoStream = firstVideoStream(metadata)
  if (!videoStream?.width || !videoStream.height || !videoStream.codec_name) {
    throw new MediaPipelineError("MEDIA_VALIDATION_FAILED", "Uploaded file does not contain a usable video stream", false)
  }

  const audioStream = firstAudioStream(metadata)
  const containerNames = parseContainer(metadata.format.format_name)
  const container = containerNames[0] || "unknown"
  const durationSeconds = streamDurationSeconds(videoStream) ?? formatDurationSeconds(metadata.format)
  if (!durationSeconds) {
    throw new MediaPipelineError("MEDIA_VALIDATION_FAILED", "Uploaded file does not expose a valid duration", false)
  }

  const source: SourceMediaMetadata = {
    durationSeconds,
    width: videoStream.width,
    height: videoStream.height,
    videoCodec: videoStream.codec_name.toLowerCase(),
    audioCodec: audioStream?.codec_name?.toLowerCase() ?? null,
    container,
    bitrate: formatBitrate(metadata.format),
    hasAudio: Boolean(audioStream),
  }

  assertSupportedSource(source, containerNames)
  return source
}

export function assertSupportedSource(source: SourceMediaMetadata, containerNames = [source.container]) {
  if (!containerNames.some((container) => supportedContainers.has(container))) {
    throw new MediaPipelineError("UNSUPPORTED_CONTAINER", "Only MP4-compatible source containers are supported.", false)
  }

  if (!supportedVideoCodecs.has(source.videoCodec)) {
    throw new MediaPipelineError("UNSUPPORTED_VIDEO_CODEC", `Unsupported video codec: ${source.videoCodec}`, false)
  }

  if (source.audioCodec && !supportedAudioCodecs.has(source.audioCodec)) {
    throw new MediaPipelineError("UNSUPPORTED_AUDIO_CODEC", `Unsupported audio codec: ${source.audioCodec}`, false)
  }

  if (source.durationSeconds > appConfig.media.maxDurationSeconds) {
    throw new MediaPipelineError("SOURCE_TOO_LONG", "Source video exceeds the configured duration limit.", false)
  }

  if (source.width * source.height > appConfig.media.maxFramePixels) {
    throw new MediaPipelineError("SOURCE_TOO_COMPLEX", "Source video exceeds the configured frame-size limit.", false)
  }
}

export function buildAdaptiveRenditionPlan(source: Pick<SourceMediaMetadata, "width" | "height">): RenditionPlan[] {
  const sourceHeight = roundEven(source.height)
  const aspectRatio = source.width / source.height
  const heights = renditionLadder
    .map((rendition) => rendition.height)
    .filter((height) => height <= sourceHeight)

  if (heights.length === 0) {
    heights.push(sourceHeight)
  } else if (!heights.includes(sourceHeight) && sourceHeight < renditionLadder[renditionLadder.length - 1].height) {
    heights.push(sourceHeight)
  }

  return [...new Set(heights)]
    .sort((a, b) => a - b)
    .map((height) => {
      const ladderMatch = renditionLadder.find((rendition) => rendition.height === height)
      const width = roundEven(height * aspectRatio)
      const bitrate = ladderMatch?.bitrate ?? Math.max(350_000, Math.round((width * height * 2.4)))
      return {
        label: ladderMatch?.label ?? `${height}p`,
        width,
        height,
        bitrate,
        maxrate: Math.round(bitrate * 1.2),
        bufsize: Math.round(bitrate * 2),
      }
    })
}

async function sha256File(filePath: string) {
  const hash = createHash("sha256")
  await pipeline(fs.createReadStream(filePath), hash)
  return hash.digest("hex")
}

export async function sha256LocalFile(filePath: string) {
  return sha256File(filePath)
}

async function uploadLocalAsset(
  filePath: string,
  storageKey: string,
  type: MediaAssetType,
  extra: Pick<GeneratedMediaAsset, "variantLabel" | "label" | "language" | "isDefault"> = {},
): Promise<GeneratedMediaAsset> {
  const minioClient = getMinioClient()
  const stat = await fsp.stat(filePath)
  const checksumSha256 = await sha256File(filePath)
  const contentType = objectContentType(storageKey)

  await minioClient.fPutObject(VIDEO_BUCKET_NAME, storageKey, filePath, {
    "Content-Type": contentType,
  })

  return {
    type,
    storageKey,
    contentType,
    sizeBytes: BigInt(stat.size),
    checksumSha256,
    ...extra,
  }
}

async function runFfmpeg(command: FfmpegCommand) {
  const timeoutMs = appConfig.media.ffmpegTimeoutSeconds * 1000
  let timedOut = false

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      timedOut = true
      command.kill("SIGKILL")
    }, timeoutMs)

    command
      .on("end", () => {
        clearTimeout(timer)
        resolve()
      })
      .on("error", (error) => {
        clearTimeout(timer)
        const code = timedOut ? "FFMPEG_TIMEOUT" : "FFMPEG_FAILED"
        const message = timedOut ? "FFmpeg exceeded the configured execution time." : error.message
        reject(new MediaPipelineError(code, message, !timedOut))
      })
      .run()
  })
}

async function writeMasterManifest(
  filePath: string,
  variants: GeneratedVideoVariant[],
  hasAudio: boolean,
) {
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    ...variants.flatMap((variant) => [
      `#EXT-X-STREAM-INF:BANDWIDTH=${variant.bitrate},RESOLUTION=${variant.width}x${variant.height},CODECS="${hlsCodecString(hasAudio)}"`,
      `${variant.label}/index.m3u8`,
    ]),
    "",
  ]

  await fsp.writeFile(filePath, lines.join("\n"))
}

async function generateHlsVariant(
  inputFilePath: string,
  videoId: string,
  plan: RenditionPlan,
  workDir: string,
  hasAudio: boolean,
) {
  const variantDir = path.join(workDir, plan.label)
  await fsp.mkdir(variantDir, { recursive: true })
  const playlistPath = path.join(variantDir, "index.m3u8")
  const segmentPattern = path.join(variantDir, "segment-%04d.ts")
  const hlsSegmentSeconds = String(appConfig.media.hlsSegmentSeconds)
  const gopSize = String(Math.max(24, appConfig.media.hlsSegmentSeconds * 30))
  const command = ffmpeg(inputFilePath)
    .output(playlistPath)
    .outputOptions([
      "-map 0:v:0",
      ...(hasAudio ? ["-map 0:a:0"] : ["-an"]),
      "-sn",
      "-c:v libx264",
      "-preset veryfast",
      "-crf 23",
      `-maxrate ${Math.round(plan.maxrate / 1000)}k`,
      `-bufsize ${Math.round(plan.bufsize / 1000)}k`,
      `-threads ${appConfig.media.ffmpegThreads}`,
      `-vf scale=-2:${plan.height}`,
      `-g ${gopSize}`,
      `-keyint_min ${gopSize}`,
      "-sc_threshold 0",
      ...(hasAudio ? ["-c:a aac", "-b:a 128k"] : []),
      "-f hls",
      `-hls_time ${hlsSegmentSeconds}`,
      "-hls_playlist_type vod",
      "-hls_flags independent_segments",
      `-hls_segment_filename ${segmentPattern}`,
    ])

  await runFfmpeg(command)

  const playlistKey = `${MEDIA_OBJECT_PREFIXES.readyVideo}${videoId}/hls/${plan.label}/index.m3u8`
  const assets = [
    await uploadLocalAsset(playlistPath, playlistKey, MediaAssetType.HLS_VARIANT_PLAYLIST, {
      variantLabel: plan.label,
    }),
  ]
  const segmentNames = (await fsp.readdir(variantDir))
    .filter((fileName) => fileName.endsWith(".ts"))
    .sort()

  for (const segmentName of segmentNames) {
    assets.push(
      await uploadLocalAsset(
        path.join(variantDir, segmentName),
        `${MEDIA_OBJECT_PREFIXES.readyVideo}${videoId}/hls/${plan.label}/${segmentName}`,
        MediaAssetType.HLS_SEGMENT,
        { variantLabel: plan.label },
      ),
    )
  }

  return {
    variant: {
      label: plan.label,
      width: plan.width,
      height: plan.height,
      bitrate: plan.bitrate,
      codec: hlsCodecString(hasAudio),
      playlistKey,
    } satisfies GeneratedVideoVariant,
    assets,
  }
}

async function generateThumbnail(inputFilePath: string, videoId: string, workDir: string, durationSeconds: number) {
  const thumbnailTimestamp = durationSeconds <= 0.25
    ? 0
    : Math.min(Math.max(0.1, durationSeconds * 0.1), Math.max(0, durationSeconds - 0.05), 5)
  const thumbnailFileName = `${videoId}-thumb.jpg`
  const thumbnailPath = path.join(workDir, thumbnailFileName)
  const command = ffmpeg(inputFilePath)
    .output(thumbnailPath)
    .outputOptions([
      `-ss ${formatTimestamp(thumbnailTimestamp)}`,
      "-frames:v 1",
      "-vf scale='min(1280,iw)':-2",
      `-threads ${appConfig.media.ffmpegThreads}`,
    ])

  try {
    await runFfmpeg(command)
  } catch {
    return {
      thumbnailUrl: null,
      thumbnailStatus: ThumbnailStatus.FAILED,
      asset: null,
    }
  }

  if (!fs.existsSync(thumbnailPath)) {
    return {
      thumbnailUrl: null,
      thumbnailStatus: ThumbnailStatus.SKIPPED,
      asset: null,
    }
  }

  const storageKey = `${MEDIA_OBJECT_PREFIXES.thumbnail}${videoId}-thumb.jpg`
  return {
    thumbnailUrl: storageKey,
    thumbnailStatus: ThumbnailStatus.READY,
    asset: await uploadLocalAsset(thumbnailPath, storageKey, MediaAssetType.THUMBNAIL),
  }
}

export const transcodeAndUpload = async (
  inputFilePath: string,
  videoId: string,
  sourceMetadata?: SourceMediaMetadata,
): Promise<TranscodeResult> => {
  await initBuckets()

  const metadata = sourceMetadata ?? await probeMediaSource(inputFilePath)
  const workDir = path.join(path.dirname(inputFilePath), `${videoId}-adaptive`)
  await fsp.mkdir(workDir, { recursive: true })

  const renditionPlan = buildAdaptiveRenditionPlan(metadata)
  const variants: GeneratedVideoVariant[] = []
  const assets: GeneratedMediaAsset[] = []

  for (const plan of renditionPlan) {
    const generated = await generateHlsVariant(inputFilePath, videoId, plan, workDir, metadata.hasAudio)
    variants.push(generated.variant)
    assets.push(...generated.assets)
  }

  const masterKey = `${MEDIA_OBJECT_PREFIXES.readyVideo}${videoId}/hls/master.m3u8`
  const masterPath = path.join(workDir, "master.m3u8")
  await writeMasterManifest(masterPath, variants, metadata.hasAudio)
  assets.push(await uploadLocalAsset(masterPath, masterKey, MediaAssetType.HLS_MASTER))

  const thumbnail = await generateThumbnail(inputFilePath, videoId, workDir, metadata.durationSeconds)
  if (thumbnail.asset) {
    assets.push(thumbnail.asset)
  }

  return {
    videoUrl: masterKey,
    thumbnailUrl: thumbnail.thumbnailUrl,
    thumbnailStatus: thumbnail.thumbnailStatus,
    variants,
    assets,
  }
}
