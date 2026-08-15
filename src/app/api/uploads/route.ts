import prisma from "@/lib/prisma"
import { authErrorStatus, requireEducator } from "@/lib/current-user"
import { canPublishToAudience, validateAudienceSelection } from "@/lib/content-access"
import {
  allowedUploadVideoTypes,
  assertValidChecksum,
  isAllowedUploadVideoType,
  uploadContentType,
  uploadMaxBytes,
} from "@/lib/upload-policy"
import { createUploadSession } from "@/lib/upload-sessions"
import { AudienceType } from "@prisma/client"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

type CreateUploadRequest = {
  title?: unknown
  description?: unknown
  type?: unknown
  audience?: unknown
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

function isAudienceType(value: string): value is AudienceType {
  return Object.values(AudienceType).includes(value as AudienceType)
}

export async function POST(request: Request) {
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
  const fallbackAudience = body.isPublic === true ? AudienceType.PUBLIC : moduleId ? AudienceType.MODULE : AudienceType.ESI
  const requestedAudience = stringValue(body.audience)
  let audience: AudienceType = fallbackAudience
  const fileName = stringValue(body.file?.name)
  const expectedType = stringValue(body.file?.type)
  const expectedSize = Number(body.file?.size)

  if (!title) {
    return jsonError("Video title is required", 400)
  }

  if (!isAllowedUploadVideoType(requestedType)) {
    return jsonError(`Video type must be one of: ${allowedUploadVideoTypes.join(", ")}`, 400)
  }

  if (requestedAudience && !isAudienceType(requestedAudience)) {
    return jsonError(`Audience must be one of: ${Object.values(AudienceType).join(", ")}`, 400)
  }
  if (requestedAudience) {
    audience = requestedAudience as AudienceType
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

  const audienceError = validateAudienceSelection({ audience, moduleId: selectedModule?.id ?? null })
  if (audienceError) {
    return jsonError(audienceError, 400)
  }

  if (!canPublishToAudience(user, { audience, moduleId: selectedModule?.id ?? null })) {
    return jsonError("You cannot publish to that audience", 403)
  }

  try {
    const uploadSession = await createUploadSession({
      ownerId: user.id,
      title,
      description: description || null,
      type: requestedType,
      audience,
      isPublic: audience === AudienceType.PUBLIC,
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
