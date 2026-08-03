import type { Metadata } from "next"
import Link from "next/link"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { visibleLiveStreamWhere } from "@/lib/content-access"
import { LiveStreamCard } from "@/components/ContentCards"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Live Channels | ESI Web TV",
}

export default async function LiveChannelsPage() {
  const session = await auth()
  const canCreate = session?.user?.role === "TEACHER" || session?.user?.role === "ADMIN"

  const activeStreams = await prisma.liveStream.findMany({
    where: { isLive: true, ...visibleLiveStreamWhere(session?.user) },
    orderBy: { startedAt: "desc" },
    include: { host: true, module: true },
  })

  return (
    <main className="page">
      <section className="container">
        <div className="section-header">
          <div>
            <p className="eyebrow">Live</p>
            <h1 className="page-title">Live Channels</h1>
            <p className="lead">Join active broadcasts available to your account or public viewers.</p>
          </div>
          <div className="actions">
            {canCreate ? (
              <Link href="/live/new" className="button">Go live</Link>
            ) : (
              !session?.user && <Link href="/login?callbackUrl=/live" className="button-secondary">Sign in</Link>
            )}
          </div>
        </div>
      </section>

      <section className="container section">
        {activeStreams.length === 0 ? (
          <div className="empty-state">
            <h2 className="card-title">No active broadcasts</h2>
            <p className="muted">The library remains available while no room is live.</p>
            <Link href="/explore" className="button-secondary">Explore videos</Link>
          </div>
        ) : (
          <div className="grid video-grid">
            {activeStreams.map((stream) => (
              <LiveStreamCard key={stream.id} stream={stream} />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
