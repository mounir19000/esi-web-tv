import prisma from "@/lib/prisma"
import { authErrorStatus, requireEducator } from "@/lib/current-user"
import { refreshUploadPartUrls } from "@/lib/upload-sessions"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

type UploadSessionRouteParams = {
  sessionId: string
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

export async function POST(request: Request, context: { params: Promise<UploadSessionRouteParams> }) {
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

  let partNumbers: unknown
  try {
    partNumbers = ((await request.json()) as { partNumbers?: unknown }).partNumbers
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  if (!Array.isArray(partNumbers)) {
    return jsonError("partNumbers must be an array", 400)
  }

  try {
    const parts = await refreshUploadPartUrls(sessionId, user.id, partNumbers.map(Number))
    return NextResponse.json({ parts })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not refresh upload parts", 400)
  }
}
