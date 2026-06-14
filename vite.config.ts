import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import tailwindcss from '@tailwindcss/vite';
import tsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({
      server: {
        entry: 'src/server.ts',
      },
    }),
    nitro({
      preset: 'vercel',
      vercel: {
        functions: {
          runtime: 'nodejs24.x',
          maxDuration: 55,
        },
      },
    }),
    react(),
  ],
  define: {
    'process.env.SUPABASE_SERVICE_ROLE_KEY': 'undefined',
    'process.env.ANTHROPIC_API_KEY': 'undefined',
    'process.env.SUPABASE_ENCRYPTION_KEY': 'undefined',
    'process.env.GOOGLE_CLIENT_SECRET': 'undefined',
    'process.env.SEMRUSH_CLIENT_SECRET': 'undefined',
  },
});
