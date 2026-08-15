import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { v4 as uuidv4 } from "uuid"
import { AudienceType, ProvisioningStatus, RecordingPolicy, StreamStatus } from "@prisma/client"
import prisma from "@/lib/prisma"
import { canPublishToAudience, validateAudienceSelection } from "@/lib/content-access"
import { getCurrentUser, requireEducator } from "@/lib/current-user"
import { appConfig } from "@/lib/env"
import { ensureLiveStreamRoom } from "@/lib/livekit-lifecycle"
import { boundedLongText, boundedText, validationLimits, type FieldErrors } from "@/lib/validation"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Go Live | ESI Web TV",
}

function isAudienceType(value: string): value is AudienceType {
  return Object.values(AudienceType).includes(value as AudienceType)
}

export default async function NewLivePage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login?callbackUrl=/live/new")
  }
  if (
    user.provisioningStatus !== ProvisioningStatus.APPROVED ||
    (user.role !== "TEACHER" && user.role !== "ADMIN")
  ) {
    redirect("/dashboard")
  }

  const assignedModuleIds = user.teacherAssignments.map((assignment) => assignment.moduleId)
  const modules = await prisma.module.findMany({
    where: user.role === "ADMIN" ? {} : { id: { in: assignedModuleIds } },
    orderBy: [{ yearGroup: "asc" }, { name: "asc" }],
  })

  async function createLiveStream(formData: FormData) {
    "use server"

    const user = await requireEducator()

    const errors: FieldErrors = {}
    const title = boundedText("title", formData.get("title"), validationLimits.titleMax, errors, true)
    const description = boundedLongText("description", formData.get("description"), validationLimits.descriptionMax, errors)
    const moduleId = String(formData.get("moduleId") || "")
    const audienceValue = String(formData.get("audience") || "")
    const recordingPolicy = appConfig.livekit.recordingEnabled && formData.get("recordingPolicy") === "auto"
      ? RecordingPolicy.AUTO
      : RecordingPolicy.NONE

    if (Object.keys(errors).length > 0) {
      throw new Error(Object.values(errors)[0])
    }

    if (!isAudienceType(audienceValue)) {
      throw new Error("Select a valid audience")
    }

    const audience = audienceValue

    const selectedModule = moduleId
      ? await prisma.module.findUnique({ where: { id: moduleId }, select: { id: true } })
      : null

    if (moduleId && !selectedModule) {
      throw new Error("Selected module was not found")
    }

    const audienceError = validateAudienceSelection({ audience, moduleId: selectedModule?.id ?? null })
    if (audienceError) {
      throw new Error(audienceError)
    }

    if (!canPublishToAudience(user, { audience, moduleId: selectedModule?.id ?? null })) {
      throw new Error("You cannot publish to that audience")
    }

    const stream = await prisma.liveStream.create({
      data: {
        title,
        description,
        streamKey: uuidv4(),
        hostId: user.id,
        status: StreamStatus.STARTING,
        recordingPolicy,
        isLive: false,
        audience,
        isPublic: audience === AudienceType.PUBLIC,
        ...(selectedModule ? { moduleId: selectedModule.id } : {}),
      },
      include: { module: true },
    })

    await ensureLiveStreamRoom(stream)

    revalidatePath("/")
    revalidatePath("/live")
    revalidatePath("/dashboard")
    redirect(`/live/${stream.streamKey}`)
  }

  return (
    <main className="page-narrow">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Live broadcast</p>
            <h1 className="section-title">Start a Live Broadcast</h1>
            <p className="lead">Create a room for a class, module session, club event, or public announcement.</p>
          </div>
        </div>

        <form action={createLiveStream} className="form-stack">
          <div className="field">
            <label htmlFor="title">Broadcast title</label>
            <input
              type="text"
              id="title"
              name="title"
              required
              className="form-input"
              placeholder="Algorithms revision session"
            />
          </div>

          <div className="field">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              rows={4}
              className="form-textarea"
              placeholder="Agenda, speaker, or audience"
            />
          </div>

          <div className="grid grid-2">
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

            <div className="field">
              <label htmlFor="audience">Audience</label>
              <select id="audience" name="audience" className="form-select" defaultValue="ESI">
                <option value="ESI">Signed-in ESI users</option>
                <option value="MODULE">Selected module</option>
                <option value="PUBLIC">Public visitors</option>
              </select>
            </div>
          </div>

          {appConfig.livekit.recordingEnabled && (
            <label className="checkbox-row">
              <input type="checkbox" name="recordingPolicy" value="auto" />
              <span>Record this broadcast</span>
            </label>
          )}

          <button type="submit" className="button">Go live now</button>
        </form>
      </section>
    </main>
  )
}
