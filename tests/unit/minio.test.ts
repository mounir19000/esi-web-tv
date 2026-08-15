import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { bucketPolicyAllowsAnonymousRead } from "../../src/lib/minio"

describe("bucketPolicyAllowsAnonymousRead", () => {
  it("detects anonymous GetObject access on the video bucket", () => {
    const policy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: ["*"] },
          Action: ["s3:GetObject"],
          Resource: ["arn:aws:s3:::esitv-videos/*"],
        },
      ],
    })

    assert.equal(bucketPolicyAllowsAnonymousRead(policy), true)
  })

  it("ignores non-public policies", () => {
    const policy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: ["arn:aws:iam::123:user/app"] },
          Action: ["s3:GetObject"],
          Resource: ["arn:aws:s3:::esitv-videos/*"],
        },
      ],
    })

    assert.equal(bucketPolicyAllowsAnonymousRead(policy), false)
    assert.equal(bucketPolicyAllowsAnonymousRead(""), false)
  })

  it("fails closed on invalid policy JSON", () => {
    assert.throws(() => bucketPolicyAllowsAnonymousRead("{"), /not valid JSON/)
  })
})
