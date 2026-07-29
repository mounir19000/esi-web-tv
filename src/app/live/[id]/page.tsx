"use client";

import { useEffect, useState } from "react";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { useParams } from "next/navigation";

export default function LiveRoomPage() {
  const { id: roomName } = useParams();
  const [token, setToken] = useState("");

  useEffect(() => {
    if (!roomName) return;

    (async () => {
      try {
        const resp = await fetch(`/api/livekit/token?room=${roomName}`);
        const data = await resp.json();
        setToken(data.token);
      } catch (e) {
        console.error("Failed to fetch token", e);
      }
    })();
  }, [roomName]);

  if (token === "") {
    return <div className="flex justify-center p-12">Getting token...</div>;
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="glass p-4 sticky top-0 z-50">
        <div className="container">
          <h1 className="h3 text-primary">Live Room: {roomName}</h1>
        </div>
      </header>
      
      <main className="flex-1 bg-bg-primary" data-lk-theme="default">
        <LiveKitRoom
          video={true}
          audio={true}
          token={token}
          serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL || "ws://localhost:7880"}
          data-lk-theme="default"
          style={{ height: '100dvh' }}
        >
          <VideoConference />
          <RoomAudioRenderer />
        </LiveKitRoom>
      </main>
    </div>
  );
}
