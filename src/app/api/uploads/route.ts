import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { isEducator } from "@/lib/content-access"
import {
  allowedUploadVideoTypes,
  assertValidChecksum,
  isAllowedUploadVideoType,
  uploadContentType,
  uploadMaxBytes,
} from "@/lib/upload-policy"
import { createUploadSession } from "@/lib/upload-sessions"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

type CreateUploadRequest = {
  title?: unknown
  description?: unknown
  type?: unknown
  moduleId?: unknown
  isPublic?: unknown
  file?: {
    name?: unknown
    size?: unknown
    type?: unknown
    checksumSha256?: unknown
  }
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return jsonError("Sign in required", 401)
  }

  if (!isEducator(session.user.role)) {
    return jsonError("Forbidden", 403)
  }

  let body: CreateUploadRequest
  try {
    body = (await request.json()) as CreateUploadRequest
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const title = stringValue(body.title)
  const description = stringValue(body.description)
  const requestedType = stringValue(body.type) || "OTHER"
  const moduleId = stringValue(body.moduleId)
  const fileName = stringValue(body.file?.name)
  const expectedType = stringValue(body.file?.type)
  const expectedSize = Number(body.file?.size)

  if (!title) {
    return jsonError("Video title is required", 400)
  }

  if (!isAllowedUploadVideoType(requestedType)) {
    return jsonError(`Video type must be one of: ${allowedUploadVideoTypes.join(", ")}`, 400)
  }

  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0) {
    return jsonError("Upload a valid MP4 file", 400)
  }

  if (expectedSize > uploadMaxBytes) {
    return jsonError("Video file is too large", 413)
  }

  if (expectedType !== uploadContentType) {
    return jsonError("Only MP4 files are supported", 400)
  }

  let checksum: string | null
  try {
    checksum = assertValidChecksum(stringValue(body.file?.checksumSha256))
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid checksum", 400)
  }

  const selectedModule = moduleId
    ? await prisma.module.findUnique({ where: { id: moduleId }, select: { id: true } })
    : null

  if (moduleId && !selectedModule) {
    return jsonError("Selected module was not found", 400)
  }

  try {
    const uploadSession = await createUploadSession({
      ownerId: session.user.id,
      title,
      description: description || null,
      type: requestedType,
      isPublic:
        body.isPublic === true ||
        requestedType === "CLUB" ||
        requestedType === "EXPLANATION",
      moduleId: selectedModule?.id ?? null,
      originalFileName: fileName || null,
      expectedSize,
      expectedType,
      checksum,
    })

    return NextResponse.json({
      sessionId: uploadSession.session.id,
      expiresAt: uploadSession.session.expiresAt.toISOString(),
      partSize: uploadSession.session.expectedPartSize,
      parts: uploadSession.parts,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create upload session"
    return jsonError(message, message === "Too many active uploads" ? 409 : 400)
  }
}
