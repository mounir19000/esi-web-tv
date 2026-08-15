import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { abortUploadSession } from "@/lib/upload-sessions"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

type UploadSessionRouteParams = {
  sessionId: string
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

export async function DELETE(_request: Request, context: { params: Promise<UploadSessionRouteParams> }) {
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

  try {
    await abortUploadSession(sessionId, session.user.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not abort upload", 400)
  }
}
