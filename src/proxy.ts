import { NextRequest, NextResponse } from "next/server"

export function proxy(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID()
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-request-id", requestId)

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
  response.headers.set("x-request-id", requestId)

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
