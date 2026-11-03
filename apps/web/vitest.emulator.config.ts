// Backend + security rules tests against the Firebase emulators. Run from the repo root with
// `npm run test:emulator` (starts Auth + Firestore emulators, loads firestore.rules).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
  test: {
    environment: 'node',
    include: ['test/emulator/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
