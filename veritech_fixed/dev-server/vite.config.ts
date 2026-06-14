import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";

export default defineConfig({
  vite: {
    plugins: [
      nitro({
        preset: "vercel",
      }),
    ],
    define: {
      // These server-only vars must never reach the client bundle
      'process.env.SUPABASE_SERVICE_ROLE_KEY': 'undefined',
      'process.env.ANTHROPIC_API_KEY': 'undefined',
      'process.env.SUPABASE_ENCRYPTION_KEY': 'undefined',
      'process.env.INTEGRATION_ENCRYPTION_KEY': 'undefined',
      'process.env.GOOGLE_CLIENT_SECRET': 'undefined',
      'process.env.SEMRUSH_CLIENT_SECRET': 'undefined',
      'process.env.DATAFORSEO_PASSWORD': 'undefined',
      'process.env.RESEND_API_KEY': 'undefined',
    },
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});
