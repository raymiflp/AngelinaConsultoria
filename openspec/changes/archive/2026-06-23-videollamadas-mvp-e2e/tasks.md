# Tasks: Videollamadas MVP end-to-end

## Review Workload Forecast

- **Estimated changed lines**: ~310 (190 excluding OpenSpec deltas)
- **Files modified**: ~10 (4 source, 3 tests, 1 new script, 2 new docs, 1 package.json)
- **Review budget**: 800 lines
- **400-line risk**: Low (39% of cap)
- **Chained PRs recommended**: No (single PR is sufficient)
- **Decision needed before apply**: No

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Eager init + seed + E2E + docs + commit | PR 1 | seed ↔ E2E interdependent; docs reference seed; single PR is the natural seam |

## 1. Eager init refactor

- [x] **1.1** Replace lazy singleton with module-level const in `src/infrastructure/livekit/livekit-server.ts` (delete lines 107-120; update class JSDoc; append `export const livekitServerClient = new LiveKitServerClient();` with a 6-line comment naming REQ-LI-INIT-1).
- [x] **1.2** Swap `getLiveKitServerClient` → `livekitServerClient` in the re-export at `src/infrastructure/livekit/index.ts` line 3.
- [x] **1.3** Swap import (line 6) and call (line 115) in `src/application/use-cases/bookings/get-room-token.use-case.ts` (transitively fixes `src/infrastructure/api/routers/bookings.ts`).
- [x] **1.4** Swap import (line 4) and call (line 56) in `src/app/api/livekit/webhook/route.ts`.
- [x] **1.5** Update 3 test files: `src/infrastructure/livekit/__tests__/livekit-server.test.ts` (delete lazy describe block lines 150-212, add `describe("livekitServerClient module-level const", …)` with identity-via-`===` + eager env-var throw); `src/application/use-cases/bookings/__tests__/get-room-token.test.ts` (vi.mock factory: `livekitServerClient: stubClient`); `src/app/api/livekit/__tests__/route.test.ts` (vi.mock factory: `livekitServerClient: { verifyWebhook: mockVerifyWebhook }`).
- [x] **1.6** Verify: `pnpm tsc --noEmit` clean AND `pnpm test:run` shows 547/547 passing.

## 2. Seed script

- [x] **2.1** Add `"tsx": "^4.22.4"` to `package.json` devDependencies (currently transitive via drizzle-kit; pin for reproducible runs).
- [x] **2.2** Create `scripts/seed-dev.ts` (~60 LOC) per design §2.2: `import "dotenv/config"` + raw `postgres-js` + `bcryptjs` 12 rounds; constants `doctor.dev@medico.local` / `DoctorDev123!` and `paciente.dev@medico.local` / `PacienteDev123!`; `upsertUser` (SELECT-then-INSERT); `ensureDoctorProfile` (`aceptaOnline: true`, `numero_colegiado: "DEV-<timestamp>"`); `ensurePacienteProfile` (`ON CONFLICT (usuario_id) DO NOTHING`); `ensureCita` (reuse existing CONFIRMADA/PROGRAMADA, else INSERT with `estado='CONFIRMADA'`, `modalidad='ONLINE'`, `fechaHora=now+5min`, `motivo="Consulta de prueba — seed dev"`, `livekitRoomName="cita-dev-<first 8 hex of citaId>"`); outer try/catch with `console.error("seed:dev:", err.message)` + `process.exit(1)`; stdout block matches REQ-DEV-SEED-4.
- [x] **2.3** Add to `package.json` scripts: `"seed:dev": "tsx scripts/seed-dev.ts"` and `"test:e2e:video": "playwright test tests/e2e/videocall-2-users.spec.ts"`.
- [x] **2.4** Verify: `pnpm seed:dev` exits 0, prints credentials + `Cita URL:` line, `SELECT count(*) FROM citas WHERE estado='CONFIRMADA'` returns 1; rerun 2× — `SELECT count(*) FROM usuarios WHERE email IN ('doctor.dev@medico.local', 'paciente.dev@medico.local')` returns exactly 2.

## 3. Playwright E2E

- [x] **3.1** Create `tests/e2e/videocall-2-users.spec.ts` (~80 LOC) per design §2.3: `test.skip(!process.env.LIVEKIT_E2E || process.env.LIVEKIT_E2E !== "1", …)` at describe level; `beforeAll` reads `citaId` via `postgres(process.env.DATABASE_URL!)`; `loginInTab` helper fills `/login` form and waits for `!url.pathname.startsWith("/login")`; main test creates two `browser.newContext()`, `Promise.all([loginInTab(doctorCtx, DOCTOR), loginInTab(pacienteCtx, PACIENTE)])`, navigates both to `BASE/citas/${citaId}/llamada`, asserts `[data-lk-component="livekit-room"]` visible within 10s, asserts `page.locator("video")` count === 2 within 15s, closes both contexts, polls `SELECT estado FROM citas` every 1s up to 30s for `'COMPLETADA'` (warns on miss per R5, never fails).
- [x] **3.2** Update `playwright.config.ts` per design §2.7: add `chromium-livekit` project with `devices["Desktop Chrome"]` + `launchOptions.args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]`, `testMatch: /videocall-2-users\.spec\.ts$/`, `dependencies: ["setup"]`; reuse existing `webServer`.
- [x] **3.3** Verify: `LIVEKIT_E2E=1 pnpm test:e2e:video` passes with all 5 services up; the test is reported `skipped` (not `failed`) when `LIVEKIT_E2E` is unset.

## 4. Documentation

- [x] **4.1** Create `docs/dev-setup.md` with 8 numbered sections per REQ-DEV-SETUP-1 (Prerequisites → Install → Env → DB services → Migrations → Seed → Run → Smoke test), each a single ` ```bash ` block, plus "Troubleshooting" table with the 4 mandatory rows from REQ-DEV-SETUP-4; LiveKit env defaults `LIVEKIT_API_KEY=devkey` / `LIVEKIT_API_SECRET=secret` / `NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880` / `LIVEKIT_WEBHOOK_URL=http://host.docker.internal:3000/api/livekit/webhook`; service verification commands: `docker compose ps postgres` / `curl -fsS http://localhost:9000/minio/health/live` / `curl -fsS http://localhost:7700/health` / `curl -fsS http://localhost:7880`; §8 smoke test instructs incognito for the second tab and the 30-second `COMPLETADA` poll.
- [x] **4.2** Add bridge line at the top of `docs/livekit.md` (after the H1): `> Looking for dev setup? See [dev-setup.md](./dev-setup.md) for the linear sequence from clone to two tabs in a call.`
- [x] **4.3** Verify: from a clean container of the dev stack, §1-7 of `docs/dev-setup.md` are completable in under 10 minutes; §8 smoke test passes (2 video tiles, `COMPLETADA` badge within 30s of close).

## 5. Final verification

- [x] **5.1** `pnpm tsc --noEmit` — 0 errors.
- [x] **5.2** `pnpm lint` — 0 errors (existing warnings OK).
- [x] **5.3** `pnpm test:run` — 547/547 passing.
- [x] **5.4** `pnpm seed:dev` + `pnpm dev` + 2 tabs (one incognito) — both video tiles visible, `COMPLETADA` badge within 30s of close.
- [x] **5.5** Conventional commit(s) — NO `Co-Authored-By`, NO AI attribution. Suggested split: one commit per phase 1-4 + a verification commit, or single squashed commit.
