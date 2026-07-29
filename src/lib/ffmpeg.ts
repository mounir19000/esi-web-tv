import ffmpeg from 'fluent-ffmpeg'
import { minioClient } from './minio'
import fs from 'fs'
import path from 'path'

const BUCKET_NAME = 'esitv-videos'

export const transcodeAndUpload = async (inputFilePath: string, videoId: string) => {
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
            await minioClient.fPutObject(BUCKET_NAME, `videos/${outputFileName}`, outputFilePath)
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
          await minioClient.fPutObject(BUCKET_NAME, `thumbnails/${thumbName}`, thumbPath)
          fs.unlinkSync(thumbPath)
          resolve(true)
        } catch (err) {
          reject(err)
        }
      })
  })

  // Clean up original input file
  fs.unlinkSync(inputFilePath)
}
