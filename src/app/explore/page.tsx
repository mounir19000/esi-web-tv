import type { Metadata } from "next"
import Link from "next/link"
import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { visibleVideoWhere } from "@/lib/content-access"
import { VideoCard } from "@/components/ContentCards"
import { getCurrentUser } from "@/lib/current-user"
import {
  andWhere,
  dateCursorWhere,
  listingHref,
  paginateDateCursorItems,
  paginationLimits,
  parseListingParams,
  videoCardSelect,
  videoSearchWhere,
} from "@/lib/listing-queries"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Explore | ESI Web TV",
}

const videoTypes = ["TEACHING", "CLUB", "EXPLANATION", "OTHER"] as const

type ExplorePageProps = {
  searchParams?: Promise<{
    type?: string
    q?: string
    cursor?: string
    limit?: string
  }>
}

export default async function ExplorePage({ searchParams }: ExplorePageProps) {
  const user = await getCurrentUser()
  const params = (await searchParams) ?? {}
  const { query, cursor, pageSize } = parseListingParams(params, "videos")
  const selectedType = videoTypes.find((type) => type === params?.type)
  const visibilityWhere = visibleVideoWhere(user)
  const baseParams = {
    q: query || undefined,
    type: selectedType,
    limit: pageSize === paginationLimits.videos.defaultSize ? undefined : pageSize,
  }

  const videoRows = await prisma.video.findMany({
    where: andWhere<Prisma.VideoWhereInput>([
      visibilityWhere,
      selectedType ? { type: selectedType } : undefined,
      videoSearchWhere(query),
      dateCursorWhere<Prisma.VideoWhereInput>(cursor),
    ]),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    select: videoCardSelect,
  })
  const { items: videos, nextCursor } = paginateDateCursorItems(videoRows, pageSize)

  return (
    <main id="main-content" className="page" tabIndex={-1}>
      <section className="container">
        <div className="section-header">
          <div>
            <p className="eyebrow">Library</p>
            <h1 className="page-title">Explore Videos</h1>
            <p className="lead">Browse public videos and the module recordings available to your account.</p>
          </div>
        </div>

        <div className="actions" aria-label="Video type filters">
          <Link
            href={listingHref("/explore", { q: query || undefined, limit: baseParams.limit })}
            className={selectedType ? "button-secondary" : "button"}
          >
            All
          </Link>
          {videoTypes.map((type) => (
            <Link
              key={type}
              href={listingHref("/explore", { ...baseParams, type })}
              className={selectedType === type ? "button" : "button-secondary"}
            >
              {type}
            </Link>
          ))}
        </div>

        <form action="/explore" className="filter-form">
          {selectedType && <input type="hidden" name="type" value={selectedType} />}
          {baseParams.limit && <input type="hidden" name="limit" value={baseParams.limit} />}
          <div className="field">
            <label htmlFor="video-search">Search videos</label>
            <input
              id="video-search"
              name="q"
              type="search"
              className="form-input"
              defaultValue={query}
              placeholder="Title, module, uploader"
            />
          </div>
          <button type="submit" className="button-secondary">Search</button>
          {query && (
            <Link href={listingHref("/explore", { type: selectedType, limit: baseParams.limit })} className="button-quiet">
              Clear
            </Link>
          )}
        </form>
      </section>

      <section className="container section">
        {videos.length === 0 ? (
          <div className="empty-state">
            <h2 className="card-title">No videos found</h2>
            <p className="muted">Try another category or check back after new uploads are published.</p>
          </div>
        ) : (
          <div className="grid video-grid">
            {videos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        )}
        {nextCursor && (
          <div className="pagination">
            <Link href={listingHref("/explore", { ...baseParams, cursor: nextCursor })} className="button-secondary">
              Next page
            </Link>
          </div>
        )}
      </section>
    </main>
  )
}
