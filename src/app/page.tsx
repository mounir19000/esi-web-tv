import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1">
        {/* Stunning Hero Section */}
        <section className="relative overflow-hidden py-20 mb-12">
          {/* Background decorative blobs */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-brand-primary rounded-full mix-blend-multiply filter blur-[100px] opacity-10 animate-pulse-soft pointer-events-none"></div>
          <div className="absolute top-1/2 left-[60%] transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-400 rounded-full mix-blend-multiply filter blur-[100px] opacity-10 animate-pulse-soft pointer-events-none" style={{ animationDelay: '1s' }}></div>

          <div className="container relative z-10 text-center animate-fade-up">
            <div className="inline-block px-4 py-1.5 mb-6 rounded-full glass text-sm font-semibold text-brand-primary tracking-wider uppercase shadow-sm">
              ✨ Welcome to the future of learning
            </div>
            <h1 className="h1 mb-6 max-w-4xl mx-auto">
              The Official Web TV for <br/>
              <span className="text-gradient">École nationale Supérieure d'Informatique</span>
            </h1>
            <p className="p-lead mb-10 max-w-2xl mx-auto">
              Experience education like never before. Watch high-quality live streams, explore rich educational modules, and connect with ESI clubs all in one place.
            </p>
            <div className="flex justify-center gap-4 flex-wrap">
              <Link href="/explore" className="btn-primary py-3 px-8 text-lg">Start Exploring</Link>
              <Link href="/live" className="btn-outline py-3 px-8 text-lg">View Live Channels</Link>
            </div>
          </div>
        </section>

        {/* Featured Section */}
        <section className="container mb-20 animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <div className="flex justify-between items-end mb-8">
            <div>
              <h2 className="h2 mb-2">Featured Live Channels</h2>
              <p className="text-text-secondary">Join ongoing classes and events happening right now.</p>
            </div>
            <Link href="/live" className="text-brand-primary font-medium hover:underline flex items-center gap-1">
              View all <span>→</span>
            </Link>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Dummy Cards for Design Setup */}
            {[1, 2, 3].map((i) => (
              <div key={i} className="card group">
                <div className="bg-black aspect-video relative overflow-hidden flex items-center justify-center">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition duration-300 z-10"></div>
                  <div className="absolute top-3 left-3 bg-error-color text-white text-xs font-bold px-3 py-1 rounded-sm uppercase tracking-wider animate-pulse shadow-lg z-20">
                    LIVE
                  </div>
                  <span className="text-gray-500 font-medium z-0 group-hover:scale-110 transition duration-500">Video Preview</span>
                  
                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center z-20 opacity-0 group-hover:opacity-100 transition duration-300 transform translate-y-4 group-hover:translate-y-0">
                    <div className="w-16 h-16 bg-brand-primary rounded-full flex items-center justify-center shadow-glow">
                      <div className="w-0 h-0 border-t-8 border-t-transparent border-l-[14px] border-l-white border-b-8 border-b-transparent ml-1"></div>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="h3 mb-2 text-lg leading-tight group-hover:text-brand-primary transition">Introduction to Web Development - 1CP</h3>
                  <div className="flex items-center gap-2 text-sm text-text-secondary mb-6">
                    <span className="w-6 h-6 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-xs">Dr</span>
                    <span>Dr. Ahmed</span>
                    <span className="mx-1">•</span>
                    <span className="flex items-center gap-1">👁️ 120 watching</span>
                  </div>
                  <Link href={`/live/${i}`} className="btn-outline w-full text-center py-2">Join Stream</Link>
                </div>
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
