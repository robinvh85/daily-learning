# DailyLearning

Web app for ~15 minutes of English practice a day, focused on **Reading** and **Listening** (A2 → B1).
The full plan lives in [`.claude/plans/dailylearning-v1-plan.md`](.claude/plans/dailylearning-v1-plan.md).

## Requirements

- Node.js 22 (see `.nvmrc`; with nvm: `nvm use`)
- npm 10

## Install

```bash
npm install          # also installs the git pre-commit hook (husky)
cp .env.example .env # optional, defaults work for local use
```

> **macOS:** `node_modules` is not committed. After cloning (or after copying the folder from
> another machine), always run `npm install` yourself on the Mac so native/platform-specific
> packages are installed for macOS.

## Develop

```bash
npm run dev
```

- Web (Vite): http://127.0.0.1:5173
- API (Fastify): http://127.0.0.1:3000 (`PORT` in `.env`); Vite proxies `/api` to it.
- Health check: http://127.0.0.1:5173/api/health

## Scripts

| Command                             | What it does                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`                       | Server (tsx watch) + web (Vite) together                                          |
| `npm run build`                     | Build `shared`, `server` and `web` into `dist/`                                   |
| `npm start`                         | Run the built server (`apps/server/dist`)                                         |
| `npm run lint`                      | ESLint (flat config)                                                              |
| `npm run typecheck`                 | `tsc --noEmit` in every workspace                                                 |
| `npm test`                          | Vitest in every workspace                                                         |
| `npm run format`                    | Prettier (write); `format:check` only checks                                      |
| `npm run db:migrate`                | Apply SQL migrations to `DB_PATH` (also runs on server start)                     |
| `npm run db:generate`               | Create a new migration after editing `apps/server/src/db/schema.ts`               |
| `npm run content:sync`              | Validate `content/` and upsert it into SQLite (`-- --dry-run`: validate only)     |
| `npm run content:check-dict [slug]` | Words of a lesson missing from the dictionary, multi-sense words without a choice |
| `npm run content:stats`             | Dictionary size, % reviewed, Oxford 3000 flags, lesson count                      |

## Structure

```
apps/
  server/   Fastify API (src/app.ts builds the app, src/index.ts starts it), tests in test/
  web/      React 18 + Vite UI, tests in test/
packages/
  shared/   Types and schemas shared by server and web
content/    Lessons, dictionary and daily plan (synced into SQLite)
scripts/    Repo tooling (content-*.ts, db-migrate.ts, check-staged.mjs: pre-commit guard)
.github/    CI (lint, typecheck, test, build, content:sync --dry-run)
```

`packages/shared` exposes its TypeScript source through the `source` export condition (used by
`tsx`, Vite and Vitest in dev/test) and its compiled `dist/` for production builds.

## Database

SQLite (`better-sqlite3` + Drizzle ORM) at `DB_PATH` (default `./data/app.db`, git-ignored), with
`journal_mode=WAL`, `foreign_keys=ON`, `synchronous=NORMAL`. Schema: `apps/server/src/db/schema.ts`,
migrations: `apps/server/src/db/migrations/` (generated, applied automatically).

## Content

```
content/
  lessons/<level>/<slug>/lesson.yaml   lesson text, translation, focus words, senses, questions, dictation
  dictionary/<lemma>.yaml              one entry per lemma or phrase (US IPA, Vietnamese meaning per sense)
  daily-plan.yaml                      day N → reading + listening lesson
```

Schemas: `packages/shared/src/content.ts`. Tokenizer rules: `apps/server/src/content/tokenizer.ts`
(phrases longest first, forms → lemma, `senses` with `word#n`, `ignore`, numbers skipped, contractions
such as `it's` / `I'll` are dictionary entries of their own, `there's` is a form of `there is`).

Workflow for a new lesson: write `lesson.yaml` → `npm run content:check-dict <slug>` → add the missing
`content/dictionary/*.yaml` (`status: draft`) → `npm run content:sync`.

## Pre-commit hook

Runs ESLint + Prettier on staged files and blocks:

- staged media files (mp3, webp, png, jpg, …) larger than 5 MB
- staged `*.json` files containing `private_key` (service account keys belong in `secrets/`, which is git-ignored)
