import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Server-only Supabase admin client.
// This file is never shipped to the browser.
const SUPABASE_URL = 'https://afyrxulrwartxwpxfylj.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmeXJ4dWxyd2FydHh3cHhmeWxqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTI3MjUzNywiZXhwIjoyMDk2ODQ4NTM3fQ.SqASgkbVCvdNeRpopxJeosJoO6Fb0jk5PZIcHSWyQLU';

function createSupabaseAdminClient() {
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
