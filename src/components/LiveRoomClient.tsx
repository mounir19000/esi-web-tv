"use client"

import { useEffect, useState } from "react"
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
} from "@livekit/components-react"
import "@livekit/components-styles"

type TokenState =
  | { status: "loading"; token: "" }
  | { status: "ready"; token: string }
  | { status: "error"; token: ""; message: string }

export default function LiveRoomClient({
  roomName,
  canPublish,
}: {
  roomName: string
  canPublish: boolean
}) {
  const [state, setState] = useState<TokenState>({ status: "loading", token: "" })

  useEffect(() => {
    const controller = new AbortController()

    async function loadToken() {
      try {
        const response = await fetch(`/api/livekit/token?room=${encodeURIComponent(roomName)}`, {
          signal: controller.signal,
        })
        const data = await response.json()

        if (!response.ok || !data.token) {
          setState({
            status: "error",
            token: "",
            message: data.error || "Unable to join this live room.",
          })
          return
        }

        setState({ status: "ready", token: data.token })
      } catch {
        if (!controller.signal.aborted) {
          setState({
            status: "error",
            token: "",
            message: "Unable to connect to the live room.",
          })
        }
      }
    }

    loadToken()

    return () => controller.abort()
  }, [roomName])

  if (state.status === "loading") {
    return (
      <div className="live-status">
        <div>
          <h2 className="section-title">Joining room</h2>
          <p className="muted">Preparing your live session.</p>
        </div>
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <div className="live-status">
        <div>
          <h2 className="section-title">Could not join</h2>
          <p className="muted">{state.message}</p>
        </div>
      </div>
    )
  }

  return (
    <LiveKitRoom
      video={canPublish}
      audio={canPublish}
      token={state.token}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL || "ws://localhost:7880"}
      data-lk-theme="default"
      style={{ height: "68vh", minHeight: 360 }}
    >
      <VideoConference />
      <RoomAudioRenderer />
    </LiveKitRoom>
  )
}
