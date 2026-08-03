import { auth } from "@/auth";
import Link from "next/link";
import Image from "next/image";

export default async function Header() {
  const session = await auth();
  const canCreate = session?.user?.role === "TEACHER" || session?.user?.role === "ADMIN";

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand-link" aria-label="ESI Web TV home">
          <Image src="/logo_esi_seule.png" alt="" width={42} height={42} className="brand-mark" priority />
          <span className="brand-text">
            <span className="brand-name">ESI Web TV</span>
            <span className="brand-subtitle">Courses, clubs, live</span>
          </span>
        </Link>

        <nav className="primary-nav" aria-label="Main navigation">
          <Link href="/explore" className="nav-link">Explore</Link>
          <Link href="/live" className="nav-link">Live</Link>
          {session?.user ? (
            <>
              <Link href="/dashboard" className="nav-link">Dashboard</Link>
              {canCreate && <Link href="/dashboard/upload" className="nav-link">Upload</Link>}
              {canCreate && <Link href="/live/new" className="nav-link">Go Live</Link>}
              <span className="nav-link user-pill" title={session.user.email || session.user.name || "Signed in"}>
                {session.user.name || session.user.email}
              </span>
              <form
                action={async () => {
                  "use server";
                  const { signOut } = await import("@/auth");
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button type="submit" className="nav-button">Sign out</button>
              </form>
            </>
          ) : (
            <Link href="/login" className="button">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
