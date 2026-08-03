import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { VideoType } from "@prisma/client"
import { v4 as uuidv4 } from "uuid"
import fs from "fs"
import path from "path"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { transcodeAndUpload } from "@/lib/ffmpeg"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Upload Video | ESI Web TV",
}

const allowedVideoTypes = new Set<string>(Object.values(VideoType))
const maxUploadBytes = 1024 * 1024 * 1024

export default async function UploadVideoPage() {
  const session = await auth()
  if (!session?.user) {
    redirect("/login?callbackUrl=/dashboard/upload")
  }
  if (session.user.role !== "TEACHER" && session.user.role !== "ADMIN") {
    redirect("/dashboard")
  }

  const modules = await prisma.module.findMany({
    orderBy: [{ yearGroup: "asc" }, { name: "asc" }],
  })

  async function uploadVideo(formData: FormData) {
    "use server"

    const session = await auth()
    if (!session?.user || (session.user.role !== "TEACHER" && session.user.role !== "ADMIN")) {
      throw new Error("Unauthorized")
    }

    const title = String(formData.get("title") || "").trim()
    const description = String(formData.get("description") || "").trim()
    const requestedType = String(formData.get("type") || "OTHER")
    const moduleId = String(formData.get("moduleId") || "")
    const file = formData.get("file")

    if (!title) {
      throw new Error("Video title is required")
    }

    if (!allowedVideoTypes.has(requestedType)) {
      throw new Error("Invalid video type")
    }

    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Upload a valid MP4 file")
    }

    if (file.size > maxUploadBytes) {
      throw new Error("Video file is too large")
    }

    if (file.type && file.type !== "video/mp4") {
      throw new Error("Only MP4 files are supported")
    }

    const selectedModule = moduleId
      ? await prisma.module.findUnique({ where: { id: moduleId }, select: { id: true } })
      : null

    if (moduleId && !selectedModule) {
      throw new Error("Selected module was not found")
    }

    const videoId = uuidv4()
    const tempDir = path.join("/tmp", "esitv-uploads")
    fs.mkdirSync(tempDir, { recursive: true })

    const tempPath = path.join(tempDir, `${videoId}.mp4`)
    const buffer = Buffer.from(await file.arrayBuffer())
    fs.writeFileSync(tempPath, buffer)

    const isPublic =
      formData.get("isPublic") === "on" ||
      requestedType === "CLUB" ||
      requestedType === "EXPLANATION"

    const video = await prisma.video.create({
      data: {
        id: videoId,
        title,
        description,
        type: requestedType as VideoType,
        isPublic,
        url: `videos/${videoId}-720p.mp4`,
        thumbnailUrl: null,
        uploaderId: session.user.id,
        ...(selectedModule ? { moduleId: selectedModule.id } : {}),
      },
    })

    transcodeAndUpload(tempPath, video.id)
      .then(async ({ videoUrl, thumbnailUrl }) => {
        await prisma.video.update({
          where: { id: video.id },
          data: { url: videoUrl, thumbnailUrl },
        })
      })
      .catch((error) => {
        console.error(`Failed to process uploaded video ${video.id}:`, error)
        fs.rmSync(tempPath, { force: true })
      })

    revalidatePath("/")
    revalidatePath("/explore")
    revalidatePath("/dashboard")
    redirect(`/video/${video.id}`)
  }

  return (
    <main className="page-narrow">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Publishing</p>
            <h1 className="section-title">Upload Video</h1>
            <p className="lead">Add an MP4 recording for modules, explanations, or club activity.</p>
          </div>
        </div>

        <form action={uploadVideo} className="form-stack">
          <div className="field">
            <label htmlFor="title">Video title</label>
            <input
              type="text"
              id="title"
              name="title"
              required
              className="form-input"
              placeholder="Introduction to Web Development"
            />
          </div>

          <div className="field">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              rows={4}
              className="form-textarea"
              placeholder="Topic, session, speaker, or notes"
            />
          </div>

          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="type">Video type</label>
              <select id="type" name="type" className="form-select" required defaultValue="TEACHING">
                <option value="TEACHING">Teaching</option>
                <option value="CLUB">Club</option>
                <option value="EXPLANATION">Explanation</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="moduleId">Module</label>
              <select id="moduleId" name="moduleId" className="form-select" defaultValue="">
                <option value="">General</option>
                {modules.map((module) => (
                  <option key={module.id} value={module.id}>
                    {module.yearGroup} · {module.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="checkbox-row">
            <input type="checkbox" name="isPublic" />
            <span>Make this video public</span>
          </label>

          <div className="field">
            <label htmlFor="file">MP4 file</label>
            <input type="file" id="file" name="file" accept="video/mp4" required className="form-input" />
            <p className="field-hint">Processing continues after the video record is created.</p>
          </div>

          <button type="submit" className="button">Upload and process</button>
        </form>
      </section>
    </main>
  )
}
