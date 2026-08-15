import * as Minio from "minio"
import { Client } from "pg"
import { e2eEnv, e2eRun } from "./e2e-env"

function quoteIdentifier(value: string) {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    throw new Error(`Unsafe E2E database name: ${value}`)
  }

  return `"${value}"`
}

function minioClient() {
  return new Minio.Client({
    endPoint: e2eEnv.MINIO_ENDPOINT,
    port: Number(e2eEnv.MINIO_PORT),
    useSSL: e2eEnv.MINIO_USE_SSL === "true",
    accessKey: e2eEnv.MINIO_ACCESS_KEY,
    secretKey: e2eEnv.MINIO_SECRET_KEY,
  })
}

async function removeBucket() {
  const client = minioClient()
  const exists = await client.bucketExists(e2eRun.bucketName).catch(() => false)
  if (!exists) {
    return
  }

  const objectNames: string[] = []
  const stream = client.listObjectsV2(e2eRun.bucketName, "", true)
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (item: { name?: string }) => {
      if (item.name) {
        objectNames.push(item.name)
      }
    })
    stream.on("error", reject)
    stream.on("end", resolve)
  })

  if (objectNames.length > 0) {
    await client.removeObjects(e2eRun.bucketName, objectNames)
  }
  await client.removeBucket(e2eRun.bucketName)
}

async function dropDatabase() {
  const adminUrl = new URL(e2eRun.databaseUrl)
  adminUrl.pathname = "/postgres"
  adminUrl.search = ""
  const client = new Client({ connectionString: adminUrl.toString() })

  await client.connect()
  try {
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [e2eRun.databaseName],
    )
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(e2eRun.databaseName)}`)
  } finally {
    await client.end()
  }
}

export default async function globalTeardown() {
  if (e2eRun.bucketName.includes("e2e")) {
    await removeBucket()
  }
  if (e2eRun.databaseName.includes("e2e")) {
    await dropDatabase()
  }
}
