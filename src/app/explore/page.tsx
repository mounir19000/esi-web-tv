import type { Metadata } from "next"
import Link from "next/link"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { visibleVideoWhere } from "@/lib/content-access"
import { VideoCard } from "@/components/ContentCards"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Explore | ESI Web TV",
}

const videoTypes = ["TEACHING", "CLUB", "EXPLANATION", "OTHER"] as const

type ExplorePageProps = {
  searchParams?: Promise<{
    type?: string
  }>
}

export default async function ExplorePage({ searchParams }: ExplorePageProps) {
  const session = await auth()
  const params = await searchParams
  const selectedType = videoTypes.find((type) => type === params?.type)
  const visibilityWhere = visibleVideoWhere(session?.user)

  const videos = await prisma.video.findMany({
    where: selectedType ? { AND: [visibilityWhere, { type: selectedType }] } : visibilityWhere,
    orderBy: { createdAt: "desc" },
    include: { uploader: true, module: true },
  })

  return (
    <main className="page">
      <section className="container">
        <div className="section-header">
          <div>
            <p className="eyebrow">Library</p>
            <h1 className="page-title">Explore Videos</h1>
            <p className="lead">Browse public videos and the module recordings available to your account.</p>
          </div>
        </div>

        <div className="actions" aria-label="Video type filters">
          <Link href="/explore" className={selectedType ? "button-secondary" : "button"}>
            All
          </Link>
          {videoTypes.map((type) => (
            <Link
              key={type}
              href={`/explore?type=${type}`}
              className={selectedType === type ? "button" : "button-secondary"}
            >
              {type}
            </Link>
          ))}
        </div>
      </section>

      <section className="container section">
        {videos.length === 0 ? (
          <div className="empty-state">
            <h2 className="card-title">No videos found</h2>
            <p className="muted">Try another category or check back after new uploads are published.</p>
          </div>
        ) : (
          <div className="grid video-grid">
            {videos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
