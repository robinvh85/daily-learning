import { defineConfig } from 'drizzle-kit';

// Used only by `npm run db:generate` (drizzle-kit) to create SQL migrations from schema.ts.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});
