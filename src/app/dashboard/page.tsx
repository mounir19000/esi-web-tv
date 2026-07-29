import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    // We would normally redirect to login, but since we don't have a login page yet, we redirect to home
    redirect("/");
  }

  const { role, name, email, yearGroup } = session.user;

  return (
    <div className="flex flex-col min-h-screen">
      <header className="glass sticky top-0 z-50">
        <div className="container flex items-center justify-between" style={{ height: "var(--header-height)" }}>
          <div className="flex items-center gap-4">
            <Image src="/logo_esi_seule.png" alt="ESI Logo" width={40} height={40} />
            <Link href="/" className="font-bold h3 text-primary no-underline text-inherit">ESI Web TV</Link>
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/explore" className="font-medium hover:text-brand-primary transition">Explore</Link>
            <Link href="/dashboard" className="font-medium text-brand-primary">Dashboard</Link>
            {/* Replace with real signout logic later */}
            <span className="text-sm font-medium">{email}</span>
          </nav>
        </div>
      </header>

      <main className="flex-1 container mt-8 mb-8">
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-border-color">
          <div>
            <h1 className="h1 mb-2">Welcome, {name}</h1>
            <p className="text-text-secondary">
              Role: <span className="font-bold">{role}</span>
              {yearGroup && <span> • Year: {yearGroup}</span>}
            </p>
          </div>
          {(role === "TEACHER" || role === "ADMIN") && (
            <div className="flex gap-4">
              <Link href="/dashboard/upload" className="btn-outline">Upload Video</Link>
              <Link href="/live/new" className="btn-primary">Go Live Now</Link>
            </div>
          )}
        </div>

        <section className="mb-12">
          <h2 className="h2 mb-4">Your Recent Activity</h2>
          <div className="card p-8 text-center text-text-secondary bg-gray-50" style={{ backgroundColor: "#f8fafc" }}>
            No recent activity found.
          </div>
        </section>
      </main>
    </div>
  );
}
