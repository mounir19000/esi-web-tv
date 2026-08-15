import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import prisma from "@/lib/prisma"
import { canManageUserContent, canViewScopedContent } from "@/lib/content-access"
import { getCurrentUser, requireUser } from "@/lib/current-user"
import LiveRoomClient from "@/components/LiveRoomClient"

export const dynamic = "force-dynamic"

type LiveRoomPageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function LiveRoomPage({ params }: LiveRoomPageProps) {
  const { id } = await params
  const user = await getCurrentUser()
  const stream = await prisma.liveStream.findUnique({
    where: { streamKey: id },
    include: { host: true, module: true },
  })

  if (!stream) {
    notFound()
  }

  if (!canViewScopedContent(stream, user)) {
    redirect(user ? "/live" : `/login?callbackUrl=/live/${id}`)
  }

  const canManage = canManageUserContent(stream.hostId, user)
  const canPublish = canManage && stream.isLive

  async function endLiveStream(formData: FormData) {
    "use server"

    const streamKey = String(formData.get("streamKey") || "")
    const user = await requireUser()
    const stream = await prisma.liveStream.findUnique({
      where: { streamKey },
      select: { id: true, hostId: true },
    })

    if (!stream || !canManageUserContent(stream.hostId, user)) {
      throw new Error("Unauthorized")
    }

    await prisma.liveStream.update({
      where: { id: stream.id },
      data: { isLive: false, endedAt: new Date() },
    })

    revalidatePath("/")
    revalidatePath("/live")
    revalidatePath("/dashboard")
    redirect("/live")
  }

  return (
    <div className="live-shell">
      <header className="live-room-header">
        <div className="container">
          <div>
            <p className="eyebrow">Live room</p>
            <h1 className="section-title">{stream.title}</h1>
            <div className="meta-row">
              <span>{stream.host.name || "ESI"}</span>
              {stream.module && <span>{stream.module.yearGroup} · {stream.module.name}</span>}
              {stream.isPublic && <span className="badge badge-success">Public</span>}
              {stream.isLive ? <span className="badge badge-live">Live</span> : <span className="badge">Ended</span>}
            </div>
          </div>

          <div className="actions">
            <Link href="/live" className="button-secondary">Back to live</Link>
            {canManage && stream.isLive && (
              <form action={endLiveStream}>
                <input type="hidden" name="streamKey" value={stream.streamKey} />
                <button type="submit" className="button-danger">End stream</button>
              </form>
            )}
          </div>
        </div>
      </header>

      <main className="live-content">
        <div className="live-stage" data-lk-theme="default">
          {stream.isLive ? (
            <LiveRoomClient roomName={stream.streamKey} canPublish={canPublish} />
          ) : (
            <div className="live-status">
              <div>
                <h2 className="section-title">This stream has ended</h2>
                <p className="muted">Recordings will appear in Explore when they are published.</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
