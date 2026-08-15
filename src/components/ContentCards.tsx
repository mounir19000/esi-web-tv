/* eslint-disable @next/next/no-img-element */

import Link from "next/link"
import { getVideoThumbnailUrl } from "@/lib/media"

type VideoCardData = {
  id: string
  title: string
  description: string | null
  type: string
  isPublic: boolean
  audience?: string
  thumbnailUrl: string | null
  createdAt: Date
  uploader: {
    name: string | null
  }
  module: {
    name: string
    yearGroup: string
  } | null
}

type LiveCardData = {
  streamKey: string
  title: string
  description: string | null
  isPublic: boolean
  audience?: string
  status?: string
  startedAt: Date | null
  host: {
    name: string | null
  }
  module: {
    name: string
    yearGroup: string
  } | null
}

function initials(name?: string | null) {
  return name?.trim().charAt(0).toUpperCase() || "E"
}

function formatDate(date: Date | null) {
  if (!date) {
    return "Not started"
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

function audienceLabel(isPublic: boolean, audience?: string) {
  if (isPublic || audience === "PUBLIC") {
    return "Public"
  }

  if (audience === "MODULE") {
    return "Module"
  }

  if (audience === "COHORT") {
    return "Cohort"
  }

  if (audience === "SELECTED_USERS") {
    return "Selected"
  }

  return "ESI"
}

export function VideoCard({ video }: { video: VideoCardData }) {
  const thumbnailUrl = getVideoThumbnailUrl(video.id, video.thumbnailUrl)

  return (
    <Link href={`/video/${video.id}`} className="video-card">
      <div className="media-frame">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" loading="lazy" />
        ) : (
          <span className="media-placeholder">TV</span>
        )}
        <span className="badge badge-accent badge-corner">
          {video.type}
        </span>
      </div>
      <div className="card-body">
        <h3 className="card-title">{video.title}</h3>
        <div className="meta-row">
          <span className="avatar">{initials(video.uploader.name)}</span>
          <span>{video.uploader.name || "ESI"}</span>
          <span>{formatDate(video.createdAt)}</span>
        </div>
        <div className="meta-row">
          {video.module && <span className="badge">{video.module.yearGroup}</span>}
          <span className={video.isPublic ? "badge badge-success" : "badge"}>
            {audienceLabel(video.isPublic, video.audience)}
          </span>
        </div>
      </div>
    </Link>
  )
}

export function LiveStreamCard({ stream }: { stream: LiveCardData }) {
  const statusLabel = stream.status
    ? stream.status.charAt(0) + stream.status.slice(1).toLowerCase()
    : "Live"
  const isLive = stream.status ? stream.status === "LIVE" : true

  return (
    <Link href={`/live/${stream.streamKey}`} className="video-card">
      <div className="media-frame">
        <span className="media-placeholder">{isLive ? "LIVE" : statusLabel.toUpperCase()}</span>
        <span className={isLive ? "badge badge-live badge-corner" : "badge badge-corner"}>
          {statusLabel}
        </span>
      </div>
      <div className="card-body">
        <h3 className="card-title">{stream.title}</h3>
        <div className="meta-row">
          <span className="avatar">{initials(stream.host.name)}</span>
          <span>{stream.host.name || "ESI"}</span>
          {stream.startedAt && <span>{formatDate(stream.startedAt)}</span>}
        </div>
        <div className="meta-row">
          {stream.module && <span className="badge">{stream.module.yearGroup}</span>}
          <span className={stream.isPublic ? "badge badge-success" : "badge"}>
            {audienceLabel(stream.isPublic, stream.audience)}
          </span>
        </div>
      </div>
    </Link>
  )
}
