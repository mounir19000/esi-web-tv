import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { canViewScopedContent, visibleVideoWhere } from "@/lib/content-access"
import { getMediaUrl } from "@/lib/media"
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

export default async function VideoPage({ params }: VideoPageProps) {
  const { id } = await params
  const session = await auth()
  const video = await prisma.video.findUnique({
    where: { id },
    include: { uploader: true, module: true },
  })

  if (!video) {
    notFound()
  }

  if (!canViewScopedContent(video, session?.user)) {
    redirect(session?.user ? "/explore" : `/login?callbackUrl=/video/${id}`)
  }

  const mediaUrl = getMediaUrl(video.url)
  const posterUrl = getMediaUrl(video.thumbnailUrl)
  const relatedWhere = video.moduleId
    ? { AND: [visibleVideoWhere(session?.user), { id: { not: video.id } }, { moduleId: video.moduleId }] }
    : { AND: [visibleVideoWhere(session?.user), { id: { not: video.id } }] }

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
            {!posterUrl && <p className="field-hint">The video record is available while processing finishes.</p>}
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
