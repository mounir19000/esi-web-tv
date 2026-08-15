import { NextRequest, NextResponse } from "next/server"
import { getPrometheusMetrics } from "@/lib/ops-health"

export const dynamic = "force-dynamic"

function isAuthorized(req: NextRequest) {
  const token = process.env.METRICS_BEARER_TOKEN?.trim()
  if (!token) {
    return true
  }

  return req.headers.get("authorization") === `Bearer ${token}`
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return new NextResponse(await getPrometheusMetrics(), {
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}
