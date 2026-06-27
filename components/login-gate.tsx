'use client'

import type { ReactNode } from 'react'
import { useAuth } from '@/components/auth-provider'

/**
 * Gates the whole app behind Google sign-in. While the session is loading we
 * show a spinner; with no session we show the sign-in screen; once signed in we
 * render the app. This is the client-side half of authentication — the server
 * middleware independently rejects any /api call without a valid token.
 */
export function LoginGate({ children }: { children: ReactNode }) {
  const { session, loading, signInWithGoogle } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl border bg-white/80 p-8 text-center shadow-sm backdrop-blur">
          <h1 className="text-xl font-semibold text-slate-800">WhatHappen</h1>
          <p className="mt-2 text-sm text-slate-500">
            Sign in to analyze your chats. Your account keeps your data private to you.
          </p>
          <button
            type="button"
            onClick={() => {
              void signInWithGoogle()
            }}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <GoogleIcon /> Continue with Google
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}
