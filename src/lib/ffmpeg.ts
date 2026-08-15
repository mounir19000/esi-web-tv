import ffmpeg from 'fluent-ffmpeg'
import { initBuckets, minioClient, VIDEO_BUCKET_NAME } from './minio'
import fs from 'fs'
import path from 'path'

export const transcodeAndUpload = async (inputFilePath: string, videoId: string) => {
  await initBuckets()
  let thumbnailUrl: string | null = null

  const resolutions = [
    { name: '480p', width: 854, height: 480 },
    { name: '720p', width: 1280, height: 720 },
    { name: '1080p', width: 1920, height: 1080 }
  ]

  for (const res of resolutions) {
    const outputFileName = `${videoId}-${res.name}.mp4`
    const outputFilePath = path.join('/tmp', outputFileName)

    await new Promise((resolve, reject) => {
      ffmpeg(inputFilePath)
        .size(`${res.width}x${res.height}`)
        .videoCodec('libx264')
        .outputOptions([
          '-preset fast',
          '-crf 28' // good balance for size/quality
        ])
        .on('end', async () => {
          try {
            // Upload to MinIO
            await minioClient.fPutObject(
              VIDEO_BUCKET_NAME,
              `videos/${outputFileName}`,
              outputFilePath,
              { 'Content-Type': 'video/mp4' },
            )
            // Clean up tmp file
            fs.unlinkSync(outputFilePath)
            resolve(true)
          } catch (err) {
            reject(err)
          }
        })
        .on('error', (err) => {
          console.error(`FFmpeg Error for ${res.name}:`, err)
          reject(err)
        })
        .save(outputFilePath)
    })
  }

  // Generate thumbnail from first frame
  const thumbName = `${videoId}-thumb.jpg`
  const thumbPath = path.join('/tmp', thumbName)
  await new Promise((resolve, reject) => {
    ffmpeg(inputFilePath)
      .screenshots({
        timestamps: ['00:00:01'],
        filename: thumbName,
        folder: '/tmp',
        size: '1280x720'
      })
      .on('end', async () => {
        try {
          if (!fs.existsSync(thumbPath)) {
            resolve(true)
            return
          }
          await minioClient.fPutObject(
            VIDEO_BUCKET_NAME,
            `thumbnails/${thumbName}`,
            thumbPath,
            { 'Content-Type': 'image/jpeg' },
          )
          thumbnailUrl = `thumbnails/${thumbName}`
          fs.unlinkSync(thumbPath)
          resolve(true)
        } catch (err) {
          reject(err)
        }
      })
      .on('error', () => resolve(true))
  })

  // Clean up original input file
  fs.unlinkSync(inputFilePath)

  return {
    videoUrl: `videos/${videoId}-720p.mp4`,
    thumbnailUrl,
  }
}
