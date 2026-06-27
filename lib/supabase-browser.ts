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
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      flowType: 'implicit',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
)
