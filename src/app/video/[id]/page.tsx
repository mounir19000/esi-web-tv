import Link from "next/link"
import { revalidatePath } from "next/cache"
import { notFound, redirect } from "next/navigation"
import { AudienceType, AuditEventType, MediaAssetStatus, MediaAssetType, ProvisioningStatus, Role, ThumbnailStatus, VideoStatus } from "@prisma/client"
import prisma from "@/lib/prisma"
import { attachCaptionAsset, CaptionValidationError } from "@/lib/captions"
import { canManageUserContent, canPublishToAudience, canViewScopedContent, validateAudienceSelection, visibleVideoWhere } from "@/lib/content-access"
import { getCurrentUser, requireUser } from "@/lib/current-user"
import { getVideoCaptionUrl, getVideoPlaybackUrl, getVideoThumbnailUrl } from "@/lib/media"
import { retryVideoProcessing } from "@/lib/media-queue"
import { recordAuditEvent } from "@/lib/audit"
import { boundedLongText, boundedText, normalizeEsiEmail, parseAudience, stringInput, validationLimits, type FieldErrors } from "@/lib/validation"
import { moduleOptionSelect, paginationLimits, videoCardSelect } from "@/lib/listing-queries"
import { VideoCard } from "@/components/ContentCards"
import { VideoPlayer } from "@/components/VideoPlayer"

export const dynamic = "force-dynamic"

type VideoPageProps = {
  params: Promise<{
    id: string
  }>
  searchParams?: Promise<{
    captionError?: string
  }>
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

async function retryProcessing(formData: FormData) {
  "use server"

  const user = await requireUser()
  const videoId = String(formData.get("videoId") || "")
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { uploaderId: true },
  })

  if (!video || !canManageUserContent(video.uploaderId, user)) {
    throw new Error("Unauthorized")
  }

  await retryVideoProcessing(videoId, { includeReady: true })
  revalidatePath(`/video/${videoId}`)
  redirect(`/video/${videoId}`)
}

async function attachCaption(formData: FormData) {
  "use server"

  const user = await requireUser()
  const videoId = String(formData.get("videoId") || "")
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { uploaderId: true },
  })

  if (!video || !canManageUserContent(video.uploaderId, user)) {
    throw new Error("Unauthorized")
  }

  try {
    await attachCaptionAsset({
      videoId,
      file: formData.get("caption"),
      language: String(formData.get("language") || ""),
      label: String(formData.get("label") || ""),
      isDefault: formData.get("isDefault") === "on",
    })
  } catch (error) {
    const message = error instanceof CaptionValidationError ? error.message : "Could not attach caption file."
    redirect(`/video/${videoId}?captionError=${encodeURIComponent(message)}`)
  }

  revalidatePath(`/video/${videoId}`)
  redirect(`/video/${videoId}`)
}

async function updateVideoDetails(formData: FormData) {
  "use server"

  const user = await requireUser()
  const videoId = String(formData.get("videoId") || "")
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { uploaderId: true },
  })

  if (!video || !canManageUserContent(video.uploaderId, user)) {
    throw new Error("Unauthorized")
  }

  const errors: FieldErrors = {}
  const title = boundedText("title", formData.get("title"), validationLimits.titleMax, errors, true)
  const description = boundedLongText("description", formData.get("description"), validationLimits.descriptionMax, errors)
  const audience = parseAudience(formData.get("audience"), errors)
  const moduleId = stringInput(formData.get("moduleId")) || null

  if (!audience || Object.keys(errors).length > 0) {
    throw new Error(Object.values(errors)[0] || "Invalid video details")
  }

  const selectedModule = moduleId
    ? await prisma.module.findUnique({ where: { id: moduleId }, select: { id: true } })
    : null
  if (moduleId && !selectedModule) {
    throw new Error("Selected module was not found")
  }

  const audienceError = validateAudienceSelection({ audience, moduleId: selectedModule?.id ?? null })
  if (audienceError) {
    throw new Error(audienceError)
  }

  if (!canPublishToAudience(user, { audience, moduleId: selectedModule?.id ?? null })) {
    throw new Error("You cannot use that audience")
  }

  await prisma.video.update({
    where: { id: videoId },
    data: {
      title,
      description,
      audience,
      isPublic: audience === AudienceType.PUBLIC,
      moduleId: selectedModule?.id ?? null,
    },
  })
  await recordAuditEvent({
    type: AuditEventType.CONTENT_UPDATE,
    actorId: user.id,
    subjectId: video.uploaderId,
    metadata: { contentType: "video", contentId: videoId, audience, moduleId: selectedModule?.id ?? null },
  })

  revalidatePath(`/video/${videoId}`)
  revalidatePath("/explore")
  redirect(`/video/${videoId}`)
}

async function transferVideoOwner(formData: FormData) {
  "use server"

  const user = await requireUser()
  const videoId = String(formData.get("videoId") || "")
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { uploaderId: true },
  })

  if (!video || !canManageUserContent(video.uploaderId, user)) {
    throw new Error("Unauthorized")
  }

  const errors: FieldErrors = {}
  const email = normalizeEsiEmail(formData.get("email"), errors)
  if (Object.keys(errors).length > 0) {
    throw new Error(errors.email)
  }

  const newOwner = await prisma.user.findFirst({
    where: {
      email,
      provisioningStatus: ProvisioningStatus.APPROVED,
      role: { in: [Role.TEACHER, Role.ADMIN] },
      isActive: true,
      disabledAt: null,
    },
    select: { id: true },
  })

  if (!newOwner) {
    throw new Error("Choose an active approved teacher or admin.")
  }

  await prisma.video.update({
    where: { id: videoId },
    data: { uploaderId: newOwner.id },
  })
  await recordAuditEvent({
    type: AuditEventType.OWNERSHIP_TRANSFER,
    actorId: user.id,
    subjectId: newOwner.id,
    metadata: { contentType: "video", contentId: videoId, fromUserId: video.uploaderId, toUserId: newOwner.id },
  })

  revalidatePath(`/video/${videoId}`)
  redirect(`/video/${videoId}`)
}

async function archiveVideo(formData: FormData) {
  "use server"

  const user = await requireUser()
  const videoId = String(formData.get("videoId") || "")
  if (formData.get("confirm") !== "on") {
    throw new Error("Confirm archive before submitting.")
  }

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { uploaderId: true },
  })

  if (!video || !canManageUserContent(video.uploaderId, user)) {
    throw new Error("Unauthorized")
  }

  await prisma.video.update({
    where: { id: videoId },
    data: {
      status: VideoStatus.DELETING,
      isPublic: false,
      audience: AudienceType.ESI,
    },
  })
  await recordAuditEvent({
    type: AuditEventType.CONTENT_ARCHIVE,
    actorId: user.id,
    subjectId: video.uploaderId,
    metadata: { contentType: "video", contentId: videoId },
  })

  revalidatePath("/explore")
  revalidatePath("/dashboard")
  redirect("/dashboard")
}

export default async function VideoPage({ params, searchParams }: VideoPageProps) {
  const { id } = await params
  const { captionError } = (await searchParams) ?? {}
  const user = await getCurrentUser()
  const video = await prisma.video.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      isPublic: true,
      audience: true,
      status: true,
      url: true,
      thumbnailUrl: true,
      sourceKey: true,
      thumbnailStatus: true,
      processingErrorMessage: true,
      createdAt: true,
      uploaderId: true,
      moduleId: true,
      cohortId: true,
      uploader: {
        select: {
          name: true,
        },
      },
      module: {
        select: moduleOptionSelect,
      },
      cohort: {
        select: {
          id: true,
          name: true,
          yearGroup: true,
        },
      },
      audienceUsers: {
        select: { userId: true },
      },
      mediaAssets: {
        where: {
          type: MediaAssetType.CAPTION,
          status: MediaAssetStatus.READY,
        },
        orderBy: [{ isDefault: "desc" }, { label: "asc" }],
        select: {
          id: true,
          label: true,
          language: true,
          isDefault: true,
        },
      },
      variants: {
        orderBy: { height: "asc" },
        select: { id: true },
      },
    },
  })

  if (!video) {
    notFound()
  }

  if (!canViewScopedContent(video, user)) {
    redirect(user ? "/explore" : `/login?callbackUrl=/video/${id}`)
  }

  const canManageVideo = canManageUserContent(video.uploaderId, user)
  if (video.status !== VideoStatus.READY && !canManageVideo) {
    redirect(user ? "/explore" : `/login?callbackUrl=/video/${id}`)
  }

  const isReady = video.status === VideoStatus.READY
  const thumbnailNeedsRetry =
    video.thumbnailStatus === ThumbnailStatus.FAILED || video.thumbnailStatus === ThumbnailStatus.SKIPPED
  const canRetryProcessing = Boolean(
    canManageVideo &&
      video.sourceKey &&
      (video.status === VideoStatus.FAILED || (isReady && thumbnailNeedsRetry)),
  )
  const mediaUrl = isReady ? getVideoPlaybackUrl(video.id, video.url) : null
  const posterUrl = isReady ? getVideoThumbnailUrl(video.id, video.thumbnailUrl) : null
  const captionTracks = video.mediaAssets.map((asset) => ({
    src: getVideoCaptionUrl(video.id, asset.id),
    label: asset.label || asset.language || "Captions",
    language: asset.language || "und",
    isDefault: asset.isDefault,
  }))
  const relatedWhere = video.moduleId
    ? { AND: [visibleVideoWhere(user), { id: { not: video.id } }, { moduleId: video.moduleId }] }
    : { AND: [visibleVideoWhere(user), { id: { not: video.id } }] }

  const relatedVideos = await prisma.video.findMany({
    where: relatedWhere,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 3,
    select: videoCardSelect,
  })
  const moduleLimit = paginationLimits.modules.maxSize
  const managementData = canManageVideo
    ? await Promise.all([
        prisma.module.findMany({
          where: user?.role === Role.ADMIN ? {} : { id: { in: user?.teacherAssignments.map((assignment) => assignment.moduleId) ?? [] } },
          orderBy: [{ yearGroup: "asc" }, { name: "asc" }],
          take: moduleLimit + 1,
          select: moduleOptionSelect,
        }),
      ])
    : null
  const [manageableModuleRows = []] = managementData ?? []
  const baseManageableModules = manageableModuleRows.slice(0, moduleLimit)
  const manageableModules = video.module && !baseManageableModules.some((module) => module.id === video.module?.id)
    ? [video.module, ...baseManageableModules]
    : baseManageableModules
  const manageableModulesOverflow = manageableModuleRows.length > moduleLimit

  return (
    <main className="page">
      <section className="container watch-layout">
        <div>
          <VideoPlayer sourceUrl={mediaUrl} posterUrl={posterUrl} captions={captionTracks} />

          <div className="panel section">
            <div className="panel-header">
              <div>
                <div className="meta-row">
                  <span className="badge badge-accent">{video.type}</span>
                  {!isReady && <span className="badge">{video.status}</span>}
                  {video.isPublic && <span className="badge badge-success">Public</span>}
                  {!video.isPublic && <span className="badge">{video.audience}</span>}
                  {video.module && <span className="badge">{video.module.yearGroup}</span>}
                  {video.cohort && <span className="badge">{video.cohort.name}</span>}
                  {video.variants.length > 0 && <span className="badge">{video.variants.length} variants</span>}
                  {isReady && thumbnailNeedsRetry && <span className="badge badge-danger">Thumbnail {video.thumbnailStatus}</span>}
                </div>
                <h1 className="section-title">{video.title}</h1>
                <p className="muted">
                  {video.uploader.name || "ESI"} · {formatDate(video.createdAt)}
                </p>
              </div>
              <Link href="/explore" className="button-secondary">Back to Explore</Link>
            </div>
            {video.description && <p>{video.description}</p>}
            {!isReady && (
              <div className="alert">
                {video.status === VideoStatus.FAILED
                  ? "Processing failed. The upload is saved, but it is not available for playback."
                  : "Processing is queued. Playback will appear here when the worker finishes."}
              </div>
            )}
            {video.status === VideoStatus.FAILED && video.processingErrorMessage && (
              <p className="field-hint">{video.processingErrorMessage}</p>
            )}
            {isReady && thumbnailNeedsRetry && (
              <div className="alert">
                Thumbnail generation did not complete. Playback and captions remain available.
              </div>
            )}
            {canRetryProcessing && (
              <form action={retryProcessing}>
                <input type="hidden" name="videoId" value={video.id} />
                <button type="submit" className="button-secondary">
                  {video.status === VideoStatus.FAILED ? "Retry processing" : "Retry thumbnail"}
                </button>
              </form>
            )}
            {isReady && !posterUrl && <p className="field-hint">The video record is available while processing finishes.</p>}
          </div>

          {canManageVideo && (
            <section className="panel section">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Management</p>
                  <h2 className="section-title">Video Controls</h2>
                </div>
              </div>

              <form action={updateVideoDetails} className="form-stack">
                <input type="hidden" name="videoId" value={video.id} />
                <div className="field">
                  <label htmlFor="video-title">Title</label>
                  <input id="video-title" name="title" className="form-input" defaultValue={video.title} required />
                </div>
                <div className="field">
                  <label htmlFor="video-description">Description</label>
                  <textarea
                    id="video-description"
                    name="description"
                    className="form-textarea"
                    defaultValue={video.description || ""}
                  />
                </div>
                <div className="caption-form-grid">
                  <div className="field">
                    <label htmlFor="video-audience">Audience</label>
                    <select id="video-audience" name="audience" className="form-select" defaultValue={video.audience}>
                      <option value="ESI">Signed-in ESI users</option>
                      <option value="MODULE">Selected module</option>
                      <option value="PUBLIC">Public visitors</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="video-module">Module</label>
                    <select id="video-module" name="moduleId" className="form-select" defaultValue={video.moduleId || ""}>
                      <option value="">General</option>
                      {manageableModules.map((module) => (
                        <option key={module.id} value={module.id}>
                          {module.yearGroup} · {module.name}
                        </option>
                      ))}
                    </select>
                    {manageableModulesOverflow && (
                      <p className="field-hint">Showing the first {baseManageableModules.length} modules.</p>
                    )}
                  </div>
                </div>
                <button type="submit" className="button-secondary">Save details</button>
              </form>

              <div className="management-actions">
                <form action={transferVideoOwner} className="form-stack">
                  <input type="hidden" name="videoId" value={video.id} />
                  <div className="field">
                    <label htmlFor="transfer-owner">Transfer owner</label>
                    <input id="transfer-owner" name="email" className="form-input" type="email" placeholder="teacher@esi.dz" />
                  </div>
                  <button type="submit" className="button-quiet">Transfer</button>
                </form>

                <form action={archiveVideo} className="form-stack">
                  <input type="hidden" name="videoId" value={video.id} />
                  <label className="checkbox-row">
                    <input type="checkbox" name="confirm" required />
                    <span>Confirm archive</span>
                  </label>
                  <button type="submit" className="button-danger">Archive video</button>
                </form>
              </div>
            </section>
          )}

          {isReady && (
            <section className="panel section">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Accessibility</p>
                  <h2 className="section-title">Caption Tracks</h2>
                </div>
              </div>

              {captionError && <div className="alert">{captionError}</div>}

              {video.mediaAssets.length === 0 ? (
                <p className="field-hint">No captions attached.</p>
              ) : (
                <div className="list">
                  {video.mediaAssets.map((caption) => (
                    <div key={caption.id} className="list-item">
                      <div>
                        <strong>{caption.label || "Captions"}</strong>
                        <p className="field-hint">{caption.language || "und"}</p>
                      </div>
                      {caption.isDefault && <span className="badge badge-success">Default</span>}
                    </div>
                  ))}
                </div>
              )}

              {canManageVideo && (
                <form action={attachCaption} encType="multipart/form-data" className="form-stack caption-form">
                  <input type="hidden" name="videoId" value={video.id} />
                  <div className="field">
                    <label htmlFor="caption">WebVTT file</label>
                    <input id="caption" name="caption" className="form-input" type="file" accept=".vtt,text/vtt" required />
                  </div>
                  <div className="caption-form-grid">
                    <div className="field">
                      <label htmlFor="caption-language">Language</label>
                      <input id="caption-language" name="language" className="form-input" placeholder="en" required />
                    </div>
                    <div className="field">
                      <label htmlFor="caption-label">Label</label>
                      <input id="caption-label" name="label" className="form-input" placeholder="English" />
                    </div>
                  </div>
                  <label className="checkbox-row">
                    <input type="checkbox" name="isDefault" />
                    <span>Default track</span>
                  </label>
                  <button type="submit" className="button">Attach Caption</button>
                </form>
              )}
            </section>
          )}
        </div>

        <aside className="panel">
          <div className="panel-header">
            <div>
              <h2 className="section-title">Related</h2>
              <p className="muted">More videos available to you.</p>
            </div>
          </div>

          {relatedVideos.length === 0 ? (
            <div className="empty-state">
              <h3 className="card-title">No related videos</h3>
            </div>
          ) : (
            <div className="list">
              {relatedVideos.map((relatedVideo) => (
                <VideoCard key={relatedVideo.id} video={relatedVideo} />
              ))}
            </div>
          )}
        </aside>
      </section>
    </main>
  )
}
