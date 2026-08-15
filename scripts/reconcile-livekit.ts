import "dotenv/config"
import { reconcileLiveKitState } from "../src/lib/livekit-lifecycle"

async function main() {
  const result = await reconcileLiveKitState()
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
