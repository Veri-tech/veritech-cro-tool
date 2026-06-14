import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

function createSupabaseClient() {
  // Client-side: only read VITE_ prefixed vars (Vite injects these at build time)
  // Server-side: read from process.env directly
  const isServer = typeof window === 'undefined';

  const SUPABASE_URL = isServer
    ? process.env.SUPABASE_URL
    : (import.meta.env.VITE_SUPABASE_URL as string | undefined);

  const SUPABASE_PUBLISHABLE_KEY = isServer
    ? process.env.SUPABASE_PUBLISHABLE_KEY
    : (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined);

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ['SUPABASE_URL'] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ['SUPABASE_PUBLISHABLE_KEY'] : []),
    ];
    throw new Error(`Missing Supabase variable(s): ${missing.join(', ')}.`);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    }
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
