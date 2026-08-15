import type { Metadata } from "next"
import Link from "next/link"
import { ProvisioningStatus, type Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { visibleLiveStreamWhere } from "@/lib/content-access"
import { LiveStreamCard } from "@/components/ContentCards"
import { getCurrentUser } from "@/lib/current-user"
import {
  andWhere,
  dateCursorWhere,
  listingHref,
  liveStreamCardSelect,
  liveStreamSearchWhere,
  paginateDateCursorItems,
  paginationLimits,
  parseListingParams,
} from "@/lib/listing-queries"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Live Channels | ESI Web TV",
}

type LiveChannelsPageProps = {
  searchParams?: Promise<{
    q?: string
    cursor?: string
    limit?: string
  }>
}

export default async function LiveChannelsPage({ searchParams }: LiveChannelsPageProps) {
  const user = await getCurrentUser()
  const params = (await searchParams) ?? {}
  const { query, cursor, pageSize } = parseListingParams(params, "streams")
  const canCreate =
    user?.provisioningStatus === ProvisioningStatus.APPROVED &&
    (user.role === "TEACHER" || user.role === "ADMIN")
  const baseParams = {
    q: query || undefined,
    limit: pageSize === paginationLimits.streams.defaultSize ? undefined : pageSize,
  }

  const streamRows = await prisma.liveStream.findMany({
    where: andWhere<Prisma.LiveStreamWhereInput>([
      { isLive: true },
      visibleLiveStreamWhere(user),
      liveStreamSearchWhere(query),
      dateCursorWhere<Prisma.LiveStreamWhereInput>(cursor),
    ]),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    select: liveStreamCardSelect,
  })
  const { items: activeStreams, nextCursor } = paginateDateCursorItems(streamRows, pageSize)

  return (
    <main className="page">
      <section className="container">
        <div className="section-header">
          <div>
            <p className="eyebrow">Live</p>
            <h1 className="page-title">Live Channels</h1>
            <p className="lead">Join active broadcasts available to your account or public viewers.</p>
          </div>
          <div className="actions">
            {canCreate ? (
              <Link href="/live/new" className="button">Go live</Link>
            ) : (
              !user && <Link href="/login?callbackUrl=/live" className="button-secondary">Sign in</Link>
            )}
          </div>
        </div>

        <form action="/live" className="filter-form">
          {baseParams.limit && <input type="hidden" name="limit" value={baseParams.limit} />}
          <div className="field">
            <label htmlFor="stream-search">Search live channels</label>
            <input
              id="stream-search"
              name="q"
              type="search"
              className="form-input"
              defaultValue={query}
              placeholder="Title, module, host"
            />
          </div>
          <button type="submit" className="button-secondary">Search</button>
          {query && <Link href={listingHref("/live", { limit: baseParams.limit })} className="button-quiet">Clear</Link>}
        </form>
      </section>

      <section className="container section">
        {activeStreams.length === 0 ? (
          <div className="empty-state">
            <h2 className="card-title">No active broadcasts</h2>
            <p className="muted">The library remains available while no room is live.</p>
            <Link href="/explore" className="button-secondary">Explore videos</Link>
          </div>
        ) : (
          <div className="grid video-grid">
            {activeStreams.map((stream) => (
              <LiveStreamCard key={stream.id} stream={stream} />
            ))}
          </div>
        )}
        {nextCursor && (
          <div className="pagination">
            <Link href={listingHref("/live", { ...baseParams, cursor: nextCursor })} className="button-secondary">
              Next page
            </Link>
          </div>
        )}
      </section>
    </main>
  )
}
