import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { transcodeAndUpload } from "@/lib/ffmpeg";

export default async function UploadVideoPage() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "TEACHER" && session.user.role !== "ADMIN")) {
    redirect("/");
  }

  const modules = await prisma.module.findMany({
    orderBy: { yearGroup: 'asc' }
  });

  async function uploadVideo(formData: FormData) {
    "use server";
    const session = await auth();
    if (!session?.user || (session.user.role !== "TEACHER" && session.user.role !== "ADMIN")) {
      throw new Error("Unauthorized");
    }

    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const type = formData.get("type") as any;
    const moduleId = formData.get("moduleId") as string | null;
    const file = formData.get("file") as File;

    if (!file || file.size === 0) {
      throw new Error("No file uploaded");
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Create a temporary file path
    const tempDir = path.join("/tmp", "esitv-uploads");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFileName = `${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
    const tempPath = path.join(tempDir, tempFileName);

    // Save uploaded file to disk
    fs.writeFileSync(tempPath, buffer);

    // Create the video record in DB first to get an ID
    const video = await prisma.video.create({
      data: {
        title,
        description,
        type: type || "OTHER",
        isPublic: type === "EXPLANATION",
        url: `videos/${tempFileName.replace(".mp4", "")}`, // We'll update this properly if needed, but minio structure handles names
        uploaderId: session.user.id!,
        ...(moduleId ? { moduleId } : {})
      }
    });

    // Fire and forget transcoding
    // In a production app, use BullMQ, Redis, or an AWS Lambda/SQS pipeline.
    // For this prototype, we'll run it asynchronously without awaiting.
    transcodeAndUpload(tempPath, video.id).catch(err => {
      console.error(`Failed to transcode video ${video.id}:`, err);
    });
    
    revalidatePath("/explore");
    redirect("/explore");
  }

  return (
    <div className="container mt-12 mb-20 max-w-2xl mx-auto animate-fade-up">
      <div className="card p-8 shadow-lg">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-brand-primary text-2xl">📤</span>
          </div>
          <h1 className="h2 mb-2">Upload Video</h1>
          <p className="text-text-secondary">Upload recorded lectures or club activities in MP4 format.</p>
        </div>
        
        <form action={uploadVideo} className="flex flex-col gap-6">
          <div className="form-group">
            <label htmlFor="title" className="form-label">Video Title</label>
            <input 
              type="text" 
              id="title" 
              name="title" 
              required
              className="form-input"
              placeholder="e.g. Next.js App Router Masterclass"
            />
          </div>

          <div className="form-group">
            <label htmlFor="description" className="form-label">Description</label>
            <textarea 
              id="description" 
              name="description" 
              rows={4}
              className="form-input"
              placeholder="What is this video about?"
            />
          </div>

          <div className="form-group">
            <label htmlFor="type" className="form-label">Video Type</label>
            <select id="type" name="type" className="form-input" required>
              <option value="TEACHING">Teaching (Lectures, Tutorials)</option>
              <option value="CLUB">Club Activity</option>
              <option value="EXPLANATION">Explanation (Public)</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="moduleId" className="form-label">Associated Module (Optional)</label>
            <select id="moduleId" name="moduleId" className="form-input">
              <option value="">None / General</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  [{m.yearGroup}] {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="file" className="form-label">Video File (.mp4)</label>
            <div className="relative">
              <input 
                type="file" 
                id="file" 
                name="file" 
                accept="video/mp4"
                required
                className="form-input pt-[1.2rem]"
              />
            </div>
          </div>

          <button type="submit" className="btn-primary mt-2 py-4 text-base w-full shadow-glow">
            Upload & Process
          </button>
        </form>
      </div>
    </div>
  );
}
