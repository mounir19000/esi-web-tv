"use client"

import { FormEvent, useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"

type LoginFormProps = {
  googleEnabled: boolean
}

export default function LoginForm({ googleEnabled }: LoginFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard"
  const [error, setError] = useState("")
  const [isPending, setIsPending] = useState(false)
  const statusMessage = isPending ? "Signing in." : ""

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setIsPending(true)

    const formData = new FormData(event.currentTarget)
    const result = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
      callbackUrl,
    })

    setIsPending(false)

    if (!result?.ok) {
      setError("Use a valid @esi.dz account and password.")
      return
    }

    router.push(result.url || callbackUrl)
    router.refresh()
  }

  return (
    <div className="login-card">
      {error && <div className="alert" role="alert">{error}</div>}
      {statusMessage && (
        <p className="sr-only" role="status" aria-live="polite">
          {statusMessage}
        </p>
      )}

      <form onSubmit={handleSubmit} className="form-stack" aria-busy={isPending}>
        <div className="field">
          <label htmlFor="email">ESI email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="name@esi.dz"
            required
            className="form-input"
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="form-input"
          />
        </div>

        <button type="submit" className="button" disabled={isPending}>
          {isPending ? "Signing in..." : "Sign in"}
        </button>
      </form>

      {googleEnabled && (
        <button type="button" className="button-secondary" onClick={() => signIn("google", { callbackUrl })}>
          Continue with ESI Google
        </button>
      )}
    </div>
  )
}
