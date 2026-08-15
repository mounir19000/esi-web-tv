import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { visibleLiveStreamWhere, visibleVideoWhere } from "@/lib/content-access"
import { LiveStreamCard, VideoCard } from "@/components/ContentCards"
import { getCurrentUser } from "@/lib/current-user"
import { andWhere, liveStreamCardSelect, videoCardSelect } from "@/lib/listing-queries"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "ESI Web TV | Courses, Clubs, Live",
}

export default async function Home() {
  const viewer = await getCurrentUser()
  const visibleVideos = visibleVideoWhere(viewer)

  const [liveStreams, videos, videoCount, moduleCount] = await Promise.all([
    prisma.liveStream.findMany({
      where: andWhere<Prisma.LiveStreamWhereInput>([{ isLive: true }, visibleLiveStreamWhere(viewer)]),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 3,
      select: liveStreamCardSelect,
    }),
    prisma.video.findMany({
      where: visibleVideos,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 4,
      select: videoCardSelect,
    }),
    prisma.video.count({ where: visibleVideos }),
    prisma.module.count(),
  ])

  return (
    <>
      <main className="page">
        <section className="container hero">
          <div className="hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">École nationale Supérieure d&apos;Informatique</p>
              <h1 className="page-title">ESI Web TV</h1>
              <p className="lead">
                Live rooms, teaching videos, explanations, and club broadcasts for the ESI community.
              </p>
              <div className="actions">
                <Link href="/explore" className="button">Explore videos</Link>
                <Link href="/live" className="button-secondary">View live channels</Link>
                {!viewer && <Link href="/login" className="button-quiet">Sign in</Link>}
              </div>
            </div>

            <div className="hero-visual" aria-label="ESI Web TV overview">
              <Image src="/logo_esi.png" alt="ESI" width={858} height={357} className="hero-logo" priority />
              <div className="hero-kpis">
                <div className="kpi">
                  <strong>{liveStreams.length}</strong>
                  <span>live now</span>
                </div>
                <div className="kpi">
                  <strong>{videoCount}</strong>
                  <span>videos</span>
                </div>
                <div className="kpi">
                  <strong>{moduleCount}</strong>
                  <span>modules</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="container section">
          <div className="section-header">
            <div>
              <h2 className="section-title">Live Now</h2>
              <p className="muted">Active broadcasts available to your role.</p>
            </div>
            <Link href="/live" className="button-secondary">All live channels</Link>
          </div>

          {liveStreams.length === 0 ? (
            <div className="empty-state">
              <h3 className="card-title">No broadcasts are live</h3>
              <p className="muted">Recent videos are still available in Explore.</p>
            </div>
          ) : (
            <div className="grid video-grid">
              {liveStreams.map((stream) => (
                <LiveStreamCard key={stream.id} stream={stream} />
              ))}
            </div>
          )}
        </section>

        <section className="container section">
          <div className="section-header">
            <div>
              <h2 className="section-title">Latest Videos</h2>
              <p className="muted">Public videos and the module content available to you.</p>
            </div>
            <Link href="/explore" className="button-secondary">Browse library</Link>
          </div>

          {videos.length === 0 ? (
            <div className="empty-state">
              <h3 className="card-title">No videos yet</h3>
              <p className="muted">Teachers and admins can publish the first upload from the dashboard.</p>
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

      <footer className="footer">
        <div className="container small">
          © {new Date().getFullYear()} École nationale Supérieure d&apos;Informatique.
        </div>
      </footer>
    </>
  )
}
