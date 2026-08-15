import IORedis from "ioredis"
import * as Minio from "minio"
import pg from "pg"

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required`)
  }

  return value
}

async function checkDatabase() {
  const pool = new pg.Pool({ connectionString: required("DATABASE_URL") })
  try {
    await pool.query("SELECT 1")
  } finally {
    await pool.end()
  }
}

async function checkRedis() {
  const redis = new IORedis(required("REDIS_URL"), {
    maxRetriesPerRequest: null,
  })

  try {
    await redis.ping()
  } finally {
    await redis.quit().catch(() => redis.disconnect())
  }
}

async function checkMinio() {
  const minioClient = new Minio.Client({
    endPoint: required("MINIO_ENDPOINT"),
    port: Number.parseInt(required("MINIO_PORT"), 10),
    useSSL: required("MINIO_USE_SSL").toLowerCase() === "true",
    accessKey: required("MINIO_ACCESS_KEY"),
    secretKey: required("MINIO_SECRET_KEY"),
  })

  const bucketExists = await minioClient.bucketExists(required("MINIO_VIDEO_BUCKET"))
  if (!bucketExists) {
    throw new Error("Video bucket is not provisioned")
  }
}

try {
  await Promise.all([checkDatabase(), checkRedis(), checkMinio()])
  process.exit(0)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
