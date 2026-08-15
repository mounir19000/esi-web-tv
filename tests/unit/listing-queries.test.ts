import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  adminUserRowSelect,
  dateCursorWhere,
  decodeDateCursor,
  encodeDateCursor,
  liveStreamCardSelect,
  paginateDateCursorItems,
  parseListingParams,
  paginationLimits,
  videoCardSelect,
} from "../../src/lib/listing-queries"

describe("listing query pagination", () => {
  it("normalizes search params and caps page sizes", () => {
    const params = parseListingParams(
      {
        q: "  algorithms    revision  ",
        limit: "999",
        cursor: "not-json",
      },
      "videos",
    )

    assert.equal(params.query, "algorithms revision")
    assert.equal(params.pageSize, paginationLimits.videos.maxSize)
    assert.equal(params.cursor, null)
  })

  it("creates deterministic createdAt/id cursors", () => {
    const rows = [
      { id: "video-3", createdAt: new Date("2026-08-15T10:02:00.000Z") },
      { id: "video-2", createdAt: new Date("2026-08-15T10:01:00.000Z") },
      { id: "video-1", createdAt: new Date("2026-08-15T10:00:00.000Z") },
    ]

    const page = paginateDateCursorItems(rows, 2)
    const decoded = decodeDateCursor(page.nextCursor ?? "")

    assert.deepEqual(page.items.map((row) => row.id), ["video-3", "video-2"])
    assert.deepEqual(decoded, { id: "video-2", createdAt: rows[1].createdAt })
    assert.deepEqual(dateCursorWhere(decoded), {
      OR: [
        { createdAt: { lt: rows[1].createdAt } },
        { createdAt: rows[1].createdAt, id: { lt: "video-2" } },
      ],
    })
  })

  it("round-trips an encoded cursor", () => {
    const cursor = { id: "user-1", createdAt: new Date("2026-08-15T12:00:00.000Z") }

    assert.deepEqual(decodeDateCursor(encodeDateCursor(cursor)), cursor)
  })
})

describe("listing query DTO selects", () => {
  it("keeps video cards away from account secrets", () => {
    assert.equal("password" in videoCardSelect, false)
    assert.equal("email" in videoCardSelect, false)
    assert.deepEqual(videoCardSelect.uploader, { select: { name: true } })
  })

  it("keeps live stream cards away from account secrets", () => {
    assert.equal("password" in liveStreamCardSelect, false)
    assert.equal("email" in liveStreamCardSelect, false)
    assert.deepEqual(liveStreamCardSelect.host, { select: { name: true } })
  })

  it("selects only user-management fields needed by the table", () => {
    assert.equal("password" in adminUserRowSelect, false)
    assert.equal("accounts" in adminUserRowSelect, false)
    assert.equal("sessions" in adminUserRowSelect, false)
    assert.equal("image" in adminUserRowSelect, false)
    assert.deepEqual(adminUserRowSelect.moduleEnrollments, { select: { moduleId: true } })
    assert.deepEqual(adminUserRowSelect.teacherAssignments, { select: { moduleId: true } })
    assert.deepEqual(adminUserRowSelect.cohortMemberships, { select: { cohortId: true } })
  })
})
