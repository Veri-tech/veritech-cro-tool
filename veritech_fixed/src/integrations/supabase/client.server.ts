import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

function getServiceRoleKey(): string {
  // Try process.env first (standard Node.js)
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  // Try Nitro runtime config
  try {
    const { useRuntimeConfig } = require('nitro/runtime');
    const config = useRuntimeConfig();
    if (config?.supabaseServiceRoleKey) return config.supabaseServiceRoleKey;
    if (config?.SUPABASE_SERVICE_ROLE_KEY) return config.SUPABASE_SERVICE_ROLE_KEY;
  } catch {}

  // Try globalThis
  const g = globalThis as Record<string, unknown>;
  if (typeof g.SUPABASE_SERVICE_ROLE_KEY === 'string') {
    return g.SUPABASE_SERVICE_ROLE_KEY;
  }

  throw new Error('[Supabase Admin] SUPABASE_SERVICE_ROLE_KEY not found in any env source.');
}

function createSupabaseAdminClient() {
  const SUPABASE_URL = 'https://afyrxulrwartxwpxfylj.supabase.co';
  const SUPABASE_SERVICE_ROLE_KEY = getServiceRoleKey();

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
