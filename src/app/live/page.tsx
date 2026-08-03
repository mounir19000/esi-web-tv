import Link from "next/link";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LiveChannelsPage() {
  const activeStreams = await prisma.liveStream.findMany({
    where: { isLive: true },
    include: { host: true }
  });

  return (
    <div className="container mt-8 mb-20 animate-fade-up">
      <div className="flex items-center justify-between mb-12 pb-4 border-b border-border-color">
        <div>
          <h1 className="h1 mb-2">Live Channels</h1>
          <p className="text-text-secondary">Join active broadcasts in real-time.</p>
        </div>
        <Link href="/live/new" className="btn-primary">Go Live</Link>
      </div>

      {activeStreams.length === 0 ? (
        <div className="card p-12 text-center bg-bg-secondary flex flex-col items-center">
          <div className="mb-4 text-6xl opacity-50">📡</div>
          <h2 className="h3 mb-2">No active broadcasts</h2>
          <p className="text-text-secondary">There are no live channels at the moment. Check back later!</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {activeStreams.map((stream) => (
            <Link key={stream.id} href={`/live/${stream.streamKey}`} className="card group no-underline">
              <div className="bg-black aspect-video relative flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition duration-300 z-10"></div>
                
                <span className="absolute top-3 left-3 bg-error-color text-white text-xs font-bold px-3 py-1 rounded-sm uppercase tracking-wider shadow-lg z-20 animate-pulse">
                  Live
                </span>
                <span className="text-gray-500 font-medium z-0 group-hover:scale-110 transition duration-500">Preview not available</span>

                {/* Play Button Overlay */}
                <div className="absolute inset-0 flex items-center justify-center z-20 opacity-0 group-hover:opacity-100 transition duration-300 transform translate-y-4 group-hover:translate-y-0">
                  <div className="w-16 h-16 bg-error-color rounded-full flex items-center justify-center shadow-glow">
                    <div className="w-0 h-0 border-t-8 border-t-transparent border-l-[14px] border-l-white border-b-8 border-b-transparent ml-1"></div>
                  </div>
                </div>
              </div>
              <div className="p-5 bg-bg-secondary">
                <h3 className="h3 text-base leading-tight mb-2 group-hover:text-brand-primary transition">{stream.title}</h3>
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <span className="w-6 h-6 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-xs">{stream.host.name?.[0] || 'U'}</span>
                  <span>{stream.host.name}</span>
                  {stream.description && (
                    <>
                      <span className="mx-1">•</span>
                      <span className="line-clamp-1">{stream.description}</span>
                    </>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
