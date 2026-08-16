import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { ProvisioningStatus } from "@prisma/client"
import prisma from "@/lib/prisma"
import { UploadVideoForm } from "@/components/UploadVideoForm"
import { getCurrentUser } from "@/lib/current-user"
import { moduleOptionSelect, paginationLimits } from "@/lib/listing-queries"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Upload Video | ESI Web TV",
}

export default async function UploadVideoPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login?callbackUrl=/dashboard/upload")
  }
  if (
    user.provisioningStatus !== ProvisioningStatus.APPROVED ||
    (user.role !== "TEACHER" && user.role !== "ADMIN")
  ) {
    redirect("/dashboard")
  }

  const assignedModuleIds = user.teacherAssignments.map((assignment) => assignment.moduleId)
  const moduleLimit = paginationLimits.modules.maxSize
  const moduleRows = await prisma.module.findMany({
    where: user.role === "ADMIN" ? {} : { id: { in: assignedModuleIds } },
    orderBy: [{ yearGroup: "asc" }, { name: "asc" }],
    take: moduleLimit + 1,
    select: moduleOptionSelect,
  })
  const modules = moduleRows.slice(0, moduleLimit)
  const modulesOverflow = moduleRows.length > moduleLimit

  return (
    <main id="main-content" className="page-narrow" tabIndex={-1}>
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Publishing</p>
            <h1 className="section-title">Upload Video</h1>
            <p className="lead">Add an MP4 recording for modules, explanations, or club activity.</p>
          </div>
        </div>

        {modulesOverflow && (
          <p className="field-hint">Showing the first {modules.length} modules.</p>
        )}
        <UploadVideoForm modules={modules} />
      </section>
    </main>
  )
}
