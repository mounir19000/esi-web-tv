import * as Minio from 'minio'
import { appConfig } from '@/lib/env'

export const VIDEO_BUCKET_NAME = appConfig.minio.videoBucket

let cachedMinioClient: Minio.Client | null = null

export function getMinioClient() {
  cachedMinioClient ??= new Minio.Client({
    endPoint: appConfig.minio.endpoint,
    port: appConfig.minio.port,
    useSSL: appConfig.minio.useSSL,
    accessKey: appConfig.minio.accessKey,
    secretKey: appConfig.minio.secretKey,
  })

  return cachedMinioClient
}

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

export const initBuckets = async () => {
  const minioClient = getMinioClient()
  const exists = await minioClient.bucketExists(VIDEO_BUCKET_NAME)
  if (!exists) {
    throw new Error(`Video bucket "${VIDEO_BUCKET_NAME}" is not provisioned`)
  }
}
