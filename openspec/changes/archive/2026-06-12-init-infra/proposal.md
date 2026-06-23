# Change: init-infra

## Proposal — Project Infrastructure Scaffolding

### Intent
Initialize the medico-consulta project with complete development infrastructure:
project configuration, Docker services, testing setup, CI/CD pipeline, and
SDD process artifacts. No application business logic is included — this is
the foundation for all future changes.

### Motivation
The project has extensive planning in Engram (stack v2, roles, data model,
regulatory analysis) but zero executable infrastructure. Without this change,
there is no project to build on.

### Scope

**In scope:**
- Root project config (package.json, tsconfig, next.config, ESLint, Prettier)
- Environment variable templates (.env.example, .env.local.example)
- Docker services (PostgreSQL, Redis, MinIO, Meilisearch)
- Tailwind CSS v4 + shadcn/ui theme scaffolding
- Clean Architecture directory structure
- Testing infrastructure (Vitest, Playwright, test setup)
- CI/CD pipelines (GitHub Actions: CI + Deploy)
- Dev container configuration
- Project documentation (README, ARCHITECTURE, SETUP)
- SDD artifacts for this change
- PostgreSQL init script with schemas and extensions

**Out of scope:**
- Application business logic (domains, use cases, entities)
- API routes or tRPC routers
- UI components or pages
- Database migrations (schema DDL)
- Authentication flows
- Compliance layer implementation

### Business Value
- Reduces setup time for new developers from hours to ~5 minutes (Docker + npm install)
- Enables TDD with Vitest + Playwright from day one
- Provides regulatory-ready CI/CD for health data compliance
- Creates reproducible environments via Docker and devcontainer
- Establishes Clean Architecture boundaries to prevent domain leakage

### Success Criteria
- `npm run dev` starts the Next.js dev server without errors
- `docker compose up -d` starts all 4 services healthy
- `npm run test:run` passes with at least the setup test
- `npm run lint` passes with zero errors
- `npm run type-check` passes with zero errors
