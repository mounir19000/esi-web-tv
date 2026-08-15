import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { AudienceType, Role } from "@prisma/client"
import {
  boundedText,
  normalizeEsiEmail,
  parseAudience,
  parseRole,
  validatePassword,
  validationLimits,
  type FieldErrors,
} from "../../src/lib/validation"

describe("validation helpers", () => {
  it("normalizes valid ESI emails and rejects other domains", () => {
    const errors: FieldErrors = {}
    assert.equal(normalizeEsiEmail(" USER@ESI.DZ ", errors), "user@esi.dz")
    assert.deepEqual(errors, {})

    const invalidErrors: FieldErrors = {}
    assert.equal(normalizeEsiEmail("user@example.com", invalidErrors), "user@example.com")
    assert.equal(invalidErrors.email, "Use a valid @esi.dz email address")
  })

  it("enforces text and password boundaries", () => {
    const errors: FieldErrors = {}
    assert.equal(boundedText("title", " A title ", validationLimits.titleMax, errors, true), "A title")
    assert.equal(validatePassword("short", errors), "short")
    assert.equal(errors.password, "Must be at least 12 characters")
  })

  it("parses known enums and reports invalid values", () => {
    const errors: FieldErrors = {}
    assert.equal(parseRole(Role.TEACHER, errors), Role.TEACHER)
    assert.equal(parseAudience(AudienceType.MODULE, errors), AudienceType.MODULE)
    assert.deepEqual(errors, {})

    const invalidErrors: FieldErrors = {}
    assert.equal(parseAudience("WORLD", invalidErrors), null)
    assert.match(invalidErrors.audience, /PUBLIC/)
  })
})
