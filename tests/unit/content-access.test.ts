import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { Role, VideoStatus } from "@prisma/client"
import { visibleVideoWhere } from "../../src/lib/content-access"

describe("visibleVideoWhere", () => {
  it("only exposes ready videos to educators in library views", () => {
    assert.deepEqual(visibleVideoWhere({ role: Role.TEACHER } as never), {
      status: VideoStatus.READY,
    })
  })

  it("combines student scope with ready-only video visibility", () => {
    assert.deepEqual(visibleVideoWhere({ role: Role.STUDENT, yearGroup: "1CP" } as never), {
      AND: [
        { status: VideoStatus.READY },
        { OR: [{ isPublic: true }, { module: { yearGroup: "1CP" } }] },
      ],
    })
  })

  it("only exposes public ready videos to signed-out viewers", () => {
    assert.deepEqual(visibleVideoWhere(null), {
      AND: [{ status: VideoStatus.READY }, { isPublic: true }],
    })
  })
})
