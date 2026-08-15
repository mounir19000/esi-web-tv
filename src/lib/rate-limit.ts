type RateLimitBucket = {
  count: number
  resetAt: number
}

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

declare global {
  var esiWebTvRateLimitBuckets: Map<string, RateLimitBucket> | undefined
}

function getBuckets() {
  globalThis.esiWebTvRateLimitBuckets ??= new Map<string, RateLimitBucket>()
  return globalThis.esiWebTvRateLimitBuckets
}

function pruneExpiredBuckets(now: number) {
  const buckets = getBuckets()
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  pruneExpiredBuckets(now)

  const buckets = getBuckets()
  const existingBucket = buckets.get(key)
  const bucket = existingBucket && existingBucket.resetAt > now
    ? existingBucket
    : { count: 0, resetAt: now + windowMs }

  bucket.count += 1
  buckets.set(key, bucket)

  const remaining = Math.max(0, limit - bucket.count)
  return {
    allowed: bucket.count <= limit,
    remaining,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  }
}
