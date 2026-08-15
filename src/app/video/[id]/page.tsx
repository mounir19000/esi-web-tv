import Link from "next/link"
import { revalidatePath } from "next/cache"
import { notFound, redirect } from "next/navigation"
import { VideoStatus } from "@prisma/client"
import prisma from "@/lib/prisma"
import { canManageUserContent, canViewScopedContent, visibleVideoWhere } from "@/lib/content-access"
import { getCurrentUser, requireUser } from "@/lib/current-user"
import { getVideoPlaybackUrl, getVideoThumbnailUrl } from "@/lib/media"
import { retryVideoProcessing } from "@/lib/media-queue"
import { VideoCard } from "@/components/ContentCards"

export const dynamic = "force-dynamic"

type VideoPageProps = {
  params: Promise<{
    id: string
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

  await retryVideoProcessing(videoId)
  revalidatePath(`/video/${videoId}`)
  redirect(`/video/${videoId}`)
}

export default async function VideoPage({ params }: VideoPageProps) {
  const { id } = await params
  const user = await getCurrentUser()
  const video = await prisma.video.findUnique({
    where: { id },
    include: { uploader: true, module: true },
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
  const mediaUrl = isReady ? getVideoPlaybackUrl(video.id, video.url) : null
  const posterUrl = isReady ? getVideoThumbnailUrl(video.id, video.thumbnailUrl) : null
  const relatedWhere = video.moduleId
    ? { AND: [visibleVideoWhere(user), { id: { not: video.id } }, { moduleId: video.moduleId }] }
    : { AND: [visibleVideoWhere(user), { id: { not: video.id } }] }

  const relatedVideos = await prisma.video.findMany({
    where: relatedWhere,
    orderBy: { createdAt: "desc" },
    take: 3,
    include: { uploader: true, module: true },
  })

  return (
    <main className="page">
      <section className="container watch-layout">
        <div>
          <video className="video-player" controls preload="metadata" src={mediaUrl || undefined} poster={posterUrl || undefined}>
            <track kind="captions" />
          </video>

          <div className="panel section">
            <div className="panel-header">
              <div>
                <div className="meta-row">
                  <span className="badge badge-accent">{video.type}</span>
                  {!isReady && <span className="badge">{video.status}</span>}
                  {video.isPublic && <span className="badge badge-success">Public</span>}
                  {video.module && <span className="badge">{video.module.yearGroup}</span>}
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
            {video.status === VideoStatus.FAILED && canManageVideo && video.sourceKey && (
              <form action={retryProcessing}>
                <input type="hidden" name="videoId" value={video.id} />
                <button type="submit" className="button-secondary">Retry processing</button>
              </form>
            )}
            {isReady && !posterUrl && <p className="field-hint">The video record is available while processing finishes.</p>}
          </div>
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
