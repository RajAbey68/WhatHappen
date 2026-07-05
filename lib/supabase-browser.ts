import { createClient } from '@supabase/supabase-js'

/**
 * Browser-only Supabase client used for Google OAuth + the user session.
 *
 * Implicit flow + detectSessionInUrl means the OAuth redirect is handled
 * entirely client-side (the access token arrives in the URL hash and is picked
 * up automatically), so no server `/auth/callback` route is required.
 *
 * This is the ANON key — safe to ship to the browser. The access token it
 * obtains is what authenticates API calls (see auth-provider.tsx) and what RLS
 * uses server-side.
 */
// Fallback placeholders keep createClient from throwing during the build's
// static prerender when the env vars aren't present (e.g. the Preview
// environment). At runtime in the browser the real NEXT_PUBLIC_* values are
// inlined. Mirrors the pattern in lib/supabase.ts.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'implicit',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
