import { NextResponse } from "next/server"
import { WebhookReceiver } from "livekit-server-sdk"
import { appConfig } from "@/lib/env"
import { handleLiveKitWebhookEvent } from "@/lib/livekit-lifecycle"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = await request.text()
  const authorization = request.headers.get("authorization") ?? request.headers.get("authorize") ?? undefined
  const receiver = new WebhookReceiver(appConfig.livekit.apiKey, appConfig.livekit.apiSecret)

  let event
  try {
    event = await receiver.receive(body, authorization)
  } catch {
    return NextResponse.json({ error: "Invalid LiveKit webhook signature" }, { status: 401 })
  }

  await handleLiveKitWebhookEvent(event)
  return NextResponse.json({ ok: true })
}
