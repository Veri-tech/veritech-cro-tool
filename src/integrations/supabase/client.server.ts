import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

function createSupabaseAdminClient() {
  const SUPABASE_URL = 'https://afyrxulrwartxwpxfylj.supabase.co';
  
  // Try all possible sources - edge runtime, node runtime, build-time inject
  const SUPABASE_SERVICE_ROLE_KEY = 
    // Build-time injected via Vite define (works in edge runtime too)
    (typeof __SUPABASE_SERVICE_ROLE_KEY__ !== 'undefined' && __SUPABASE_SERVICE_ROLE_KEY__) ||
    // Standard Node.js process.env (works in nodejs runtime)
    (typeof process !== 'undefined' && process.env?.SUPABASE_SERVICE_ROLE_KEY) ||
    // Vercel edge runtime env
    (typeof globalThis !== 'undefined' && (globalThis as any).env?.SUPABASE_SERVICE_ROLE_KEY) ||
    null;

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('[Supabase Admin] SUPABASE_SERVICE_ROLE_KEY not available.');
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    }
  });
}

let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;

export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});
