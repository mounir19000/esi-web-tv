import { readFile } from "node:fs/promises"
import { join } from "node:path"
import "dotenv/config"
import { AccessToken } from "livekit-server-sdk"
import { chromium } from "@playwright/test"
import { getLiveKitCredentials } from "../src/lib/livekit-config"

declare global {
  interface Window {
    LivekitClient: typeof import("livekit-client")
  }
}

function getLiveKitUrl() {
  return process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL || "ws://localhost:7880"
}

function getLiveKitHttpOrigin(serverUrl: string) {
  const url = new URL(serverUrl)

  if (url.protocol === "ws:") {
    url.protocol = "http:"
  } else if (url.protocol === "wss:") {
    url.protocol = "https:"
  }

  url.pathname = "/"
  url.search = ""
  url.hash = ""

  return url.toString()
}

async function main() {
  const { apiKey, apiSecret } = getLiveKitCredentials()
  const serverUrl = getLiveKitUrl()
  const roomName = `smoke-${Date.now()}`
  const identity = `smoke-${process.pid}`
  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name: "LiveKit Smoke Test",
  })

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: false,
    canSubscribe: true,
  })

  const jwt = await token.toJwt()
  const clientBundlePath = join(process.cwd(), "node_modules/livekit-client/dist/livekit-client.umd.js")
  const clientBundle = await readFile(clientBundlePath, "utf8")
  const browser = await chromium.launch()

  try {
    const page = await browser.newPage()
    await page.goto(getLiveKitHttpOrigin(serverUrl))
    await page.addScriptTag({ content: clientBundle })

    const result = await page.evaluate(
      async ({ jwt, serverUrl }) => {
        const { Room, RoomEvent } = window.LivekitClient
        const room = new Room()

        await room.connect(serverUrl, jwt, { autoSubscribe: false })

        const connectedRoom = room.name
        const connectedState = room.state
        const disconnected = new Promise<string>((resolve) => {
          room.once(RoomEvent.Disconnected, () => resolve(room.state))
        })

        await room.disconnect()

        return {
          connectedRoom,
          connectedState,
          disconnectedState: await disconnected,
        }
      },
      { jwt, serverUrl },
    )

    if (
      result.connectedRoom !== roomName ||
      result.connectedState !== "connected" ||
      result.disconnectedState !== "disconnected"
    ) {
      throw new Error(`Unexpected LiveKit room state: ${JSON.stringify(result)}`)
    }

    console.log(`LiveKit smoke joined and left ${roomName} at ${serverUrl}`)
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
