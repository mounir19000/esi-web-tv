import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { e2eEnv, e2eRun } from "../e2e-env"

describe("E2E isolation defaults", () => {
  it("uses disposable resource names and a test runtime", () => {
    assert.match(e2eRun.databaseName, /e2e/)
    assert.match(e2eRun.bucketName, /e2e/)
    assert.equal(e2eEnv.APP_ENV, "test")
    assert.equal(e2eEnv.ALLOW_DEMO_SEED, "false")
    assert.equal(new URL(e2eEnv.DATABASE_URL).pathname.slice(1), e2eRun.databaseName)
  })
})
