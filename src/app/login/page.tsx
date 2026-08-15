import type { Metadata } from "next"
import Image from "next/image"
import { redirect } from "next/navigation"
import LoginForm from "@/components/LoginForm"
import { getCurrentUser } from "@/lib/current-user"

export const metadata: Metadata = {
  title: "Sign in | ESI Web TV",
}

export default async function LoginPage() {
  const user = await getCurrentUser()
  if (user) {
    redirect("/dashboard")
  }

  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

  return (
    <div className="page-narrow">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">ESI Web TV</p>
            <h1 className="section-title">Sign in</h1>
            <p className="lead">Access courses, live rooms, uploads, and administration with your ESI account.</p>
          </div>
          <Image src="/logo_esi_seule.png" alt="" width={58} height={58} />
        </div>
        <LoginForm googleEnabled={googleEnabled} />
      </section>
    </div>
  )
}
