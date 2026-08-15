import { NextResponse } from "next/server"
import { getReadinessReport } from "@/lib/ops-health"

export const dynamic = "force-dynamic"

export async function GET() {
  const report = await getReadinessReport()

  return NextResponse.json(report, {
    status: report.ok ? 200 : 503,
  })
}
