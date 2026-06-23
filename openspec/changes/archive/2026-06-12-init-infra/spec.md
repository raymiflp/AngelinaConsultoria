# Specification — init-infra

## Requirements

### R1: Project Root Configuration
- **R1.1**: `package.json` must declare all dependencies from Stack v2
- **R1.2**: `tsconfig.json` must configure strict mode, `@/*` path alias, and bundler module resolution
- **R1.3**: `next.config.ts` must include security headers (HSTS, CSP, X-Frame-Options) and CORS for API routes
- **R1.4**: `postcss.config.mjs` must use `@tailwindcss/postcss` plugin (v4 syntax)
- **R1.5**: `.gitignore` must exclude node_modules, .next, .env, coverage, and Docker data
- **R1.6**: `.prettierrc` must include `prettier-plugin-tailwindcss`
- **R1.7**: `.eslintrc.json` must extend `next/core-web-vitals`
- **R1.8**: `.nvmrc` must specify Node 22

### R2: Environment Configuration
- **R2.1**: `.env.example` must document ALL environment variables with descriptions
- **R2.2**: `.env.local.example` must provide working local defaults for dev services
- **R2.3**: Variables must cover: DB, Redis, Auth, Meilisearch, MinIO, LiveKit, Sentry, PostHog, Stripe, SMTP

### R3: Docker Services
- **R3.1**: `docker-compose.yml` must define PostgreSQL 16, Redis 7, MinIO, and Meilisearch
- **R3.2**: Each service must have health checks and named volumes
- **R3.3**: PostgreSQL must include init script with pgcrypto extension and audit schema
- **R3.4**: MinIO must expose both API (9000) and Console (9001) ports

### R4: Tailwind v4 + shadcn/ui
- **R4.1**: `globals.css` must follow the 4-step v4 pattern: :root vars → @theme inline → @layer base
- **R4.2**: Color tokens must include: background, foreground, primary, secondary, destructive, success, warning, info, muted, accent, border, ring
- **R4.3**: Dark mode must use `.dark` class with complete color overrides
- **R4.4**: `components.json` must have `"config": ""` (Tailwind v4 requirement)
- **R4.5**: `cn()` utility in `src/lib/utils.ts` must use clsx + tailwind-merge

### R5: Directory Structure
- **R5.1**: Clean Architecture layers: domain, application, infrastructure, presentation, shared, compliance, seo
- **R5.2**: Each layer directory must exist (even if empty)

### R6: Testing Infrastructure
- **R6.1**: `vitest.config.ts` must configure jsdom environment, `@/` alias, and coverage thresholds (80%+)
- **R6.2**: `playwright.config.ts` must configure 3 browsers (chromium, firefox, webkit) with HTML reporter
- **R6.3**: `tests/setup.ts` must import jest-dom matchers and mock Next.js navigation
- **R6.4**: `package.json` scripts must include test, test:run, test:coverage, test:e2e, test:e2e:ui

### R7: CI/CD
- **R7.1**: CI workflow must run lint, type-check, unit tests (with coverage), E2E tests, and security audit
- **R7.2**: CI must include PostgreSQL and Redis service containers for E2E tests
- **R7.3**: Deploy workflow must build and deploy to Vercel
- **R7.4**: Playwright report must be uploaded as artifact on failure

### R8: Dev Environment
- **R8.1**: `.devcontainer/devcontainer.json` must use TypeScript Node 22 image
- **R8.2**: Must forward ports for app, DB, Redis, Meilisearch, and MinIO
- **R8.3**: Must include VS Code extensions for ESLint, Prettier, Tailwind, and Playwright

### R9: Documentation
- **R9.1**: `README.md` must describe project, stack, quick start, and available scripts
- **R9.2**: `ARCHITECTURE.md` must document Clean Architecture layers, key technical decisions, data model, compliance layer, and deployment topology
- **R9.3**: `docs/SETUP.md` must provide step-by-step setup instructions with troubleshooting
- **R9.4**: All docs must be in neutral Spanish (project language)

### R10: SDD Artifacts
- **R10.1**: Change `init-infra` must have proposal, spec, design, tasks, and status artifacts
- **R10.2**: Artifacts must follow openspec/ format under `openspec/changes/init-infra/`

## Scenarios

### S1: Fresh Developer Setup
1. Developer clones repo
2. Runs `npm install` → no errors
3. Copies `.env.example` → `.env.local`
4. Runs `docker compose up -d` → all 4 services healthy
5. Runs `npm run dev` → app loads at localhost:3000
6. Runs `npm run test:run` → tests pass

### S2: CI Pipeline
1. Developer pushes to main
2. CI runs lint, type-check, unit tests, E2E tests → all green
3. Deploy pipeline builds and deploys to Vercel

### S3: Environment Consistency
1. Two developers run `docker compose up -d`
2. Both have identical PostgreSQL, Redis, MinIO, Meilisearch versions
3. No "works on my machine" issues
