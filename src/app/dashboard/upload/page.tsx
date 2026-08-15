import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import prisma from "@/lib/prisma"
import { UploadVideoForm } from "@/components/UploadVideoForm"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Upload Video | ESI Web TV",
}

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

        <UploadVideoForm modules={modules} />
      </section>
    </main>
  )
}
