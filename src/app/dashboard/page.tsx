import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ProvisioningStatus, StreamStatus, type Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { visibleLiveStreamWhere, visibleVideoWhere } from "@/lib/content-access"
import { LiveStreamCard, VideoCard } from "@/components/ContentCards"
import { getCurrentUser } from "@/lib/current-user"
import { andWhere, liveStreamCardSelect, videoCardSelect } from "@/lib/listing-queries"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Dashboard | ESI Web TV",
}

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login?callbackUrl=/dashboard")
  }

  const { role, name, email, yearGroup } = user
  const isApproved = user.provisioningStatus === ProvisioningStatus.APPROVED
  const isAdmin = isApproved && role === "ADMIN"
  const isTeacher = isApproved && role === "TEACHER"
  const canCreate = isTeacher || isAdmin

  const ownVideoWhere: Prisma.VideoWhereInput = isAdmin
    ? {}
    : isTeacher
      ? { uploaderId: user.id }
      : visibleVideoWhere(user)
  const manageableStreamWhere: Prisma.LiveStreamWhereInput = {
    status: { in: [StreamStatus.STARTING, StreamStatus.LIVE, StreamStatus.ENDING] },
    ...(isAdmin ? {} : { hostId: user.id }),
  }
  const visibleStreamWhere = canCreate
    ? manageableStreamWhere
    : andWhere<Prisma.LiveStreamWhereInput>([{ isLive: true }, visibleLiveStreamWhere(user)])

  const [videoCount, liveCount, userCount, recentVideos, liveStreams] = await Promise.all([
    prisma.video.count({ where: ownVideoWhere }),
    prisma.liveStream.count({
      where: visibleStreamWhere,
    }),
    isAdmin ? prisma.user.count() : Promise.resolve(0),
    prisma.video.findMany({
      where: ownVideoWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 3,
      select: videoCardSelect,
    }),
    prisma.liveStream.findMany({
      where: visibleStreamWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 3,
      select: liveStreamCardSelect,
    }),
  ])

  return (
    <main id="main-content" className="page" tabIndex={-1}>
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
