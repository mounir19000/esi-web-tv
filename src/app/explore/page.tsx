import Link from "next/link";
import Image from "next/image";
import prisma from "@/lib/prisma";

export default async function ExplorePage() {
  const videos = await prisma.video.findMany({
    orderBy: { createdAt: 'desc' },
    include: { uploader: true }
  });

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 container mt-8 mb-20 animate-fade-up">
        <div className="mb-12">
          <h1 className="h1 mb-2">Explore Videos</h1>
          <p className="text-text-secondary">Discover recorded lectures, club activities, and more.</p>
        </div>
        
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {videos.length === 0 && (
            <div className="col-span-full text-center py-12 text-text-secondary bg-surface rounded-xl border border-border">
              No videos uploaded yet.
            </div>
          )}
          {videos.map((video) => (
            <Link href={`/video/${video.id}`} key={video.id} className="card group block">
              <div className="bg-black aspect-video relative overflow-hidden flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition duration-300 z-10"></div>
                <div className="absolute top-3 left-3 bg-brand-primary text-white text-xs font-bold px-3 py-1 rounded-sm uppercase tracking-wider shadow-lg z-20">
                  {video.type}
                </div>
                <span className="text-gray-500 font-medium z-0 group-hover:scale-110 transition duration-500">Video Preview</span>
                
                {/* Play Button Overlay */}
                <div className="absolute inset-0 flex items-center justify-center z-20 opacity-0 group-hover:opacity-100 transition duration-300 transform translate-y-4 group-hover:translate-y-0">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-glow">
                    <div className="w-0 h-0 border-t-8 border-t-transparent border-l-[14px] border-l-brand-primary border-b-8 border-b-transparent ml-1"></div>
                  </div>
                </div>
              </div>
              <div className="p-5">
                <h3 className="h3 mb-2 text-base leading-tight group-hover:text-brand-primary transition line-clamp-2">{video.title}</h3>
                <div className="flex items-center justify-between text-sm text-text-secondary">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-xs">
                      {video.uploader.name?.[0]?.toUpperCase() || 'U'}
                    </span>
                    <span>{video.uploader.name}</span>
                  </div>
                  <span>{video.createdAt.toLocaleDateString()}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
