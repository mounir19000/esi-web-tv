import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/current-user"
import { canDownloadRecording } from "@/lib/livekit-lifecycle"
import { getMinioClient, VIDEO_BUCKET_NAME } from "@/lib/minio"
import { appConfig } from "@/lib/env"

export const dynamic = "force-dynamic"

type RecordingDownloadRouteParams = {
  recordingId: string
}

export async function GET(_request: Request, context: { params: Promise<RecordingDownloadRouteParams> }) {
  const user = await getCurrentUser()
  const { recordingId } = await context.params
  const recording = await prisma.recording.findUnique({
    where: { id: recordingId },
    include: { stream: true },
  })

  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 })
  }

  if (!canDownloadRecording(recording, user)) {
    return NextResponse.json({ error: user ? "Forbidden" : "Sign in required" }, { status: user ? 403 : 401 })
  }

  const url = await getMinioClient().presignedGetObject(
    VIDEO_BUCKET_NAME,
    recording.objectKey as string,
    appConfig.media.signedUrlTtlSeconds,
  )

  return NextResponse.redirect(url)
}
