"use client"

import Image from "next/image"
import Link from "next/link"
import { signOut } from "next-auth/react"
import { useEffect, useRef, useState } from "react"

export type HeaderUser = {
  name: string | null
  email: string | null
}

const navId = "primary-navigation"

export default function HeaderClient({
  user,
  canCreate,
}: {
  user: HeaderUser | null
  canCreate: boolean
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!isMenuOpen) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false)
        buttonRef.current?.focus()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isMenuOpen])

  useEffect(() => {
    if (!isMenuOpen || !window.matchMedia("(max-width: 720px)").matches) {
      return
    }

    const firstItem = navRef.current?.querySelector<HTMLElement>("[data-nav-item]")
    firstItem?.focus()
  }, [isMenuOpen])

  function closeMenu() {
    setIsMenuOpen(false)
  }

  function handleSignOut() {
    closeMenu()
    void signOut({ callbackUrl: "/" })
  }

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand-link" aria-label="ESI Web TV home" onClick={closeMenu}>
          <Image src="/logo_esi_seule.png" alt="" width={42} height={42} className="brand-mark" priority />
          <span className="brand-text">
            <span className="brand-name">ESI Web TV</span>
            <span className="brand-subtitle">Courses, clubs, live</span>
          </span>
        </Link>

        <button
          ref={buttonRef}
          type="button"
          className="nav-toggle"
          aria-controls={navId}
          aria-expanded={isMenuOpen}
          aria-label={isMenuOpen ? "Close main navigation" : "Open main navigation"}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <span className="nav-toggle-bar" />
          <span className="nav-toggle-bar" />
          <span className="nav-toggle-bar" />
        </button>

        <nav
          ref={navRef}
          id={navId}
          className={isMenuOpen ? "primary-nav is-open" : "primary-nav"}
          aria-label="Main navigation"
        >
          <Link href="/explore" className="nav-link" onClick={closeMenu} data-nav-item="true">
            Explore
          </Link>
          <Link href="/live" className="nav-link" onClick={closeMenu} data-nav-item="true">
            Live
          </Link>
          {user ? (
            <>
              <Link href="/dashboard" className="nav-link" onClick={closeMenu} data-nav-item="true">
                Dashboard
              </Link>
              {canCreate && (
                <Link href="/dashboard/upload" className="nav-link" onClick={closeMenu} data-nav-item="true">
                  Upload
                </Link>
              )}
              {canCreate && (
                <Link href="/live/new" className="nav-link" onClick={closeMenu} data-nav-item="true">
                  Go Live
                </Link>
              )}
              <span className="nav-link user-pill" title={user.email || user.name || "Signed in"}>
                {user.name || user.email}
              </span>
              <button
                type="button"
                className="nav-button"
                onClick={handleSignOut}
                data-nav-item="true"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" className="button nav-cta" onClick={closeMenu} data-nav-item="true">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
