// Server-side only - uses service role key that bypasses RLS.
// NEVER import this at the top level of route files or client components.
// Always use dynamic import inside server functions:
//   const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

function createSupabaseAdminClient() {
  // Only read from process.env - never from import.meta.env
  // This ensures this key is never bundled into client-side code
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      `[Supabase Admin] Missing server environment variables. ` +
      `Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your deployment environment.`
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
