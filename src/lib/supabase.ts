import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Lazy singletons — created on first use, not at module load time
// (avoids "supabaseUrl is required" errors during Next.js build-time data collection)

let _admin: SupabaseClient | null = null
let _client: SupabaseClient | null = null

function makeAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _admin
}

function makeClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _client
}

export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop: string | symbol) {
    return (makeAdmin() as any)[prop]
  },
  apply(_, thisArg, args) {
    return Reflect.apply(makeAdmin() as any, thisArg, args)
  },
})

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop: string | symbol) {
    return (makeClient() as any)[prop]
  },
})
