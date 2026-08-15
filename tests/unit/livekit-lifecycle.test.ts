import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { EgressStatus } from "livekit-server-sdk"
import { Role, StreamStatus } from "@prisma/client"
import {
  buildParticipantIdentity,
  canJoinStreamRoom,
  getLiveKitApiUrl,
  mapEgressStatus,
  parseLiveKitParticipantMetadata,
} from "../../src/lib/livekit-lifecycle"

describe("LiveKit lifecycle helpers", () => {
  it("converts public websocket URLs to server API origins", () => {
    assert.equal(getLiveKitApiUrl("ws://localhost:7880/room?x=1"), "http://localhost:7880/")
    assert.equal(getLiveKitApiUrl("wss://livekit.example.edu/path"), "https://livekit.example.edu/")
  })

  it("uses per-session identities while preserving user IDs in metadata", () => {
    assert.equal(
      buildParticipantIdentity({ id: "user-1" } as never, "session-1"),
      "user-user-1-session-1",
    )
    assert.equal(buildParticipantIdentity(null, "session-1"), "guest-session-1")

    const metadata = parseLiveKitParticipantMetadata(JSON.stringify({
      participantSessionId: "session-1",
      userId: "user-1",
      role: Role.TEACHER,
      streamId: "stream-1",
      canPublish: true,
    }))

    assert.equal(metadata?.userId, "user-1")
    assert.equal(metadata?.canPublish, true)
  })

  it("lets hosts join starting rooms but holds viewers until provider-confirmed live state", () => {
    const stream = { hostId: "teacher-1", status: StreamStatus.STARTING, isLive: false }

    assert.equal(canJoinStreamRoom(stream, { id: "teacher-1", role: Role.TEACHER } as never), true)
    assert.equal(canJoinStreamRoom(stream, { id: "student-1", role: Role.STUDENT } as never), false)
    assert.equal(
      canJoinStreamRoom({ ...stream, status: StreamStatus.LIVE, isLive: true }, null),
      true,
    )
  })

  it("maps provider egress states to recording job states", () => {
    assert.equal(mapEgressStatus(EgressStatus.EGRESS_STARTING), "STARTING")
    assert.equal(mapEgressStatus(EgressStatus.EGRESS_ACTIVE), "ACTIVE")
    assert.equal(mapEgressStatus(EgressStatus.EGRESS_COMPLETE), "COMPLETED")
    assert.equal(mapEgressStatus(EgressStatus.EGRESS_ABORTED), "ABORTED")
    assert.equal(mapEgressStatus(EgressStatus.EGRESS_FAILED), "FAILED")
  })
})
