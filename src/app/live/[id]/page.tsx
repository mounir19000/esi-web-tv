import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { RecordingStatus, StreamStatus } from "@prisma/client"
import prisma from "@/lib/prisma"
import { canManageUserContent, canViewScopedContent } from "@/lib/content-access"
import { getCurrentUser, requireUser } from "@/lib/current-user"
import { appConfig } from "@/lib/env"
import {
  discardRecording,
  endLiveStream as endLiveStreamRoom,
  publishRecording,
  retryRecording,
} from "@/lib/livekit-lifecycle"
import { moduleOptionSelect } from "@/lib/listing-queries"
import LiveRoomClient from "@/components/LiveRoomClient"

export const dynamic = "force-dynamic"

type LiveRoomPageProps = {
  params: Promise<{
    id: string
  }>
}

const joinableStreamStatuses: StreamStatus[] = [StreamStatus.STARTING, StreamStatus.LIVE]
const endingStreamStatuses: StreamStatus[] = [StreamStatus.STARTING, StreamStatus.LIVE, StreamStatus.ENDING]
const discardableRecordingStatuses: RecordingStatus[] = [RecordingStatus.READY, RecordingStatus.FAILED]

function streamStatusLabel(status: StreamStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase()
}

function recordingStatusLabel(status: RecordingStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase()
}

export default async function LiveRoomPage({ params }: LiveRoomPageProps) {
  const { id } = await params
  const user = await getCurrentUser()
  const stream = await prisma.liveStream.findUnique({
    where: { streamKey: id },
    select: {
      id: true,
      title: true,
      isPublic: true,
      audience: true,
      isLive: true,
      status: true,
      streamKey: true,
      hostId: true,
      moduleId: true,
      cohortId: true,
      participantCount: true,
      providerRoomId: true,
      host: {
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
      liveStreamAudienceUsers: {
        select: { userId: true },
      },
      recordings: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          objectKey: true,
          sizeBytes: true,
          durationSeconds: true,
          errorMessage: true,
          publishedVideo: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  })

  if (!stream) {
    notFound()
  }

  if (!canViewScopedContent(stream, user)) {
    redirect(user ? "/live" : `/login?callbackUrl=/live/${id}`)
  }

  const canManage = canManageUserContent(stream.hostId, user)
  const canPublish = canManage && joinableStreamStatuses.includes(stream.status)
  const canJoinRoom = canPublish || (stream.status === StreamStatus.LIVE && stream.isLive)
  const canEndStream = canManage && endingStreamStatuses.includes(stream.status)

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

    await endLiveStreamRoom(stream.id)

    revalidatePath("/")
    revalidatePath("/live")
    revalidatePath("/dashboard")
    redirect("/live")
  }

  async function publishRecordingAction(formData: FormData) {
    "use server"

    const user = await requireUser()
    const recordingId = String(formData.get("recordingId") || "")
    const videoId = await publishRecording(recordingId, user)

    revalidatePath(`/live/${id}`)
    revalidatePath("/explore")
    revalidatePath("/dashboard")
    redirect(`/video/${videoId}`)
  }

  async function discardRecordingAction(formData: FormData) {
    "use server"

    const user = await requireUser()
    const recordingId = String(formData.get("recordingId") || "")
    await discardRecording(recordingId, user)

    revalidatePath(`/live/${id}`)
    redirect(`/live/${id}`)
  }

  async function retryRecordingAction(formData: FormData) {
    "use server"

    const user = await requireUser()
    const recordingId = String(formData.get("recordingId") || "")
    await retryRecording(recordingId, user)

    revalidatePath(`/live/${id}`)
    redirect(`/live/${id}`)
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
              <span className={stream.status === StreamStatus.LIVE ? "badge badge-live" : "badge"}>
                {streamStatusLabel(stream.status)}
              </span>
            </div>
          </div>

          <div className="actions">
            <Link href="/live" className="button-secondary">Back to live</Link>
            {canEndStream && (
              <form action={endLiveStream}>
                <input type="hidden" name="streamKey" value={stream.streamKey} />
                <button type="submit" className="button-danger">End stream</button>
              </form>
            )}
          </div>
        </div>
      </header>

      <main id="main-content" className="live-content" tabIndex={-1}>
        <div className="live-stage" data-lk-theme="default">
          {canJoinRoom ? (
            <LiveRoomClient
              roomName={stream.streamKey}
              canPublish={canPublish}
              serverUrl={appConfig.livekit.publicUrl}
            />
          ) : stream.status === StreamStatus.STARTING ? (
            <div className="live-status" role="status" aria-live="polite">
              <div>
                <h2 className="section-title">Waiting for host</h2>
                <p className="muted">This room will open when the broadcast connection is active.</p>
              </div>
            </div>
          ) : stream.status === StreamStatus.FAILED ? (
            <div className="live-status" role="alert">
              <div>
                <h2 className="section-title">Stream unavailable</h2>
                <p className="muted">The provider room could not be started.</p>
              </div>
            </div>
          ) : (
            <div className="live-status" role="status">
              <div>
                <h2 className="section-title">This stream has ended</h2>
                <p className="muted">Recordings will appear in Explore when they are published.</p>
              </div>
            </div>
          )}
        </div>

        {canManage && (
          <section className="recording-panel">
            <div className="panel-header">
              <div>
                <h2 className="section-title">Recordings</h2>
                <p className="muted">Manage captured files from this broadcast.</p>
              </div>
            </div>

            {stream.recordings.length === 0 ? (
              <div className="empty-state">
                <h3 className="card-title">No recordings yet</h3>
                <p className="muted">Recording status will appear here after the host connection is active.</p>
              </div>
            ) : (
              <div className="list">
                {stream.recordings.map((recording) => (
                  <div className="list-item recording-list-item" key={recording.id}>
                    <div>
                      <div className="meta-row">
                        <span className="badge">{recordingStatusLabel(recording.status)}</span>
                        {recording.sizeBytes && <span>{Number(recording.sizeBytes)} bytes</span>}
                        {recording.durationSeconds && <span>{recording.durationSeconds}s</span>}
                      </div>
                      {recording.errorMessage && <p className="field-hint">{recording.errorMessage}</p>}
                      {recording.publishedVideo && (
                        <Link href={`/video/${recording.publishedVideo.id}`} className="button-quiet">
                          Open video
                        </Link>
                      )}
                    </div>

                    <div className="actions">
                      {recording.objectKey && (
                        <Link href={`/api/recordings/${recording.id}/download`} className="button-secondary">
                          Download
                        </Link>
                      )}
                      {recording.status === RecordingStatus.READY && (
                        <form action={publishRecordingAction}>
                          <input type="hidden" name="recordingId" value={recording.id} />
                          <button type="submit" className="button">Publish</button>
                        </form>
                      )}
                      {recording.status === RecordingStatus.FAILED && (
                        <form action={retryRecordingAction}>
                          <input type="hidden" name="recordingId" value={recording.id} />
                          <button type="submit" className="button-secondary">Retry</button>
                        </form>
                      )}
                      {discardableRecordingStatuses.includes(recording.status) && (
                        <form action={discardRecordingAction}>
                          <input type="hidden" name="recordingId" value={recording.id} />
                          <button type="submit" className="button-danger">Discard</button>
                        </form>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
