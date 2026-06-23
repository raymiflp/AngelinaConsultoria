# Tasks — init-infra

## Task List

### T1: Root project configuration files
- [x] Create `package.json` with all dependencies
- [x] Create `tsconfig.json` with strict mode and path aliases
- [x] Create `next.config.ts` with security headers
- [x] Create `postcss.config.mjs` with `@tailwindcss/postcss`
- [x] Create `.gitignore`
- [x] Create `.prettierrc` with tailwindcss plugin
- [x] Create `.eslintrc.json` extending next/core-web-vitals
- [x] Create `.nvmrc` specifying Node 22

### T2: Environment variable templates
- [x] Create `.env.example` with all documented variables
- [x] Create `.env.local.example` with local defaults

### T3: Docker setup
- [x] Create `docker-compose.yml` with PostgreSQL, Redis, MinIO, Meilisearch
- [x] Create `Dockerfile` (multi-stage production build)
- [x] Create `.dockerignore`
- [x] Create `docker/dev/postgres/init.sql`

### T4: Tailwind v4 + shadcn/ui scaffolding
- [x] Create `src/app/globals.css` with 4-step v4 pattern
- [x] Create `components.json` with empty config for v4
- [x] Create `src/lib/utils.ts` with cn() utility

### T5: Clean Architecture directory structure
- [x] Create directories: domain, application, infrastructure, presentation, shared, compliance, seo

### T6: Testing infrastructure
- [x] Create `vitest.config.ts` with coverage thresholds
- [x] Create `playwright.config.ts` with 3 browser projects
- [x] Create `tests/setup.ts` with jest-dom and Next.js mocks

### T7: CI/CD pipelines
- [x] Create `.github/workflows/ci.yml`
- [x] Create `.github/workflows/deploy.yml`

### T8: Dev environment
- [x] Create `.devcontainer/devcontainer.json`

### T9: Project documentation
- [x] Create `README.md`
- [x] Create `ARCHITECTURE.md`
- [x] Create `docs/SETUP.md`

### T10: SDD artifacts
- [x] Create `openspec/changes/init-infra/proposal.md`
- [x] Create `openspec/changes/init-infra/spec.md`
- [x] Create `openspec/changes/init-infra/design.md`
- [x] Create `openspec/changes/init-infra/tasks.md`
- [x] Create `openspec/changes/init-infra/status.md`

## Review Workload Forecast

- Estimated changed lines: ~950 (all config/doc, zero application code)
- 400-line budget risk: High
- Chained PRs recommended: No (single PR — all infra, no business logic)
- Decision needed before apply: No
