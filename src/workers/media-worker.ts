import "dotenv/config"
import { createMediaWorker } from "@/lib/media-worker"
import { reconcileMediaProcessingQueue } from "@/lib/media-processing"

const reconciliationIntervalMs = 5 * 60 * 1000
const worker = createMediaWorker()

async function runReconciliation() {
  try {
    const result = await reconcileMediaProcessingQueue()
    console.log(
      `Media queue reconciliation scanned ${result.scanned}, enqueued ${result.enqueued}, failed ${result.failed}`,
    )
  } catch (error) {
    console.error("Media queue reconciliation failed:", error)
  }
}

const reconciliationInterval = setInterval(runReconciliation, reconciliationIntervalMs)
void runReconciliation()

async function shutdown(signal: string) {
  console.log(`Received ${signal}, closing media worker`)
  clearInterval(reconciliationInterval)
  await worker.close()
  process.exit(0)
}

process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))

worker.on("ready", () => {
  console.log("Media worker is ready")
})

worker.on("error", (error) => {
  console.error("Media worker error:", error)
})
