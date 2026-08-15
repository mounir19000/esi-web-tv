"use client"

import { useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import {
  allowedUploadVideoTypes,
  uploadContentType,
  uploadMaxBytes,
  type MultipartUploadPart,
} from "@/lib/upload-policy"

type ModuleOption = {
  id: string
  name: string
  yearGroup: string
}

type PresignedUploadPart = MultipartUploadPart & {
  url: string
}

type CreateUploadResponse = {
  sessionId: string
  parts: PresignedUploadPart[]
}

type CompleteUploadResponse = {
  videoUrl: string
}

type UploadPhase = "idle" | "preparing" | "uploading" | "processing"

const uploadConcurrency = 3

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  return `${Math.ceil(bytes / (1024 * 1024))} MB`
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as { error?: string; fieldErrors?: Record<string, string> } | T | null
  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "Request failed"
    const error = new Error(errorMessage) as Error & { fieldErrors?: Record<string, string> }
    if (payload && typeof payload === "object" && "fieldErrors" in payload) {
      error.fieldErrors = payload.fieldErrors
    }
    throw error
  }

  return payload as T
}

export function UploadVideoForm({ modules }: { modules: ModuleOption[] }) {
  const router = useRouter()
  const [phase, setPhase] = useState<UploadPhase>("idle")
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState(0)
  const activeSessionIdRef = useRef<string | null>(null)
  const partProgressRef = useRef(new Map<number, number>())
  const activeRequestsRef = useRef(new Set<XMLHttpRequest>())

  const isBusy = phase !== "idle"

  function updatePartProgress(partNumber: number, loadedBytes: number, fileSize: number) {
    partProgressRef.current.set(partNumber, loadedBytes)
    const uploadedBytes = [...partProgressRef.current.values()].reduce((total, loaded) => total + loaded, 0)
    setProgress(Math.min(100, Math.round((uploadedBytes / fileSize) * 100)))
  }

  async function createUpload(form: HTMLFormElement, file: File) {
    const formData = new FormData(form)
    const response = await fetch("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: String(formData.get("title") || ""),
        description: String(formData.get("description") || ""),
        type: String(formData.get("type") || "OTHER"),
        audience: String(formData.get("audience") || "ESI"),
        moduleId: String(formData.get("moduleId") || ""),
        file: {
          name: file.name,
          size: file.size,
          type: file.type,
        },
      }),
    })

    return parseApiResponse<CreateUploadResponse>(response)
  }

  async function refreshPartUrl(sessionId: string, partNumber: number) {
    const response = await fetch(`/api/uploads/${encodeURIComponent(sessionId)}/parts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partNumbers: [partNumber] }),
    })
    const payload = await parseApiResponse<{ parts: PresignedUploadPart[] }>(response)
    const refreshedPart = payload.parts[0]
    if (!refreshedPart) {
      throw new Error("Could not refresh upload URL")
    }

    return refreshedPart
  }

  function uploadPart(part: PresignedUploadPart, file: File) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      activeRequestsRef.current.add(xhr)
      xhr.open("PUT", part.url)
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          updatePartProgress(part.partNumber, event.loaded, file.size)
        }
      }
      xhr.onload = () => {
        activeRequestsRef.current.delete(xhr)
        if (xhr.status >= 200 && xhr.status < 300) {
          updatePartProgress(part.partNumber, part.size, file.size)
          resolve()
        } else {
          reject(new Error(`Part ${part.partNumber} failed with status ${xhr.status}`))
        }
      }
      xhr.onerror = () => {
        activeRequestsRef.current.delete(xhr)
        reject(new Error(`Part ${part.partNumber} could not be uploaded`))
      }
      xhr.onabort = () => {
        activeRequestsRef.current.delete(xhr)
        reject(new Error("Upload aborted"))
      }
      xhr.send(file.slice(part.startByte, part.endByte))
    })
  }

  async function uploadPartWithRetry(sessionId: string, initialPart: PresignedUploadPart, file: File) {
    let part = initialPart
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await uploadPart(part, file)
        return
      } catch (partError) {
        updatePartProgress(part.partNumber, 0, file.size)
        if (attempt === 2) {
          throw partError
        }
        part = await refreshPartUrl(sessionId, part.partNumber)
      }
    }
  }

  async function uploadParts(sessionId: string, parts: PresignedUploadPart[], file: File) {
    let nextPartIndex = 0
    const workerCount = Math.min(uploadConcurrency, parts.length)

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextPartIndex < parts.length) {
          const part = parts[nextPartIndex]
          nextPartIndex += 1
          await uploadPartWithRetry(sessionId, part, file)
        }
      }),
    )
  }

  async function completeUpload(sessionId: string) {
    const response = await fetch(`/api/uploads/${encodeURIComponent(sessionId)}/complete`, {
      method: "POST",
    })

    return parseApiResponse<CompleteUploadResponse>(response)
  }

  async function abortActiveUpload() {
    for (const request of activeRequestsRef.current) {
      request.abort()
    }

    const sessionId = activeSessionIdRef.current
    if (sessionId) {
      await fetch(`/api/uploads/${encodeURIComponent(sessionId)}`, { method: "DELETE" }).catch(() => null)
    }

    activeSessionIdRef.current = null
    partProgressRef.current.clear()
    setProgress(0)
    setPhase("idle")
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    setProgress(0)
    partProgressRef.current.clear()

    const form = event.currentTarget
    const fileInput = form.elements.namedItem("file") as HTMLInputElement | null
    const file = fileInput?.files?.[0]

    if (!file) {
      setError("Upload a valid MP4 file")
      return
    }

    if (file.size > uploadMaxBytes) {
      setError(`Video file is too large. Maximum size is ${formatBytes(uploadMaxBytes)}.`)
      return
    }

    if (file.type !== uploadContentType) {
      setError("Only MP4 files are supported")
      return
    }

    try {
      setPhase("preparing")
      const upload = await createUpload(form, file)
      activeSessionIdRef.current = upload.sessionId

      setPhase("uploading")
      await uploadParts(upload.sessionId, upload.parts, file)

      setPhase("processing")
      const completedUpload = await completeUpload(upload.sessionId)
      activeSessionIdRef.current = null
      router.push(completedUpload.videoUrl)
      router.refresh()
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed")
      if (uploadError instanceof Error && "fieldErrors" in uploadError) {
        setFieldErrors((uploadError as Error & { fieldErrors?: Record<string, string> }).fieldErrors ?? {})
      }
      setPhase("idle")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form-stack">
      {error && (
        <div className="alert" role="alert">
          <p>{error}</p>
          {Object.keys(fieldErrors).length > 0 && (
            <ul>
              {Object.entries(fieldErrors).map(([field, message]) => (
                <li key={field}>{message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="field">
        <label htmlFor="title">Video title</label>
        <input
          type="text"
          id="title"
          name="title"
          required
          className="form-input"
          placeholder="Introduction to Web Development"
          disabled={isBusy}
        />
      </div>

      <div className="field">
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          name="description"
          rows={4}
          className="form-textarea"
          placeholder="Topic, session, speaker, or notes"
          disabled={isBusy}
        />
      </div>

      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="type">Video type</label>
          <select id="type" name="type" className="form-select" required defaultValue="TEACHING" disabled={isBusy}>
            {allowedUploadVideoTypes.map((type) => (
              <option key={type} value={type}>
                {type === "TEACHING" ? "Teaching" : type.charAt(0) + type.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="audience">Audience</label>
          <select id="audience" name="audience" className="form-select" required defaultValue="ESI" disabled={isBusy}>
            <option value="ESI">Signed-in ESI users</option>
            <option value="MODULE">Selected module</option>
            <option value="PUBLIC">Public visitors</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="moduleId">Module</label>
        <select id="moduleId" name="moduleId" className="form-select" defaultValue="" disabled={isBusy}>
          <option value="">General</option>
          {modules.map((module) => (
            <option key={module.id} value={module.id}>
              {module.yearGroup} · {module.name}
            </option>
          ))}
        </select>
        <p className="field-hint">Required when the audience is the selected module.</p>
      </div>

      <div className="field">
        <label htmlFor="file">MP4 file</label>
        <input
          type="file"
          id="file"
          name="file"
          accept={uploadContentType}
          required
          className="form-input"
          disabled={isBusy}
        />
        <p className="field-hint">Processing continues after the direct upload completes.</p>
      </div>

      {isBusy && (
        <div className="upload-progress" aria-live="polite">
          <div className="upload-progress-row">
            <span>{phase === "processing" ? "Finalizing" : "Uploading"}</span>
            <span>{progress}%</span>
          </div>
          <div className="upload-progress-track">
            <div className="upload-progress-bar" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <div className="actions">
        <button type="submit" className="button" disabled={isBusy}>
          {phase === "idle" ? "Upload and process" : "Uploading..."}
        </button>
        {isBusy && (
          <button type="button" className="button-secondary" onClick={abortActiveUpload}>
            Abort
          </button>
        )}
      </div>
    </form>
  )
}
