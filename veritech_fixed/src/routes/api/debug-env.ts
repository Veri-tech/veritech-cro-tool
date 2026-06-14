import { createAPIFileRoute } from "@tanstack/react-start/api";

export const APIRoute = createAPIFileRoute("/api/debug-env")({
  GET: async () => {
    // Only expose keys, never values for security
    const envKeys = Object.keys(process.env).filter(k => 
      k.includes('SUPABASE') || k.includes('ANTHROPIC') || k.includes('APP_URL')
    );
    
    return Response.json({
      availableKeys: envKeys,
      supabaseUrlFound: !!process.env.SUPABASE_URL,
      serviceRoleKeyFound: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      serviceRoleKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length ?? 0,
      nodeEnv: process.env.NODE_ENV,
    });
  },
});
