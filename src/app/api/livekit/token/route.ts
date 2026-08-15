import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { canViewScopedContent } from "@/lib/content-access"
import { getCurrentAuth } from "@/lib/current-user"
import { appConfig } from "@/lib/env"
import { checkRateLimit } from "@/lib/rate-limit"
import { StreamStatus } from "@prisma/client"
import {
  canJoinStreamRoom,
  canPublishToStream,
  createLiveKitParticipantToken,
  ensureLiveStreamRoom,
  getProviderParticipantCount,
  liveKitTokenRateLimitFor,
  liveKitTokenRateLimitKey,
} from "@/lib/livekit-lifecycle"

export const dynamic = "force-dynamic"

function clientIp(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwardedFor || req.headers.get("x-real-ip") || "unknown"
}

export async function GET(req: NextRequest) {
  const { session, user } = await getCurrentAuth()

  const room = req.nextUrl.searchParams.get("room")
  if (!room) {
    return NextResponse.json({ error: 'Missing "room" query parameter' }, { status: 400 })
  }

  const stream = await prisma.liveStream.findUnique({
    where: { streamKey: room },
    include: {
      module: true,
      cohort: true,
      liveStreamAudienceUsers: {
        select: { userId: true },
      },
    },
  })

  if (!stream) {
    return NextResponse.json({ error: "Live stream not found" }, { status: 404 })
  }

  if (session?.user && !user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 })
  }

  if (!canViewScopedContent(stream, user)) {
    return NextResponse.json(
      { error: user ? "Forbidden" : "Sign in required" },
      { status: user ? 403 : 401 },
    )
  }

  const rateLimit = liveKitTokenRateLimitFor(user)
  const rateLimitResult = checkRateLimit(
    liveKitTokenRateLimitKey(stream.id, user, clientIp(req)),
    rateLimit.limit,
    rateLimit.windowMs,
  )

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Too many token requests" },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimitResult.retryAfterSeconds) },
      },
    )
  }

  const canPublish = canPublishToStream(stream, user)
  if (!canJoinStreamRoom(stream, user)) {
    return NextResponse.json({ error: "Live stream not available" }, { status: 404 })
  }

  const participantLimit = stream.isPublic
    ? appConfig.livekit.publicMaxParticipants
    : appConfig.livekit.maxParticipants
  if (!canPublish) {
    const participantCount = await getProviderParticipantCount(stream.streamKey).catch(() => stream.participantCount)
    if (participantCount >= participantLimit) {
      return NextResponse.json({ error: "Live room is full" }, { status: 429 })
    }
  }

  const tokenStream = canPublish && (stream.status === StreamStatus.STARTING || !stream.providerRoomId)
    ? await ensureLiveStreamRoom(stream)
    : stream
  const token = await createLiveKitParticipantToken(tokenStream, user)
  return NextResponse.json({ token })
}
