import react from '@vitejs/plugin-react';
import { defaultClientConditions } from 'vite';
import { defineConfig } from 'vitest/config';

// `/content/` (lesson JSON + audio) comes from `public/content/`, written by `npm run
// content:build`. Data lives in Firestore: the dev server talks to the local emulators
// (`npm run emulators`), see src/backend/firebase.ts.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Use the TypeScript source of workspace packages (see packages/shared exports).
    conditions: ['source', ...defaultClientConditions],
  },
  build: {
    // The lazily loaded `backend` chunk holds the Firebase Auth + Firestore SDKs (~210 kB gzip).
    chunkSizeWarningLimit: 800,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    exclude: ['test/emulator/**'],
    setupFiles: ['test/setup.ts'],
  },
});
