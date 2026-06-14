import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// These are the PUBLIC Supabase credentials - safe to include in client code.
// The anon/publishable key is designed to be public and is protected by RLS policies.
// NEVER put the service_role key here.
const SUPABASE_URL = 'https://afyrxulrwartxwpxfylj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_RGDsMtvVbpbp1uPAlKNHlw_s2uXdY0q';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  }
});
