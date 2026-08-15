import { randomUUID } from "node:crypto"
import {
  AccessToken,
  EgressClient,
  EgressStatus,
  EncodedFileOutput,
  EncodedFileType,
  RoomServiceClient,
  type EgressInfo,
  type ParticipantInfo,
  type Room,
  type WebhookEvent,
} from "livekit-server-sdk"
import {
  RecordingJobStatus,
  RecordingPolicy,
  RecordingStatus,
  Role,
  StreamStatus,
  VideoStatus,
  VideoType,
  type Prisma,
} from "@prisma/client"
import prisma from "@/lib/prisma"
import { appConfig } from "@/lib/env"
import { MEDIA_OBJECT_PREFIXES, resolveStoredObjectKey } from "@/lib/media"
import { enqueueVideoProcessing, retryVideoProcessing } from "@/lib/media-queue"
import { getMinioClient, VIDEO_BUCKET_NAME } from "@/lib/minio"
import type { CurrentUser } from "@/lib/current-user"
import { canManageUserContent } from "@/lib/content-access"

const providerActiveStatuses: StreamStatus[] = [StreamStatus.STARTING, StreamStatus.LIVE, StreamStatus.ENDING]
const joinableStatuses: StreamStatus[] = [StreamStatus.STARTING, StreamStatus.LIVE]
const activeRecordingJobStatuses: RecordingJobStatus[] = [
  RecordingJobStatus.STARTING,
  RecordingJobStatus.ACTIVE,
  RecordingJobStatus.ENDING,
]
const egressProtectedRecordingStatuses: RecordingStatus[] = [
  RecordingStatus.PROCESSING,
  RecordingStatus.PUBLISHED,
  RecordingStatus.DISCARDED,
]
const zeroBigInt = BigInt(0)
const nanosecondsPerSecond = BigInt(1_000_000_000)
const nanosecondsPerMillisecond = BigInt(1_000_000)
const maxReasonableUnixSeconds = BigInt(9_999_999_999)
const staleStartingMs = 15 * 60 * 1000
const liveKitRateLimitWindowMs = 60 * 1000

type LiveStreamWithModule = Prisma.LiveStreamGetPayload<{ include: { module: true } }>
type RecordingWithStream = Prisma.RecordingGetPayload<{ include: { stream: true } }>

export class LiveKitLifecycleError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message)
    this.name = "LiveKitLifecycleError"
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "LiveKit operation failed"
}

function truncateErrorMessage(message: string) {
  return message.length > 1_000 ? `${message.slice(0, 997)}...` : message
}

function isProviderNotFound(error: unknown) {
  const message = errorMessage(error).toLowerCase()
  return message.includes("not found") || message.includes("does not exist") || message.includes("404")
}

function isProviderAlreadyExists(error: unknown) {
  const message = errorMessage(error).toLowerCase()
  return message.includes("already exists") || message.includes("409")
}

export function getLiveKitApiUrl(publicUrl = appConfig.livekit.publicUrl) {
  const url = new URL(publicUrl)

  if (url.protocol === "ws:") {
    url.protocol = "http:"
  } else if (url.protocol === "wss:") {
    url.protocol = "https:"
  }

  url.pathname = "/"
  url.search = ""
  url.hash = ""

  return url.toString()
}

export function getLiveKitRoomServiceClient() {
  return new RoomServiceClient(getLiveKitApiUrl(), appConfig.livekit.apiKey, appConfig.livekit.apiSecret)
}

export function getLiveKitEgressClient() {
  return new EgressClient(getLiveKitApiUrl(), appConfig.livekit.apiKey, appConfig.livekit.apiSecret)
}

function liveKitRoomMetadata(stream: Pick<LiveStreamWithModule, "id" | "hostId" | "moduleId" | "recordingPolicy">) {
  return JSON.stringify({
    app: "esi-web-tv",
    streamId: stream.id,
    hostId: stream.hostId,
    moduleId: stream.moduleId,
    recordingPolicy: stream.recordingPolicy,
  })
}

async function findProviderRoom(roomName: string) {
  const [room] = await getLiveKitRoomServiceClient().listRooms([roomName])
  return room ?? null
}

export async function ensureLiveStreamRoom(stream: LiveStreamWithModule) {
  let room = await findProviderRoom(stream.streamKey)

  if (!room) {
    try {
      room = await getLiveKitRoomServiceClient().createRoom({
        name: stream.streamKey,
        emptyTimeout: appConfig.livekit.roomEmptyTimeoutSeconds,
        departureTimeout: appConfig.livekit.roomDepartureTimeoutSeconds,
        maxParticipants: stream.isPublic
          ? appConfig.livekit.publicMaxParticipants
          : appConfig.livekit.maxParticipants,
        metadata: liveKitRoomMetadata(stream),
      })
    } catch (error) {
      if (!isProviderAlreadyExists(error)) {
        await prisma.liveStream.update({
          where: { id: stream.id },
          data: {
            status: StreamStatus.FAILED,
            isLive: false,
            endedAt: new Date(),
          },
        })
        throw error
      }

      room = await findProviderRoom(stream.streamKey)
      if (!room) {
        throw error
      }
    }
  }

  return prisma.liveStream.update({
    where: { id: stream.id },
    data: {
      status: stream.status === StreamStatus.LIVE ? StreamStatus.LIVE : StreamStatus.STARTING,
      isLive: stream.status === StreamStatus.LIVE,
      providerRoomId: room.sid || stream.providerRoomId,
      participantCount: room.numParticipants,
      endedAt: null,
    },
    include: { module: true },
  })
}

export function canPublishToStream(stream: Pick<LiveStreamWithModule, "hostId">, user: CurrentUser | null | undefined) {
  return canManageUserContent(stream.hostId, user)
}

export function canJoinStreamRoom(stream: Pick<LiveStreamWithModule, "status" | "isLive" | "hostId">, user: CurrentUser | null | undefined) {
  if (!joinableStatuses.includes(stream.status)) {
    return false
  }

  if (canPublishToStream(stream, user)) {
    return true
  }

  return stream.status === StreamStatus.LIVE && stream.isLive
}

export function liveKitTokenRateLimitKey(streamId: string, user: CurrentUser | null | undefined, ipAddress: string) {
  return user?.id ? `livekit-token:${streamId}:user:${user.id}` : `livekit-token:${streamId}:ip:${ipAddress}`
}

export function liveKitTokenRateLimitFor(user: CurrentUser | null | undefined) {
  return {
    limit: user ? 60 : 20,
    windowMs: liveKitRateLimitWindowMs,
  }
}

export type LiveKitParticipantMetadata = {
  participantSessionId: string
  userId: string | null
  role: Role | "VISITOR"
  streamId: string
  canPublish: boolean
}

export function parseLiveKitParticipantMetadata(metadata?: string | null) {
  if (!metadata) {
    return null
  }

  try {
    const parsed = JSON.parse(metadata) as Partial<LiveKitParticipantMetadata>
    return {
      participantSessionId: typeof parsed.participantSessionId === "string" ? parsed.participantSessionId : null,
      userId: typeof parsed.userId === "string" ? parsed.userId : null,
      role: typeof parsed.role === "string" ? parsed.role : null,
      streamId: typeof parsed.streamId === "string" ? parsed.streamId : null,
      canPublish: parsed.canPublish === true,
    }
  } catch {
    return null
  }
}

export function buildParticipantIdentity(user: CurrentUser | null | undefined, participantSessionId: string = randomUUID()) {
  return user?.id ? `user-${user.id}-${participantSessionId}` : `guest-${participantSessionId}`
}

export async function createLiveKitParticipantToken(
  stream: Pick<LiveStreamWithModule, "id" | "streamKey" | "hostId">,
  user: CurrentUser | null | undefined,
) {
  const participantSessionId = randomUUID()
  const canPublish = canPublishToStream(stream, user)
  const role = user?.role ?? "VISITOR"
  const metadata: LiveKitParticipantMetadata = {
    participantSessionId,
    userId: user?.id ?? null,
    role,
    streamId: stream.id,
    canPublish,
  }
  const attributes = {
    "esi.streamId": stream.id,
    "esi.participantSessionId": participantSessionId,
    ...(user?.id ? { "esi.userId": user.id } : {}),
    "esi.role": role,
  }

  const token = new AccessToken(appConfig.livekit.apiKey, appConfig.livekit.apiSecret, {
    identity: buildParticipantIdentity(user, participantSessionId),
    name: user?.name || user?.email || "Guest",
    ttl: user ? appConfig.livekit.tokenTtlSeconds : appConfig.livekit.anonymousTokenTtlSeconds,
    metadata: JSON.stringify(metadata),
    attributes,
  })

  token.addGrant({
    room: stream.streamKey,
    roomJoin: true,
    canPublish,
    canSubscribe: true,
    canPublishData: canPublish || Boolean(user),
    canUpdateOwnMetadata: false,
    roomAdmin: false,
    roomRecord: false,
  })

  return token.toJwt()
}

export async function getProviderParticipantCount(roomName: string) {
  try {
    const participants = await getLiveKitRoomServiceClient().listParticipants(roomName)
    return participants.length
  } catch (error) {
    if (isProviderNotFound(error)) {
      return 0
    }

    throw error
  }
}

function isTrustedPublishingParticipant(
  stream: Pick<LiveStreamWithModule, "hostId">,
  participant: ParticipantInfo | undefined,
) {
  const metadata = parseLiveKitParticipantMetadata(participant?.metadata)
  return Boolean(
    metadata?.canPublish &&
      (metadata.userId === stream.hostId || metadata.role === Role.ADMIN),
  )
}

export function mapEgressStatus(status: EgressStatus) {
  switch (status) {
    case EgressStatus.EGRESS_STARTING:
      return RecordingJobStatus.STARTING
    case EgressStatus.EGRESS_ACTIVE:
      return RecordingJobStatus.ACTIVE
    case EgressStatus.EGRESS_ENDING:
      return RecordingJobStatus.ENDING
    case EgressStatus.EGRESS_COMPLETE:
      return RecordingJobStatus.COMPLETED
    case EgressStatus.EGRESS_ABORTED:
      return RecordingJobStatus.ABORTED
    case EgressStatus.EGRESS_FAILED:
    case EgressStatus.EGRESS_LIMIT_REACHED:
    default:
      return RecordingJobStatus.FAILED
  }
}

function isTerminalEgressStatus(status: EgressStatus) {
  return [
    EgressStatus.EGRESS_COMPLETE,
    EgressStatus.EGRESS_FAILED,
    EgressStatus.EGRESS_ABORTED,
    EgressStatus.EGRESS_LIMIT_REACHED,
  ].includes(status)
}

function egressStatusErrorCode(status: EgressStatus) {
  if (status === EgressStatus.EGRESS_ABORTED) {
    return "EGRESS_ABORTED"
  }

  if (status === EgressStatus.EGRESS_LIMIT_REACHED) {
    return "EGRESS_LIMIT_REACHED"
  }

  return "EGRESS_FAILED"
}

function durationSecondsFromNanoseconds(duration: bigint) {
  return duration > zeroBigInt ? Math.max(1, Number(duration / nanosecondsPerSecond)) : null
}

function egressTimestampToDate(timestamp: bigint) {
  if (timestamp <= zeroBigInt) {
    return null
  }

  const milliseconds = timestamp > maxReasonableUnixSeconds
    ? Number(timestamp / nanosecondsPerMillisecond)
    : Number(timestamp) * 1000

  return new Date(milliseconds)
}

function resolveRecordingObjectKey(jobOutputKey: string, egressInfo: EgressInfo) {
  const fileInfo = egressInfo.fileResults[0]
  const candidate = resolveStoredObjectKey(fileInfo?.filename || fileInfo?.location || "")
  return candidate?.startsWith(MEDIA_OBJECT_PREFIXES.recording) ? candidate : jobOutputKey
}

async function createFailedRecordingForDisabledEgress(stream: Pick<LiveStreamWithModule, "id">) {
  const recording = await prisma.recording.create({
    data: {
      streamId: stream.id,
      status: RecordingStatus.FAILED,
      errorCode: "RECORDING_DISABLED",
      errorMessage: "Live recording is disabled in application configuration.",
      startedAt: new Date(),
      completedAt: new Date(),
    },
  })

  await prisma.recordingJob.create({
    data: {
      streamId: stream.id,
      recordingId: recording.id,
      outputKey: `${MEDIA_OBJECT_PREFIXES.recording}${stream.id}/${recording.id}.mp4`,
      status: RecordingJobStatus.FAILED,
      errorCode: "RECORDING_DISABLED",
      errorMessage: "Live recording is disabled in application configuration.",
      startedAt: new Date(),
      endedAt: new Date(),
    },
  })

  return recording
}

export async function startRecordingForStream(stream: Pick<LiveStreamWithModule, "id" | "streamKey" | "recordingPolicy">) {
  if (stream.recordingPolicy !== RecordingPolicy.AUTO) {
    return null
  }

  const existingRecording = await prisma.recording.findFirst({
    where: {
      streamId: stream.id,
      status: {
        in: [
          RecordingStatus.RECORDING,
          RecordingStatus.READY,
          RecordingStatus.PROCESSING,
          RecordingStatus.PUBLISHED,
        ],
      },
    },
  })

  if (existingRecording) {
    return existingRecording
  }

  const activeJob = await prisma.recordingJob.findFirst({
    where: {
      streamId: stream.id,
      status: { in: activeRecordingJobStatuses },
    },
  })

  if (activeJob) {
    return activeJob
  }

  if (!appConfig.livekit.recordingEnabled) {
    return createFailedRecordingForDisabledEgress(stream)
  }

  const now = new Date()
  const recording = await prisma.recording.create({
    data: {
      streamId: stream.id,
      status: RecordingStatus.RECORDING,
      startedAt: now,
    },
  })
  const outputKey = `${MEDIA_OBJECT_PREFIXES.recording}${stream.id}/${recording.id}.mp4`
  const job = await prisma.recordingJob.create({
    data: {
      streamId: stream.id,
      recordingId: recording.id,
      outputKey,
      status: RecordingJobStatus.STARTING,
      startedAt: now,
    },
  })

  try {
    const egressInfo = await getLiveKitEgressClient().startRoomCompositeEgress(
      stream.streamKey,
      new EncodedFileOutput({
        fileType: EncodedFileType.MP4,
        filepath: outputKey,
      }),
      {
        layout: "grid",
      },
    )

    await handleLiveKitEgressInfo(egressInfo, job.id)
    return prisma.recordingJob.findUnique({ where: { id: job.id } })
  } catch (error) {
    const message = truncateErrorMessage(errorMessage(error))
    await prisma.recordingJob.update({
      where: { id: job.id },
      data: {
        status: RecordingJobStatus.FAILED,
        errorCode: "EGRESS_START_FAILED",
        errorMessage: message,
        endedAt: new Date(),
      },
    })
    await prisma.recording.update({
      where: { id: recording.id },
      data: {
        status: RecordingStatus.FAILED,
        errorCode: "EGRESS_START_FAILED",
        errorMessage: message,
        completedAt: new Date(),
      },
    })

    return null
  }
}

export async function stopActiveRecordingsForStream(streamId: string) {
  const jobs = await prisma.recordingJob.findMany({
    where: {
      streamId,
      status: { in: [RecordingJobStatus.STARTING, RecordingJobStatus.ACTIVE] },
      providerEgressId: { not: null },
    },
  })

  await prisma.recordingJob.updateMany({
    where: {
      streamId,
      status: { in: [RecordingJobStatus.STARTING, RecordingJobStatus.ACTIVE] },
    },
    data: { status: RecordingJobStatus.ENDING },
  })

  const results = await Promise.allSettled(
    jobs.map(async (job) => getLiveKitEgressClient().stopEgress(job.providerEgressId as string)),
  )

  await Promise.all(
    results.map(async (result, index) => {
      const job = jobs[index]
      if (!job) {
        return
      }

      if (result.status === "fulfilled") {
        await handleLiveKitEgressInfo(result.value, job.id)
        return
      }

      if (isProviderNotFound(result.reason)) {
        await prisma.recordingJob.update({
          where: { id: job.id },
          data: {
            status: RecordingJobStatus.ABORTED,
            endedAt: new Date(),
          },
        })
      }
    }),
  )
}

export async function endLiveStream(streamId: string) {
  const stream = await prisma.liveStream.findUnique({
    where: { id: streamId },
    include: { module: true },
  })

  if (!stream) {
    return null
  }

  await prisma.liveStream.updateMany({
    where: {
      id: stream.id,
      status: { in: providerActiveStatuses },
    },
    data: {
      status: StreamStatus.ENDING,
      isLive: false,
    },
  })

  await stopActiveRecordingsForStream(stream.id)

  try {
    await getLiveKitRoomServiceClient().deleteRoom(stream.streamKey)
  } catch (error) {
    if (!isProviderNotFound(error)) {
      await prisma.liveStream.update({
        where: { id: stream.id },
        data: {
          status: StreamStatus.FAILED,
          isLive: false,
          endedAt: new Date(),
        },
      })
      throw error
    }
  }

  return prisma.liveStream.update({
    where: { id: stream.id },
    data: {
      status: StreamStatus.ENDED,
      isLive: false,
      participantCount: 0,
      endedAt: new Date(),
      lastProviderEventAt: new Date(),
    },
  })
}

async function findStreamByRoom(room: Room | undefined) {
  if (!room?.name) {
    return null
  }

  return prisma.liveStream.findUnique({
    where: { streamKey: room.name },
    include: { module: true },
  })
}

async function markRoomStarted(room: Room) {
  const stream = await findStreamByRoom(room)
  if (!stream) {
    return
  }

  await prisma.liveStream.update({
    where: { id: stream.id },
    data: {
      status: stream.status === StreamStatus.LIVE ? StreamStatus.LIVE : StreamStatus.STARTING,
      providerRoomId: room.sid || stream.providerRoomId,
      participantCount: room.numParticipants,
      lastProviderEventAt: new Date(),
    },
  })
}

async function markParticipantJoined(room: Room, participant?: ParticipantInfo) {
  const stream = await findStreamByRoom(room)
  if (!stream) {
    return
  }

  const now = new Date()
  const data: Prisma.LiveStreamUpdateInput = {
    providerRoomId: room.sid || stream.providerRoomId,
    participantCount: room.numParticipants,
    lastProviderEventAt: now,
  }
  const shouldMarkLive = isTrustedPublishingParticipant(stream, participant)

  if (shouldMarkLive && joinableStatuses.includes(stream.status)) {
    data.status = StreamStatus.LIVE
    data.isLive = true
    data.startedAt = stream.startedAt ?? now
    data.endedAt = null
  }

  const updatedStream = await prisma.liveStream.update({
    where: { id: stream.id },
    data,
  })

  if (shouldMarkLive && updatedStream.status === StreamStatus.LIVE) {
    await startRecordingForStream(updatedStream)
  }
}

async function markParticipantLeft(room: Room) {
  const stream = await findStreamByRoom(room)
  if (!stream) {
    return
  }

  await prisma.liveStream.update({
    where: { id: stream.id },
    data: {
      providerRoomId: room.sid || stream.providerRoomId,
      participantCount: room.numParticipants,
      lastProviderEventAt: new Date(),
    },
  })
}

async function markRoomFinished(room: Room) {
  const stream = await findStreamByRoom(room)
  if (!stream) {
    return
  }

  await prisma.liveStream.update({
    where: { id: stream.id },
    data: {
      status: StreamStatus.ENDED,
      isLive: false,
      providerRoomId: room.sid || stream.providerRoomId,
      participantCount: 0,
      endedAt: new Date(),
      lastProviderEventAt: new Date(),
    },
  })
}

export async function handleLiveKitEgressInfo(egressInfo: EgressInfo, fallbackJobId?: string) {
  const job = egressInfo.egressId
    ? await prisma.recordingJob.findUnique({ where: { providerEgressId: egressInfo.egressId } })
    : null
  const recordingJob = job ?? (fallbackJobId ? await prisma.recordingJob.findUnique({ where: { id: fallbackJobId } }) : null)

  if (!recordingJob) {
    return null
  }

  const recording = await prisma.recording.findUnique({ where: { id: recordingJob.recordingId } })
  const canApplyEgressState = Boolean(
    recording &&
      !egressProtectedRecordingStatuses.includes(recording.status),
  )

  const jobStatus = mapEgressStatus(egressInfo.status)
  const fileInfo = egressInfo.fileResults[0]
  const outputKey = resolveRecordingObjectKey(recordingJob.outputKey, egressInfo)
  const startedAt = egressTimestampToDate(egressInfo.startedAt) ?? recordingJob.startedAt
  const endedAt = egressTimestampToDate(egressInfo.endedAt)

  await prisma.recordingJob.update({
    where: { id: recordingJob.id },
    data: {
      status: jobStatus,
      providerEgressId: egressInfo.egressId || recordingJob.providerEgressId,
      outputKey,
      errorCode: egressInfo.errorCode ? String(egressInfo.errorCode) : null,
      errorMessage: egressInfo.error || egressInfo.details || null,
      startedAt,
      endedAt: endedAt ?? (isTerminalEgressStatus(egressInfo.status) ? new Date() : recordingJob.endedAt),
    },
  })

  if (egressInfo.status === EgressStatus.EGRESS_COMPLETE) {
    if (!canApplyEgressState) {
      return recording
    }

    return prisma.recording.update({
      where: { id: recordingJob.recordingId },
      data: {
        status: RecordingStatus.READY,
        objectKey: outputKey,
        sizeBytes: fileInfo?.size && fileInfo.size > zeroBigInt ? fileInfo.size : undefined,
        durationSeconds: fileInfo ? durationSecondsFromNanoseconds(fileInfo.duration) : undefined,
        errorCode: null,
        errorMessage: null,
        completedAt: endedAt ?? new Date(),
      },
    })
  }

  if (isTerminalEgressStatus(egressInfo.status)) {
    if (!canApplyEgressState) {
      return recording
    }

    return prisma.recording.update({
      where: { id: recordingJob.recordingId },
      data: {
        status: RecordingStatus.FAILED,
        errorCode: egressStatusErrorCode(egressInfo.status),
        errorMessage: egressInfo.error || egressInfo.details || "Recording did not complete.",
        completedAt: endedAt ?? new Date(),
      },
    })
  }

  if (!canApplyEgressState) {
    return recording
  }

  return prisma.recording.update({
    where: { id: recordingJob.recordingId },
    data: {
      status: RecordingStatus.RECORDING,
      startedAt,
    },
  })
}

export async function handleLiveKitWebhookEvent(event: WebhookEvent) {
  switch (event.event) {
    case "room_started":
      if (event.room) {
        await markRoomStarted(event.room)
      }
      return
    case "participant_joined":
      if (event.room) {
        await markParticipantJoined(event.room, event.participant)
      }
      return
    case "participant_left":
    case "participant_connection_aborted":
      if (event.room) {
        await markParticipantLeft(event.room)
      }
      return
    case "room_finished":
      if (event.room) {
        await markRoomFinished(event.room)
      }
      return
    case "egress_started":
    case "egress_updated":
    case "egress_ended":
      if (event.egressInfo) {
        await handleLiveKitEgressInfo(event.egressInfo)
      }
      return
    default:
      return
  }
}

export async function reconcileLiveKitState() {
  const rooms = await getLiveKitRoomServiceClient().listRooms()
  const roomsByName = new Map(rooms.map((room) => [room.name, room]))
  const staleStartingCutoff = new Date(Date.now() - staleStartingMs)
  const activeStreams = await prisma.liveStream.findMany({
    where: { status: { in: providerActiveStatuses } },
    take: 200,
  })
  let ended = 0
  let updated = 0

  for (const stream of activeStreams) {
    const room = roomsByName.get(stream.streamKey)

    if (!room) {
      const shouldEnd =
        stream.status === StreamStatus.LIVE ||
        stream.status === StreamStatus.ENDING ||
        (stream.status === StreamStatus.STARTING && stream.createdAt < staleStartingCutoff)

      if (shouldEnd) {
        await prisma.liveStream.update({
          where: { id: stream.id },
          data: {
            status: StreamStatus.ENDED,
            isLive: false,
            participantCount: 0,
            endedAt: stream.endedAt ?? new Date(),
            lastProviderEventAt: new Date(),
          },
        })
        ended += 1
      }

      continue
    }

    if (stream.status === StreamStatus.ENDING) {
      await endLiveStream(stream.id)
      ended += 1
      continue
    }

    const participants = await getLiveKitRoomServiceClient().listParticipants(stream.streamKey)
    const hostActive = participants.some((participant) => isTrustedPublishingParticipant(stream, participant))
    const nextStatus = hostActive ? StreamStatus.LIVE : stream.status
    await prisma.liveStream.update({
      where: { id: stream.id },
      data: {
        status: nextStatus,
        isLive: nextStatus === StreamStatus.LIVE,
        providerRoomId: room.sid || stream.providerRoomId,
        participantCount: room.numParticipants,
        startedAt: hostActive ? stream.startedAt ?? new Date() : stream.startedAt,
        lastProviderEventAt: new Date(),
      },
    })

    if (hostActive) {
      await startRecordingForStream(stream)
    }

    updated += 1
  }

  let reconciledEgress = 0
  if (appConfig.livekit.recordingEnabled) {
    const activeEgresses = await getLiveKitEgressClient().listEgress({ active: true })
    for (const egressInfo of activeEgresses) {
      await handleLiveKitEgressInfo(egressInfo)
      reconciledEgress += 1
    }
  }

  return {
    scannedStreams: activeStreams.length,
    providerRooms: rooms.length,
    updated,
    ended,
    reconciledEgress,
  }
}

export async function publishRecording(recordingId: string, user: CurrentUser) {
  const recording = await prisma.recording.findUnique({
    where: { id: recordingId },
    include: { stream: true },
  })

  if (!recording || !canManageUserContent(recording.stream.hostId, user)) {
    throw new LiveKitLifecycleError("Unauthorized", "UNAUTHORIZED")
  }

  if (recording.status !== RecordingStatus.READY || !recording.objectKey) {
    throw new LiveKitLifecycleError("Recording is not ready to publish.", "RECORDING_NOT_READY")
  }

  if (recording.publishedVideoId) {
    return recording.publishedVideoId
  }

  const video = await prisma.video.create({
    data: {
      title: `${recording.stream.title} recording`,
      description: recording.stream.description,
      type: recording.stream.moduleId ? VideoType.TEACHING : VideoType.OTHER,
      audience: recording.stream.audience,
      isPublic: recording.stream.isPublic,
      status: VideoStatus.PENDING,
      url: "",
      thumbnailUrl: null,
      sourceKey: recording.objectKey,
      uploaderId: recording.stream.hostId,
      ...(recording.stream.moduleId ? { moduleId: recording.stream.moduleId } : {}),
      ...(recording.stream.cohortId ? { cohortId: recording.stream.cohortId } : {}),
    },
  })

  await prisma.recording.update({
    where: { id: recording.id },
    data: {
      status: RecordingStatus.PROCESSING,
      publishedVideoId: video.id,
      errorCode: null,
      errorMessage: null,
    },
  })

  try {
    await enqueueVideoProcessing(video.id, video.processingVersion)
  } catch (error) {
    const message = truncateErrorMessage(errorMessage(error))
    await prisma.video.update({
      where: { id: video.id },
      data: {
        status: VideoStatus.FAILED,
        processingErrorCode: "QUEUE_ENQUEUE_FAILED",
        processingErrorMessage: message,
      },
    })
    await prisma.recording.update({
      where: { id: recording.id },
      data: {
        status: RecordingStatus.FAILED,
        errorCode: "QUEUE_ENQUEUE_FAILED",
        errorMessage: message,
      },
    })
    throw error
  }

  return video.id
}

export async function discardRecording(recordingId: string, user: CurrentUser) {
  const recording = await prisma.recording.findUnique({
    where: { id: recordingId },
    include: { stream: true },
  })

  if (!recording || !canManageUserContent(recording.stream.hostId, user)) {
    throw new LiveKitLifecycleError("Unauthorized", "UNAUTHORIZED")
  }

  if (recording.status === RecordingStatus.PUBLISHED || recording.status === RecordingStatus.PROCESSING) {
    throw new LiveKitLifecycleError("Published recordings cannot be discarded here.", "RECORDING_ALREADY_PUBLISHED")
  }

  if (recording.objectKey) {
    await getMinioClient().removeObject(VIDEO_BUCKET_NAME, recording.objectKey)
  }

  return prisma.recording.update({
    where: { id: recording.id },
    data: {
      status: RecordingStatus.DISCARDED,
      discardedAt: new Date(),
    },
  })
}

export async function retryRecording(recordingId: string, user: CurrentUser) {
  const recording = await prisma.recording.findUnique({
    where: { id: recordingId },
    include: { stream: true },
  })

  if (!recording || !canManageUserContent(recording.stream.hostId, user)) {
    throw new LiveKitLifecycleError("Unauthorized", "UNAUTHORIZED")
  }

  if (recording.status !== RecordingStatus.FAILED) {
    throw new LiveKitLifecycleError("Recording cannot be retried now.", "RECORDING_NOT_RETRYABLE")
  }

  if (recording.publishedVideoId) {
    const job = await retryVideoProcessing(recording.publishedVideoId)
    if (!job) {
      throw new LiveKitLifecycleError("Recording publish cannot be retried now.", "RECORDING_NOT_RETRYABLE")
    }

    await prisma.recording.update({
      where: { id: recording.id },
      data: {
        status: RecordingStatus.PROCESSING,
        errorCode: null,
        errorMessage: null,
      },
    })
    return job
  }

  if (recording.stream.status !== StreamStatus.LIVE) {
    throw new LiveKitLifecycleError("Recording cannot be retried now.", "RECORDING_NOT_RETRYABLE")
  }

  return startRecordingForStream(recording.stream)
}

export function canDownloadRecording(recording: RecordingWithStream, user: CurrentUser | null | undefined) {
  return Boolean(recording.objectKey && canManageUserContent(recording.stream.hostId, user))
}
