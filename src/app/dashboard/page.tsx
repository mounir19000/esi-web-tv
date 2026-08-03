import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { visibleLiveStreamWhere, visibleVideoWhere } from "@/lib/content-access"
import { LiveStreamCard, VideoCard } from "@/components/ContentCards"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Dashboard | ESI Web TV",
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) {
    redirect("/login?callbackUrl=/dashboard")
  }

  const { role, name, email, yearGroup } = session.user
  const isAdmin = role === "ADMIN"
  const isTeacher = role === "TEACHER"
  const canCreate = isTeacher || isAdmin

  const ownVideoWhere = isAdmin
    ? {}
    : isTeacher
      ? { uploaderId: session.user.id }
      : visibleVideoWhere(session.user)

  const [videoCount, liveCount, userCount, recentVideos, liveStreams] = await Promise.all([
    prisma.video.count({ where: ownVideoWhere }),
    prisma.liveStream.count({
      where: canCreate
        ? isAdmin
          ? {}
          : { hostId: session.user.id }
        : { isLive: true, ...visibleLiveStreamWhere(session.user) },
    }),
    isAdmin ? prisma.user.count() : Promise.resolve(0),
    prisma.video.findMany({
      where: ownVideoWhere,
      orderBy: { createdAt: "desc" },
      take: 3,
      include: { uploader: true, module: true },
    }),
    prisma.liveStream.findMany({
      where: canCreate
        ? isAdmin
          ? { isLive: true }
          : { isLive: true, hostId: session.user.id }
        : { isLive: true, ...visibleLiveStreamWhere(session.user) },
      orderBy: { startedAt: "desc" },
      take: 3,
      include: { host: true, module: true },
    }),
  ])

  return (
    <main className="page">
      <section className="container">
        <div className="section-header">
          <div>
            <p className="eyebrow">{role.toLowerCase()} dashboard</p>
            <h1 className="page-title">Welcome, {name || email}</h1>
            <p className="lead">
              {yearGroup ? `Year group ${yearGroup}` : "ESI Web TV account"} · {email}
            </p>
          </div>
          {canCreate && (
            <div className="actions">
              {isAdmin && <Link href="/dashboard/users" className="button-secondary">Manage users</Link>}
              <Link href="/dashboard/upload" className="button-secondary">Upload video</Link>
              <Link href="/live/new" className="button">Go live</Link>
            </div>
          )}
        </div>

        <div className="stat-grid">
          <div className="stat">
            <strong>{videoCount}</strong>
            <span>{canCreate ? "managed videos" : "available videos"}</span>
          </div>
          <div className="stat">
            <strong>{liveCount}</strong>
            <span>{canCreate ? "active streams" : "live now"}</span>
          </div>
          <div className="stat">
            <strong>{yearGroup || "ESI"}</strong>
            <span>{yearGroup ? "year group" : "scope"}</span>
          </div>
          <div className="stat">
            <strong>{isAdmin ? userCount : role}</strong>
            <span>{isAdmin ? "users" : "role"}</span>
          </div>
        </div>
      </section>

      <section className="container section grid dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="section-title">{canCreate ? "Recent uploads" : "Available videos"}</h2>
              <p className="muted">{canCreate ? "Your latest publishing activity." : "Newest videos in your scope."}</p>
            </div>
            <Link href="/explore" className="button-secondary">Explore</Link>
          </div>

          {recentVideos.length === 0 ? (
            <div className="empty-state">
              <h3 className="card-title">No videos yet</h3>
              <p className="muted">{canCreate ? "Upload a recording to populate this list." : "No module videos are available yet."}</p>
            </div>
          ) : (
            <div className="grid video-grid">
              {recentVideos.map((video) => (
                <VideoCard key={video.id} video={video} />
              ))}
            </div>
          )}
        </div>

        <aside className="panel">
          <div className="panel-header">
            <div>
              <h2 className="section-title">Live rooms</h2>
              <p className="muted">{canCreate ? "Streams you can manage." : "Broadcasts open to you."}</p>
            </div>
          </div>

          {liveStreams.length === 0 ? (
            <div className="empty-state">
              <h3 className="card-title">Nothing live</h3>
              {canCreate && <Link href="/live/new" className="button">Start a stream</Link>}
            </div>
          ) : (
            <div className="list">
              {liveStreams.map((stream) => (
                <LiveStreamCard key={stream.id} stream={stream} />
              ))}
            </div>
          )}
        </aside>
      </section>
    </main>
  )
}
