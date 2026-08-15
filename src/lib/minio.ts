import * as Minio from 'minio'

export const VIDEO_BUCKET_NAME = 'esitv-videos'

export const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ROOT_USER || 'minioadmin',
  secretKey: process.env.MINIO_ROOT_PASSWORD || 'minioadmin',
})

type BucketPolicyStatement = {
  Effect?: string
  Principal?: unknown
  Action?: string | string[]
  Resource?: string | string[]
}

type BucketPolicy = {
  Statement?: BucketPolicyStatement | BucketPolicyStatement[]
}

function asArray<T>(value: T | T[] | undefined) {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

function principalAllowsAnonymous(principal: unknown) {
  if (principal === '*') {
    return true
  }

  if (!principal || typeof principal !== 'object') {
    return false
  }

  const awsPrincipal = (principal as { AWS?: unknown }).AWS
  return awsPrincipal === '*' || asArray(awsPrincipal as string | string[] | undefined).includes('*')
}

function actionAllowsObjectRead(action: string) {
  return action === '*' || action === 's3:*' || action === 's3:GetObject'
}

function resourceTargetsVideoBucket(resource: string) {
  return (
    resource === '*' ||
    resource === `arn:aws:s3:::${VIDEO_BUCKET_NAME}/*` ||
    resource.startsWith(`arn:aws:s3:::${VIDEO_BUCKET_NAME}/`)
  )
}

export function bucketPolicyAllowsAnonymousRead(policyText: string) {
  if (!policyText.trim()) {
    return false
  }

  let policy: BucketPolicy
  try {
    policy = JSON.parse(policyText) as BucketPolicy
  } catch {
    throw new Error('Video bucket policy is not valid JSON')
  }

  return asArray(policy.Statement).some((statement) => {
    if (statement.Effect !== 'Allow' || !principalAllowsAnonymous(statement.Principal)) {
      return false
    }

    const allowsRead = asArray(statement.Action).some(actionAllowsObjectRead)
    const targetsVideoBucket = asArray(statement.Resource).some(resourceTargetsVideoBucket)
    return allowsRead && targetsVideoBucket
  })
}

function isMissingPolicyError(error: unknown) {
  const minioError = error as { code?: string; Code?: string; statusCode?: number }
  return (
    minioError.code === 'NoSuchBucketPolicy' ||
    minioError.Code === 'NoSuchBucketPolicy' ||
    minioError.statusCode === 404
  )
}

export const ensureVideoBucketPrivate = async () => {
  try {
    const policy = await minioClient.getBucketPolicy(VIDEO_BUCKET_NAME)
    if (bucketPolicyAllowsAnonymousRead(policy)) {
      await minioClient.setBucketPolicy(VIDEO_BUCKET_NAME, '')
    }
  } catch (error) {
    if (isMissingPolicyError(error)) {
      return
    }

    throw error
  }
}

export const initBuckets = async () => {
  const exists = await minioClient.bucketExists(VIDEO_BUCKET_NAME)
  if (!exists) {
    await minioClient.makeBucket(VIDEO_BUCKET_NAME, 'us-east-1')
  }

  await ensureVideoBucketPrivate()
}
