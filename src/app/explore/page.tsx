import Link from "next/link";
import Image from "next/image";

export default function ExplorePage() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="glass sticky top-0 z-50">
        <div className="container flex items-center justify-between" style={{ height: "var(--header-height)" }}>
          <div className="flex items-center gap-4">
            <Image src="/logo_esi_seule.png" alt="ESI Logo" width={40} height={40} />
            <Link href="/" className="font-bold h3 text-primary no-underline text-inherit">ESI Web TV</Link>
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/explore" className="font-medium text-brand-primary">Explore</Link>
            <Link href="/live" className="font-medium hover:text-brand-primary transition">Live Channels</Link>
            <Link href="/dashboard" className="font-medium hover:text-brand-primary transition">Dashboard</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 container mt-8 mb-8">
        <h1 className="h1 mb-8">Explore Videos</h1>
        
        {/* Filters */}
        <div className="flex gap-4 mb-8 pb-4 border-b border-border-color overflow-x-auto">
          <button className="btn-primary">All</button>
          <button className="btn-outline">Teaching</button>
          <button className="btn-outline">School Clubs</button>
          <button className="btn-outline">Explanations</button>
        </div>

        {/* Video Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="card p-4">
              <div className="bg-gray-200 aspect-video rounded-md mb-4 relative" style={{ backgroundColor: "#e2e8f0", aspectRatio: "16/9" }}>
                <span className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded-sm">12:30</span>
              </div>
              <h3 className="font-semibold mb-1 line-clamp-2">How to build a Next.js App - Web Dev Club</h3>
              <p className="text-sm text-text-secondary">Web Dev Club • 2 days ago</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
