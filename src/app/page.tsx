import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="glass sticky top-0 z-50">
        <div className="container flex items-center justify-between" style={{ height: "var(--header-height)" }}>
          <div className="flex items-center gap-4">
            {/* We will replace this with the actual logo provided by the user later */}
            <div className="font-bold h3 text-primary">ESI Web TV</div>
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/explore" className="font-medium hover:text-brand-primary transition">Explore</Link>
            <Link href="/live" className="font-medium hover:text-brand-primary transition">Live Channels</Link>
            <Link href="/dashboard" className="btn-primary">Sign In</Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mt-8 mb-8">
        <section className="mb-12 text-center py-12">
          <h1 className="h1 mb-4">Welcome to ESI Web TV</h1>
          <p className="p-lead mb-8 max-w-2xl mx-auto">
            The official platform for École nationale Supérieure d'Informatique. 
            Watch live streams, educational modules, and school events all in one place.
          </p>
          <div className="flex justify-center gap-4">
            <Link href="/explore" className="btn-primary">Browse Videos</Link>
            <Link href="/live" className="btn-outline">View Live Streams</Link>
          </div>
        </section>

        {/* Featured Section */}
        <section>
          <div className="flex justify-between items-center mb-6">
            <h2 className="h2">Featured Live Channels</h2>
            <Link href="/live" className="text-brand-primary font-medium hover:underline">View all</Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Dummy Cards for Design Setup */}
            {[1, 2, 3].map((i) => (
              <div key={i} className="card p-4">
                <div className="bg-gray-200 aspect-video rounded-md mb-4 flex items-center justify-center relative overflow-hidden" style={{ aspectRatio: "16/9", backgroundColor: "#e2e8f0" }}>
                  <div className="absolute top-2 left-2 bg-error-color text-white text-xs font-bold px-2 py-1 rounded-sm" style={{ backgroundColor: "var(--error-color)"}}>LIVE</div>
                  <span className="text-gray-400">Video Placeholder</span>
                </div>
                <h3 className="h3 mb-2 text-lg">Introduction to Web Development - 1CP</h3>
                <p className="text-sm text-text-secondary mb-4">Dr. Ahmed • 120 watching</p>
                <Link href={`/live/${i}`} className="btn-outline w-full text-center">Join Stream</Link>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border-color py-8 mt-auto bg-bg-secondary">
        <div className="container text-center text-text-secondary text-sm">
          &copy; {new Date().getFullYear()} École nationale Supérieure d'Informatique. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
