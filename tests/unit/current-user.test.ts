import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { ProvisioningStatus, Role } from "@prisma/client"
import {
  AuthenticationError,
  AuthorizationError,
  authErrorStatus,
  resolveCurrentUserFromSession,
  type CurrentUser,
} from "../../src/lib/current-user"

function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: "user-1",
    name: "Test User",
    email: "test@esi.dz",
    image: null,
    role: Role.TEACHER,
    yearGroup: null,
    provisioningStatus: ProvisioningStatus.APPROVED,
    isActive: true,
    disabledAt: null,
    sessionVersion: 3,
    moduleEnrollments: [],
    teacherAssignments: [],
    cohortMemberships: [],
    ...overrides,
  }
}

describe("resolveCurrentUserFromSession", () => {
  it("returns the active database user when the session version matches", () => {
    const currentUser = user()

    assert.equal(
      resolveCurrentUserFromSession({ id: currentUser.id, sessionVersion: 3 }, currentUser),
      currentUser,
    )
  })

  it("denies inactive, disabled, missing, and version-mismatched users", () => {
    assert.equal(resolveCurrentUserFromSession({ id: "user-1", sessionVersion: 3 }, null), null)
    assert.equal(
      resolveCurrentUserFromSession({ id: "user-1", sessionVersion: 3 }, user({ isActive: false })),
      null,
    )
    assert.equal(
      resolveCurrentUserFromSession(
        { id: "user-1", sessionVersion: 3 },
        user({ disabledAt: new Date("2026-08-15T00:00:00.000Z") }),
      ),
      null,
    )
    assert.equal(
      resolveCurrentUserFromSession({ id: "user-1", sessionVersion: 2 }, user({ sessionVersion: 3 })),
      null,
    )
  })

  it("allows pre-version sessions during rollout while active database state is valid", () => {
    const currentUser = user()

    assert.equal(resolveCurrentUserFromSession({ id: currentUser.id }, currentUser), currentUser)
  })
})

describe("authErrorStatus", () => {
  it("maps auth helper errors to HTTP status codes", () => {
    assert.equal(authErrorStatus(new AuthenticationError()), 401)
    assert.equal(authErrorStatus(new AuthorizationError()), 403)
    assert.equal(authErrorStatus(new Error("boom")), null)
  })
})
