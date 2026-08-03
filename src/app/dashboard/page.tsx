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
              {role === "ADMIN" && (
                <Link href="/dashboard/users" className="btn-outline text-brand-primary">Manage Users</Link>
              )}
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
