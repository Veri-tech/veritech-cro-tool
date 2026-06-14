import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";

export default defineConfig({
  vite: {
    plugins: [
      nitro({
        preset: "vercel",
        vercel: {
          config: {
            runtime: "nodejs24.x",
          },
        },
      }),
    ],
    define: {
      'process.env.SUPABASE_SERVICE_ROLE_KEY': 'undefined',
      'process.env.ANTHROPIC_API_KEY': 'undefined',
      'process.env.SUPABASE_ENCRYPTION_KEY': 'undefined',
      'process.env.GOOGLE_CLIENT_SECRET': 'undefined',
      'process.env.SEMRUSH_CLIENT_SECRET': 'undefined',
    },
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});
