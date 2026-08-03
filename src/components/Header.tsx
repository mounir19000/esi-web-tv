import { auth } from "@/auth";
import Link from "next/link";
import Image from "next/image";

export default async function Header() {
  const session = await auth();

  return (
    <header className="glass sticky top-0 z-50">
      <div className="container flex items-center justify-between" style={{ height: "var(--header-height)" }}>
        <div className="flex items-center gap-4">
          <Image src="/logo_esi_seule.png" alt="ESI Logo" width={40} height={40} />
          <Link href="/" className="font-bold h3 text-primary no-underline text-inherit">ESI Web TV</Link>
        </div>
        <nav className="flex items-center gap-6">
          <Link href="/explore" className="font-medium hover:text-brand-primary transition">Explore</Link>
          <Link href="/live" className="font-medium hover:text-brand-primary transition">Live Channels</Link>
          {session?.user ? (
            <>
              <Link href="/dashboard" className="font-medium hover:text-brand-primary transition">Dashboard</Link>
              <form
                action={async () => {
                  "use server";
                  const { signOut } = await import("@/auth");
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button type="submit" className="btn-outline text-xs py-1 px-2">Sign Out ({session.user.name})</button>
              </form>
            </>
          ) : (
            <Link href="/api/auth/signin" className="btn-primary text-xs py-1 px-2">Sign In</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
