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
import {
  boundedLongText,
  boundedText,
  parseAudience,
  parseVideoType,
  stringInput,
  validationLimits,
  type FieldErrors,
} from "@/lib/validation"
import { checkRateLimit } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"
const uploadInitRateLimitMax = 20
const uploadInitRateLimitWindowMs = 60_000

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

function jsonValidationError(error: string, fieldErrors: FieldErrors, status = 400) {
  return NextResponse.json({ error, fieldErrors }, { status })
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

  const rateLimit = checkRateLimit(`upload-init:${user.id}`, uploadInitRateLimitMax, uploadInitRateLimitWindowMs)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many upload attempts" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    )
  }

  let body: CreateUploadRequest
  try {
    body = (await request.json()) as CreateUploadRequest
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const fieldErrors: FieldErrors = {}
  const title = boundedText("title", body.title, validationLimits.titleMax, fieldErrors, true)
  const description = boundedLongText("description", body.description, validationLimits.descriptionMax, fieldErrors)
  const requestedType = parseVideoType(body.type || "OTHER", fieldErrors)
  const moduleId = stringInput(body.moduleId)
  const fallbackAudience = body.isPublic === true ? AudienceType.PUBLIC : moduleId ? AudienceType.MODULE : AudienceType.ESI
  const audience = parseAudience(body.audience, fieldErrors, fallbackAudience)
  const fileName = stringInput(body.file?.name)
  const expectedType = stringInput(body.file?.type)
  const expectedSize = Number(body.file?.size)

  if (requestedType && !isAllowedUploadVideoType(requestedType)) {
    return jsonError(`Video type must be one of: ${allowedUploadVideoTypes.join(", ")}`, 400)
  }

  if (!audience || !requestedType || Object.keys(fieldErrors).length > 0) {
    return jsonValidationError("Please fix the highlighted fields.", fieldErrors)
  }

  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0) {
    return jsonValidationError("Upload a valid MP4 file", { file: "Upload a valid MP4 file" })
  }

  if (expectedSize > uploadMaxBytes) {
    return jsonValidationError("Video file is too large", { file: "Video file is too large" }, 413)
  }

  if (expectedType !== uploadContentType) {
    return jsonValidationError("Only MP4 files are supported", { file: "Only MP4 files are supported" })
  }

  let checksum: string | null
  try {
    checksum = assertValidChecksum(stringInput(body.file?.checksumSha256))
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
      description,
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
