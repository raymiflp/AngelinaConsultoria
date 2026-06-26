# AGENTS.md — angelina-consultoria

Repo-specific guidance for OpenCode agents. Generic Next.js/TypeScript/Tailwind/tRPC/Drizzle conventions are intentionally omitted.

## Stack at a glance

Next.js 15 (App Router) + React 19 + TypeScript 5.9 + Tailwind v4 + shadcn/ui (`new-york` / `zinc`). tRPC v11, Drizzle ORM + `postgres-js`, Redis (`ioredis`), Meilisearch, MinIO. Auth.js v5 (Credentials only), Zod. LiveKit (self-hosted in dev, WebRTC SFU). Vitest (unit + integration), Playwright (E2E). Package manager: **pnpm** (`packageManager: pnpm@11.3.0`); CI uses `npm ci`. Node **22+** (`.nvmrc` pins `22`).

**`pnpm-workspace.yaml` is not a monorepo.** It only declares `allowBuilds:` for native packages (`sharp`, `@swc/core`, etc.); there is no `packages:` block. Don't go looking for `packages/`, `apps/`, etc.

## Architecture (Clean / Hexagonal)

Source root is `src/`. Only some of the layers documented in `ARCHITECTURE.md` are populated — the rest are aspirational:

| Layer             | Path                                                | Status       |
| ----------------- | --------------------------------------------------- | ------------ |
| Domain            | `src/domain/{entities,enums}`                       | Real         |
| Application       | `src/application/use-cases/*`                       | Real (barrel at `src/application/index.ts`) |
| Infrastructure    | `src/infrastructure/{api,auth,booking,db,livekit,…}` | Real         |
| Presentation      | `src/app/*` + `src/components/*`                    | Real         |
| Compliance / SEO  | `src/compliance/`, `src/seo/`, `src/presentation/`  | **Empty**    |

**Empty / aspirational directories**: `src/compliance/`, `src/seo/`, `src/presentation/` exist on disk but contain no files. `ARCHITECTURE.md` lists modules like `audit-log.ts`, `consent-manager.ts`, `dpo-portal.ts` inside `src/compliance/` that don't exist — the real audit logging lives at `src/application/use-cases/audit/write-audit-log.use-case.ts`. Don't add files expecting imports from those three directories to resolve.

Import alias: `@/*` → `./src/*`. shadcn aliases: `@/components`, `@/components/ui`, `@/lib/utils`, `@/hooks`.

## Bootstrap (clone → running dev)

`docs/dev-setup.md` is the source of truth. The exact sequence (don't reorder):

1. `pnpm install` (use `corepack enable && corepack prepare pnpm@11 --activate` first)
2. `cp .env.example .env.local` and edit the **LiveKit block** to `devkey` / `secret` / `ws://localhost:7880` + the `LIVEKIT_WEBHOOK_URL` line. Missing LiveKit env vars fail Next.js boot with `"LiveKit env vars missing"` (eager singleton in `src/infrastructure/livekit/livekit-server.ts`)
3. `docker compose up -d postgres redis minio meilisearch livekit` — five services, not just DB. LiveKit is required for `pnpm dev` to boot
4. `pnpm db:migrate` — Drizzle applies `src/infrastructure/db/migrations/` (six migrations currently)
5. `pnpm seed:dev` — idempotent; creates `doctor.dev@angelina.local` / `paciente.dev@angelina.local` and prints a `Cita URL:` line (do not edit this script lightly — it runs the real `createAppointmentUseCase` then UPDATEs `estado='CONFIRMADA'` and stamps `livekitRoomName`)
6. `pnpm dev`

There is also `node scripts/seed-admin.mjs` → creates `admin@angelinaconsultoria.com` / `Admin123!`.

## Non-obvious commands

```bash
pnpm test:integration    # different config — needs TEST_DATABASE_URL or DATABASE_URL
pnpm test:e2e            # auto-starts `next dev` via webServer
pnpm test:coverage       # thresholds in vitest.config.ts: 80/75/80/80
pnpm db:studio           # opens Drizzle Studio at https://local.drizzle.studio
pnpm db:generate         # drizzle-kit generate (only way to create migrations)
pnpm db:push             # schema sync without a migration file — usually wrong
pnpm seed:dev            # dev seed (see Bootstrap step 5)
pnpm db:seed:admin       # admin user seed (node, not tsx)
pnpm storybook           # port 6006, NOT 3000
```

**CI order** is lint → typecheck → unit (with coverage) → e2e → audit. `.github/workflows/ci.yml` is the reference.

## Test layout (this trips up agents)

Three different runners — don't conflate them:

- **Unit / component** — `src/**/*.{test,spec}.{ts,tsx}` via `vitest.config.ts`. JSDOM, `@testing-library/react`, `tests/setup.ts` stubs LiveKit env vars AND mocks `next/navigation`. Coverage thresholds enforced: 80% statements/functions/lines, 75% branches
- **Integration** — `tests/integration/**/*.test.ts` via `vitest.integration.config.ts`. Node env, `pool: "forks"`, `singleFork: true`, 30s timeout. **Requires `TEST_DATABASE_URL` or `DATABASE_URL`** — otherwise each suite self-skips via `describe.skipIf`. `beforeEach` truncates all tables (in `tests/integration/helpers/db.ts`); the integration setup mocks `next-auth`, `next/server`, `next/headers`, `@/auth` so the module graph is loadable in Node env
- **E2E** — `tests/e2e/*.spec.ts` via Playwright. Three browser projects (chromium/firefox/webkit) plus a fourth `chromium-livekit` project that only runs `videocall-2-users.spec.ts` with `--use-fake-ui-for-media-stream` Chrome flags
  - `tests/e2e/public-api.mjs` is a hand-run smoke script (NOT a Playwright test). Run with `node` against `localhost:3000`
  - `tests/e2e/videocall-2-users.spec.ts` is **opt-in via `LIVEKIT_E2E=1`** — without it, the suite is reported `skipped`, not `failed`. Needs `pnpm seed:dev` first (it looks up the citaId from the DB)

## OpenSpec / SDD

This repo uses `openspec/` (file-based artifact store) as configured in `openspec/config.yaml`. Auto execution, auto-forecast PR strategy, **800-line review budget**. Strict TDD is **off**; do not enforce red-green-refactor. Specs live under `openspec/specs/<capability>/spec.md` and reference requirement IDs like `REQ-DEV-SETUP-1`. Archived changes are under `openspec/changes/archive/`. The `migrate-managed-services` change is currently in flight (exploration + proposal exist, no specs/tasks yet). When working OpenSpec flows, treat `openspec/config.yaml` as authoritative.

## Architecture facts agents miss

- **Architecture Decision Records** live at `docs/architecture/decisions/` and are the source of truth for architectural decisions (currently: `0001-vercel-only.md`). Any new architectural proposal that contradicts an existing ADR MUST explicitly call out the override.
- **Drizzle driver duality**: application use cases are typed against `drizzle-orm/node-postgres` (`NodePgDatabase`), but the runtime singleton in `src/infrastructure/db/index.ts` is `drizzle-orm/postgres-js` (`PostgresJsDatabase`). Every call site uses `db as never` to bridge them (see comment in `src/infrastructure/api/routers/bookings.ts` and `src/app/api/livekit/webhook/route.ts`). Don't try to "fix" the cast — it's an intentional project-wide pattern.
- **Drizzle schema is split per table**: `src/infrastructure/db/schema/{usuarios,doctores,pacientes,citas,audit-logs,consentimientos,doctor-availability,doctor-experiencia,doctor-servicios,doctor-condiciones}.ts` are re-exported via `src/infrastructure/db/schema/index.ts` (which is what `drizzle.config.ts` points at). Don't create tables in `index.ts` directly.
- **Two eager env validations crash `next dev`**: `src/infrastructure/livekit/livekit-server.ts` throws `"LiveKit env vars missing…"` if `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `NEXT_PUBLIC_LIVEKIT_URL` are unset; `src/infrastructure/db/index.ts` throws `"DATABASE_URL environment variable is required"` if `DATABASE_URL` is unset. Both fail boot, not first-request.
- **LiveKit webhook is the trust boundary**, not Auth.js. `POST /api/livekit/webhook` lives outside tRPC, reads `await req.text()` (NOT `req.json()` — the JWT signature hashes raw bytes), and the only caller of `autoCompleteOnRoomFinishedUseCase` is that route handler. Dedupe is Redis `SET NX EX 86400` by `event.id`.
- **`NEXT_PUBLIC_LIVEKIT_URL` is build-time inlined** on Vercel — changing it requires a redeploy.
- **`host.docker.internal` works natively on Mac/Windows Docker Desktop**; on Linux, `docker-compose.yml` has `extra_hosts: host.docker.internal:host-gateway` so the LiveKit container can POST webhooks to the Next.js dev server. Symptom if broken: smoke-test cita stays `EN_CURSO` after 30s instead of becoming `COMPLETADA`.
- **Login form labels** (Spanish): "Email", "Contraseña", submit button "Ingresar". The E2E test matches on `/email/i`, `/contrase/i`, `/ingresar/i`.
- **Seed credentials are printed by `pnpm seed:dev`** — do not hardcode them elsewhere; re-run the seed instead. `seed-dev.ts` uses `bcryptjs` with cost 12 (matches `src/infrastructure/auth/password.ts`).
- **Headers/CSP/security** are configured in `next.config.ts` (HSTS, X-Frame-Options, Permissions-Policy camera=() microphone=() geolocation=()). The `Permissions-Policy` will break LiveKit media if changed. The same file also sets `images.remotePatterns` to allow MinIO's public hostname — if MinIO gets swapped for Vercel Blob (see `migrate-managed-services`), this needs updating too.
- **`serverExternalPackages: ["socket.io", "livekit-server-sdk"]`** is set in `next.config.ts` — adding other native-ish packages requires the same flag.

## Naming conventions worth knowing

- Use cases: `<verb>-<noun>.use-case.ts` under `src/application/use-cases/<domain>/`. Re-exported through the barrel `src/application/index.ts`.
- Tests: co-located `__tests__/` directory next to the code under test (NOT top-level `tests/` — that directory is integration + e2e only).
- Drizzle migrations: auto-generated names (`0000_even_starhawk.sql`, etc.). Never edit by hand — always `pnpm db:generate`.
- shadcn: add with `npx shadcn@latest add <component>` — `components.json` is `new-york` / `zinc` / RSC on.

## Things that will silently fail you

- `packageManager: pnpm@11.3.0` is declared in `package.json` and CI uses pnpm (`pnpm/action-setup@v4` + `pnpm install --frozen-lockfile`). The repo only ships `pnpm-lock.yaml` — there is no `package-lock.json`. Don't run `npm ci` in CI or you'll reintroduce the lockfile mismatch that broke the first deploy.
- `pnpm test:integration` against a missing `DATABASE_URL` is a silent no-op (suites self-skip). If you want it to actually run, point `TEST_DATABASE_URL` at a separate database — `resetDb()` truncates everything
- `pnpm test:e2e` auto-starts `next dev`; if `next dev` already runs on `:3000` it reuses the existing server (non-CI). Kill any stray `next dev` before debugging E2E failures
- `pnpm db:push` syncs the schema without writing a migration file. Use only for throwaway experiments; never commit the resulting DB state
- `tests/e2e/public-api.mjs` uses hardcoded credentials `dr.test@test.com` and the docker `postgres://angelina:angelina_pass@localhost:5432/angelina_consultoria` — it will fail unless you seed a doctor with that email manually
- The `migrate-managed-services` change proposes killing MinIO/MeiliSearch/Socket.io in favor of Vercel Blob/Upstash/LiveKit Cloud. If you see those services referenced as "required" in older docs, check the proposal status before assuming they're still on