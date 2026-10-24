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

| Command             | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Server (tsx watch) + web (Vite) together        |
| `npm run build`     | Build `shared`, `server` and `web` into `dist/` |
| `npm start`         | Run the built server (`apps/server/dist`)       |
| `npm run lint`      | ESLint (flat config)                            |
| `npm run typecheck` | `tsc --noEmit` in every workspace               |
| `npm test`          | Vitest in every workspace                       |
| `npm run format`    | Prettier (write); `format:check` only checks    |

## Structure

```
apps/
  server/   Fastify API (src/app.ts builds the app, src/index.ts starts it), tests in test/
  web/      React 18 + Vite UI, tests in test/
packages/
  shared/   Types and schemas shared by server and web
scripts/    Repo tooling (check-staged.mjs: pre-commit guard)
.github/    CI (lint, typecheck, test, build)
```

`packages/shared` exposes its TypeScript source through the `source` export condition (used by
`tsx`, Vite and Vitest in dev/test) and its compiled `dist/` for production builds.

## Pre-commit hook

Runs ESLint + Prettier on staged files and blocks:

- staged media files (mp3, webp, png, jpg, …) larger than 5 MB
- staged `*.json` files containing `private_key` (service account keys belong in `secrets/`, which is git-ignored)
