import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig(({ mode }) => {
  // Read the shared root .env so the proxy follows the server's HOST/PORT.
  const env = { ...loadEnv(mode, rootDir, ''), ...process.env };
  const apiHost = env.HOST && env.HOST !== '0.0.0.0' ? env.HOST : '127.0.0.1';
  const apiTarget = `http://${apiHost}:${env.PORT ?? '3000'}`;

  return {
    plugins: [react()],
    resolve: {
      // Use the TypeScript source of workspace packages (see packages/shared exports).
      conditions: ['source', ...defaultClientConditions],
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: apiTarget, changeOrigin: true } },
    },
    test: {
      environment: 'jsdom',
      include: ['test/**/*.test.{ts,tsx}'],
      setupFiles: ['test/setup.ts'],
    },
  };
});
