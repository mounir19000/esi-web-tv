"use client"

import Hls from "hls.js"
import { useEffect, useRef } from "react"

type CaptionTrack = {
  src: string
  label: string
  language: string
  isDefault: boolean
}

export function VideoPlayer({
  sourceUrl,
  posterUrl,
  captions,
}: {
  sourceUrl: string | null
  posterUrl: string | null
  captions: CaptionTrack[]
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !sourceUrl) {
      return
    }

    if (sourceUrl.endsWith(".m3u8") || sourceUrl.includes("/hls/")) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
        })
        hls.loadSource(sourceUrl)
        hls.attachMedia(video)
        return () => hls.destroy()
      }

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = sourceUrl
        return () => {
          video.removeAttribute("src")
          video.load()
        }
      }
    }

    video.src = sourceUrl
    return () => {
      video.removeAttribute("src")
      video.load()
    }
  }, [sourceUrl])

  return (
    <video ref={videoRef} className="video-player" controls preload="metadata" poster={posterUrl || undefined}>
      {captions.map((caption) => (
        <track
          key={`${caption.language}-${caption.label}`}
          kind="captions"
          src={caption.src}
          srcLang={caption.language}
          label={caption.label}
          default={caption.isDefault}
        />
      ))}
    </video>
  )
}
