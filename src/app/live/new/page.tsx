import { auth } from "@/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";

export default async function NewLivePage() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "TEACHER" && session.user.role !== "ADMIN")) {
    redirect("/");
  }

  async function createLiveStream(formData: FormData) {
    "use server";
    const session = await auth();
    if (!session?.user || (session.user.role !== "TEACHER" && session.user.role !== "ADMIN")) {
      throw new Error("Unauthorized");
    }

    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    
    const stream = await prisma.liveStream.create({
      data: {
        title,
        description,
        streamKey: uuidv4(),
        hostId: session.user.id,
        isLive: true,
        startedAt: new Date(),
      }
    });

    redirect(`/live/${stream.streamKey}`);
  }

  return (
    <div className="container mt-12 mb-20 max-w-2xl mx-auto animate-fade-up">
      <div className="card p-8 shadow-lg">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-error-color/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-error-color text-2xl">🔴</span>
          </div>
          <h1 className="h2 mb-2">Start a Live Broadcast</h1>
          <p className="text-text-secondary">Configure your stream details to go live instantly.</p>
        </div>
        
        <form action={createLiveStream} className="flex flex-col gap-6">
          <div className="form-group">
            <label htmlFor="title" className="form-label">Broadcast Title</label>
            <input 
              type="text" 
              id="title" 
              name="title" 
              required
              className="form-input"
              placeholder="e.g. Introduction to Next.js"
            />
          </div>

          <div className="form-group">
            <label htmlFor="description" className="form-label">Description (Optional)</label>
            <textarea 
              id="description" 
              name="description" 
              rows={4}
              className="form-input"
              placeholder="What will you be teaching?"
            />
          </div>

          <button type="submit" className="btn-primary mt-2 py-4 text-base w-full shadow-glow">
            Go Live Now
          </button>
        </form>
      </div>
    </div>
  );
}
