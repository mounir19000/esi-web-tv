import { UnrecoverableError, Worker, type Job } from "bullmq"
import {
  createRedisConnection,
  mediaProcessingQueueName,
  type MediaProcessingJobData,
} from "@/lib/media-queue"
import {
  MediaProcessingError,
  normalizeProcessingError,
  processMediaJob,
} from "@/lib/media-processing"
import { appConfig } from "@/lib/env"

function getWorkerConcurrency() {
  return appConfig.queue.mediaWorkerConcurrency
}

function getMaxAttempts(job: Job<MediaProcessingJobData>) {
  return typeof job.opts.attempts === "number" && job.opts.attempts > 0 ? job.opts.attempts : 1
}

export function createMediaWorker() {
  const worker = new Worker<MediaProcessingJobData>(
    mediaProcessingQueueName,
    async (job) => {
      try {
        await processMediaJob(job.data, {
          attempt: job.attemptsMade + 1,
          maxAttempts: getMaxAttempts(job),
        })
      } catch (error) {
        const processingError = normalizeProcessingError(error)
        if (processingError instanceof MediaProcessingError && !processingError.retryable) {
          throw new UnrecoverableError(processingError.message)
        }
        throw error
      }
    },
    {
      connection: createRedisConnection(),
      concurrency: getWorkerConcurrency(),
      lockDuration: 10 * 60 * 1000,
    },
  )

  worker.on("completed", (job) => {
    console.log(`Completed media processing job ${job.id}`)
  })

  worker.on("failed", (job, error) => {
    console.error(`Failed media processing job ${job?.id || "unknown"}:`, error)
  })

  return worker
}
