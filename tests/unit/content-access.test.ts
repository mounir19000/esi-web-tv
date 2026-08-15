import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { AudienceType, ProvisioningStatus, Role, VideoStatus } from "@prisma/client"
import {
  canManageUserContent,
  canPublishToAudience,
  canViewScopedContent,
  visibleVideoWhere,
} from "../../src/lib/content-access"

describe("visibleVideoWhere", () => {
  it("only exposes explicit public ready videos to signed-out viewers", () => {
    assert.deepEqual(visibleVideoWhere(null), {
      AND: [
        { status: VideoStatus.READY },
        { OR: [{ audience: AudienceType.PUBLIC }, { isPublic: true }] },
      ],
    })
  })

  it("uses enrollment and selected-user relationships for students", () => {
    assert.deepEqual(
      visibleVideoWhere({
        id: "student-1",
        role: Role.STUDENT,
        provisioningStatus: ProvisioningStatus.APPROVED,
        moduleEnrollments: [{ moduleId: "module-1" }],
        cohortMemberships: [{ cohortId: "cohort-1" }],
      }),
      {
        AND: [
          { status: VideoStatus.READY },
          {
            OR: [
              { audience: AudienceType.PUBLIC },
              { isPublic: true },
              { uploaderId: "student-1" },
              { audience: AudienceType.ESI },
              { audience: AudienceType.MODULE, moduleId: { in: ["module-1"] } },
              { audience: AudienceType.COHORT, cohortId: { in: ["cohort-1"] } },
              {
                audience: AudienceType.SELECTED_USERS,
                audienceUsers: { some: { userId: "student-1" } },
              },
            ],
          },
        ],
      },
    )
  })

  it("limits teachers to assigned module audiences instead of all private videos", () => {
    assert.deepEqual(
      visibleVideoWhere({
        id: "teacher-1",
        role: Role.TEACHER,
        provisioningStatus: ProvisioningStatus.APPROVED,
        teacherAssignments: [{ moduleId: "module-2", canPublish: true, canManage: true }],
      }),
      {
        AND: [
          { status: VideoStatus.READY },
          {
            OR: [
              { audience: AudienceType.PUBLIC },
              { isPublic: true },
              { uploaderId: "teacher-1" },
              { audience: AudienceType.ESI },
              { audience: AudienceType.MODULE, moduleId: { in: ["module-2"] } },
              {
                audience: AudienceType.SELECTED_USERS,
                audienceUsers: { some: { userId: "teacher-1" } },
              },
            ],
          },
        ],
      },
    )
  })

  it("allows admins to list every ready video", () => {
    assert.deepEqual(
      visibleVideoWhere({
        id: "admin-1",
        role: Role.ADMIN,
        provisioningStatus: ProvisioningStatus.APPROVED,
      }),
      { status: VideoStatus.READY },
    )
  })
})

describe("canViewScopedContent", () => {
  it("keeps ESI-wide private content for approved signed-in users only", () => {
    const content = { isPublic: false, audience: AudienceType.ESI }
    assert.equal(canViewScopedContent(content, null), false)
    assert.equal(
      canViewScopedContent(content, { id: "student-1", role: Role.STUDENT, provisioningStatus: ProvisioningStatus.APPROVED }),
      true,
    )
    assert.equal(
      canViewScopedContent(content, { id: "guest-1", role: Role.GUEST, provisioningStatus: ProvisioningStatus.PENDING }),
      false,
    )
  })

  it("denies unassigned teachers from unrelated module content", () => {
    const content = {
      isPublic: false,
      audience: AudienceType.MODULE,
      moduleId: "module-1",
      uploaderId: "teacher-2",
    }

    assert.equal(
      canViewScopedContent(content, {
        id: "teacher-1",
        role: Role.TEACHER,
        provisioningStatus: ProvisioningStatus.APPROVED,
        teacherAssignments: [{ moduleId: "module-2" }],
      }),
      false,
    )
    assert.equal(
      canViewScopedContent(content, {
        id: "teacher-1",
        role: Role.TEACHER,
        provisioningStatus: ProvisioningStatus.APPROVED,
        teacherAssignments: [{ moduleId: "module-1" }],
      }),
      true,
    )
  })
})

describe("canPublishToAudience", () => {
  it("requires teacher assignments before module publishing", () => {
    const teacher = {
      id: "teacher-1",
      role: Role.TEACHER,
      provisioningStatus: ProvisioningStatus.APPROVED,
      teacherAssignments: [{ moduleId: "module-1", canPublish: true }],
    }

    assert.equal(canPublishToAudience(teacher, { audience: AudienceType.PUBLIC }), true)
    assert.equal(canPublishToAudience(teacher, { audience: AudienceType.MODULE, moduleId: "module-1" }), true)
    assert.equal(canPublishToAudience(teacher, { audience: AudienceType.MODULE, moduleId: "module-2" }), false)
  })
})

describe("canManageUserContent", () => {
  it("allows approved admins to manage any user's content", () => {
    assert.equal(
      canManageUserContent("teacher-1", {
        id: "admin-1",
        role: Role.ADMIN,
        provisioningStatus: ProvisioningStatus.APPROVED,
      }),
      true,
    )
  })

  it("allows the approved educator owner to manage their own content", () => {
    assert.equal(
      canManageUserContent("teacher-1", {
        id: "teacher-1",
        role: Role.TEACHER,
        provisioningStatus: ProvisioningStatus.APPROVED,
      }),
      true,
    )
  })

  it("denies pending or demoted content owners", () => {
    assert.equal(
      canManageUserContent("teacher-1", {
        id: "teacher-1",
        role: Role.TEACHER,
        provisioningStatus: ProvisioningStatus.PENDING,
      }),
      false,
    )
    assert.equal(
      canManageUserContent("teacher-1", {
        id: "teacher-1",
        role: Role.STUDENT,
        provisioningStatus: ProvisioningStatus.APPROVED,
      }),
      false,
    )
  })
})
