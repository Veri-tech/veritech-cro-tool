import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

function createSupabaseAdminClient() {
  // Nitro on Vercel exposes env vars via process.env at runtime
  // We hardcode the URL since it's not secret, and read the service role key from env
  const SUPABASE_URL = 'https://afyrxulrwartxwpxfylj.supabase.co';
  
  const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env['SUPABASE_SERVICE_ROLE_KEY'];

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      `[Supabase Admin] Missing SUPABASE_SERVICE_ROLE_KEY environment variable.`
    );
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
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
