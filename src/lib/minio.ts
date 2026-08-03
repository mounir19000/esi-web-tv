import * as Minio from 'minio'

export const VIDEO_BUCKET_NAME = 'esitv-videos'

export const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ROOT_USER || 'minioadmin',
  secretKey: process.env.MINIO_ROOT_PASSWORD || 'minioadmin',
})

// Initialize buckets
export const initBuckets = async () => {
  const exists = await minioClient.bucketExists(VIDEO_BUCKET_NAME)
  if (!exists) {
    await minioClient.makeBucket(VIDEO_BUCKET_NAME, 'us-east-1')
    
    // Set bucket policy for public read access
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${VIDEO_BUCKET_NAME}/*`],
        },
      ],
    }
    await minioClient.setBucketPolicy(VIDEO_BUCKET_NAME, JSON.stringify(policy))
  }
}
