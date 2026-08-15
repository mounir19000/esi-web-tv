import { auth } from "@/auth"
import prisma from "@/lib/prisma"
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
  const session = await auth()
  if (!session?.user) {
    return jsonError("Sign in required", 401)
  }

  const { sessionId } = await context.params
  const uploadSession = await prisma.uploadSession.findUnique({
    where: { id: sessionId },
    select: { ownerId: true },
  })

  if (!uploadSession) {
    return jsonError("Upload session not found", 404)
  }

  if (uploadSession.ownerId !== session.user.id) {
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
    const parts = await refreshUploadPartUrls(sessionId, session.user.id, partNumbers.map(Number))
    return NextResponse.json({ parts })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not refresh upload parts", 400)
  }
}
