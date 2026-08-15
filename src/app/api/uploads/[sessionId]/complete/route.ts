import prisma from "@/lib/prisma"
import { authErrorStatus, requireEducator } from "@/lib/current-user"
import { completeUploadSession } from "@/lib/upload-sessions"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

type UploadSessionRouteParams = {
  sessionId: string
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

export async function POST(_request: Request, context: { params: Promise<UploadSessionRouteParams> }) {
  let user: Awaited<ReturnType<typeof requireEducator>>
  try {
    user = await requireEducator()
  } catch (error) {
    const status = authErrorStatus(error)
    if (status) {
      return jsonError(status === 401 ? "Sign in required" : "Forbidden", status)
    }
    throw error
  }

  const { sessionId } = await context.params
  const uploadSession = await prisma.uploadSession.findUnique({
    where: { id: sessionId },
    select: { ownerId: true },
  })

  if (!uploadSession) {
    return jsonError("Upload session not found", 404)
  }

  if (uploadSession.ownerId !== user.id) {
    return jsonError("Forbidden", 403)
  }

  try {
    const video = await completeUploadSession(sessionId, user.id)
    if (!video) {
      return jsonError("Upload session not found", 404)
    }

    return NextResponse.json({
      videoId: video.id,
      videoUrl: `/video/${video.id}`,
    })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not complete upload", 400)
  }
}
