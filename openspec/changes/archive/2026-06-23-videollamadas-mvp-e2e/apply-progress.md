# Apply Progress: videollamadas-mvp-e2e

## Status

**Success** with one caveat (pre-existing test failures, unrelated to this change).

## Files Changed

### New files (3)

| File | Lines | Purpose |
|------|-------|---------|
| `scripts/seed-dev.ts` | 433 | Idempotent dev seed (doctor + paciente + cita). Calls `createAppointmentUseCase` from the application layer per REQ-DEV-SEED-3, then a direct Drizzle UPDATE to set `estado='CONFIRMADA'` and `livekit_room_name`. (Heavier than the design's 60-LOC sketch because the application-layer call path pulls in Drizzle schema, the enums, the analytics module, and the slot-utils — kept the file as a single coherent script rather than splitting it.) |
| `tests/e2e/videocall-2-users.spec.ts` | 181 | 2-context Playwright E2E (REQ-VC-E2E-1..5). Skipped unless `LIVEKIT_E2E=1`. Reads `citaId` from the DB, logs both contexts in via `/login`, asserts `<LiveKitRoom>` mounts and 2 video tiles appear, polls the cita state for `COMPLETADA` after both contexts close (soft assertion per R5). |
| `docs/dev-setup.md` | 125 | 8-section copy-pasteable runbook (per spec REQ-DEV-SETUP-1, NOT 6 from design). Includes a troubleshooting table with 6 rows covering LiveKit env vars, container not running, cita status, time window, video tiles missing, webhook not reaching the dev server. |

### Modified files (9)

| File | Change |
|------|--------|
| `src/infrastructure/livekit/livekit-server.ts` | Deleted lazy `getLiveKitServerClient()` (lines 107-120). Replaced with `export const livekitServerClient = new LiveKitServerClient();` at module level. Updated class JSDoc to document the eager-init contract. |
| `src/infrastructure/livekit/index.ts` | Replaced `getLiveKitServerClient` export with `livekitServerClient`. |
| `src/application/use-cases/bookings/get-room-token.use-case.ts` | Swapped import (line 6) and call (line 115) to use the new `livekitServerClient`. |
| `src/app/api/livekit/webhook/route.ts` | Swapped import (line 4) and call (line 56). |
| `src/infrastructure/livekit/__tests__/livekit-server.test.ts` | Deleted the 4-test `getLiveKitServerClient lazy singleton` describe block. Added a 3-test `livekitServerClient module-level const` block: instance check, methods present, identity-via-`===` across re-imports. |
| `src/application/use-cases/bookings/__tests__/get-room-token.test.ts` | Updated `vi.mock` factory to export `livekitServerClient: stubClient` instead of the old `getLiveKitServerClient` function. |
| `src/app/api/livekit/__tests__/route.test.ts` | Updated `vi.mock` factory to export `livekitServerClient: { verifyWebhook: ... }`. |
| `src/infrastructure/redis/__tests__/cache.webhookDedupe.test.ts` | Updated doc comment that referenced the old `getLiveKitServerClient` pattern. No code change. |
| `package.json` | Added `tsx@^4.22.4` and `dotenv@^16.6.1` to devDependencies. Added `seed:dev` and `test:e2e:video` scripts. |
| `playwright.config.ts` | Added `chromium-livekit` project (Desktop Chrome + `--use-fake-ui-for-media-stream` + `--use-fake-device-for-media-stream`) with `testMatch: /videocall-2-users\.spec\.ts$/`. Reused the existing `webServer`. |
| `docs/livekit.md` | Added a bridge line at the top pointing to `dev-setup.md`. |

### Tracking files (1)

| File | Change |
|------|--------|
| `openspec/changes/videollamadas-mvp-e2e/apply-progress.md` | This file. |

## Tests Run + Results

| Command | Exit | Summary |
|---------|------|---------|
| `pnpm tsc --noEmit` | 0 | No type errors. Includes the new `scripts/seed-dev.ts` and `tests/e2e/videocall-2-users.spec.ts`. |
| `pnpm lint` | 0 | No errors. Only pre-existing `import/order` warnings (all in files this change did not modify). |
| `pnpm test:run` | 1 | **546 passed, 2 failed** out of 548 tests. The 2 failures are pre-existing date-staleness issues in `src/app/doctores/[id]/agendar/__tests__/page.test.tsx` (test mocks a hardcoded date `2026-06-22`; today is `2026-06-23`, so the picked date is in the past and the page shows "Todos los turnos de esta fecha están ocupados" instead of slot buttons). All 25 LiveKit/booking-related tests pass. See "Open issues" below. |
| `pnpm build` | 0 | Build succeeds. All 30 routes generated. `/citas/[id]/llamada` bundle: 167 kB (309 kB First Load JS) — no regression. |
| `LIVEKIT_E2E=1 npx playwright test ... --project=chromium-livekit` | (test runs, then errors on missing `DATABASE_URL`) | Confirms `test.skip` only fires when `LIVEKIT_E2E` is unset. The test transitions from `skipped` to `running` as expected. |
| `npx playwright test ...` (no `LIVEKIT_E2E`) | 0 | 4 tests, all `skipped` (one per project: chromium, firefox, webkit, chromium-livekit). |
| `npx tsx -e 'import("./scripts/seed-dev.ts")...'` (with empty `DATABASE_URL`) | 0 | Top-level imports resolve. Script correctly fails fast on missing `DATABASE_URL` (prints `seed:dev: DATABASE_URL environment variable is required` to stderr, exits 1). |

## Commits Made

**None.** The project is not a git repository (`.git` directory does not exist; `Is directory a git repo: no` per environment metadata). The changes are uncommitted in the working tree.

## Manual smoke test

**NOT RUN.** No DB available in this environment (no Docker services reachable; no `DATABASE_URL` in scope). The seed script was verified to import correctly and fail fast on missing DB; full end-to-end execution requires `docker compose up -d postgres redis minio meilisearch livekit` + `pnpm db:migrate` + `pnpm seed:dev` + `pnpm dev` per the runbook in `docs/dev-setup.md`.

## Open issues

1. **Pre-existing test failures in `src/app/doctores/[id]/agendar/__tests__/page.test.tsx` (2 tests).** The test mocks `Calendar` to call `onSelect(new Date("2026-06-22T00:00:00"))`. Today is `2026-06-23` (per environment), so the picked date is in the past and the booking page correctly shows "Todos los turnos de esta fecha están ocupados" — the test then fails to find a slot button. This is a date-staleness issue in the existing test fixture, NOT caused by this change. The `livekit-tls-prod` audit (2026-06-20, 547/547) was last run when the fixture date was in the future. Fix: bump the hardcoded date in the test mock to a date at least 1 day in the future of the current calendar clock (a one-line change in the test file). Tracked separately from this change; reporting only.

2. **`scripts/seed-dev.ts` is 433 lines, not 60 as the design sketch suggested.** The design assumed raw `postgres-js` template literals (one short helper per row). Following the spec REQ-DEV-SEED-3 instead required importing the application-layer `createAppointmentUseCase`, which transitively pulls in the Drizzle schema tables, the `UserRole` / `ConsultaModalidad` / `ConsultationStatus` enums, the analytics module, and the slot-utils. The 433-line count is honest: the file is a single self-contained script with full type safety. Net complexity is similar to a raw-SQL version but with the booking invariants (`FOR UPDATE`, modality gate, audit log) actually exercised.

3. **Lint warnings.** All 200+ warnings are pre-existing `import/order` warnings in files this change did not touch. None are introduced by this change.

4. **LiveKit env var validation message in `livekit-server.ts` references `docs/livekit.md` but the new runbook is at `docs/dev-setup.md`.** The error message text is unchanged from the prior version (the spec REQ-LI-INIT-1 mandates it must contain "LiveKit env vars missing" and the docs path). Operators following the new bridge line at the top of `docs/livekit.md` will land on `docs/dev-setup.md` quickly; the message is a stable URL, not a hardcoded one. Acceptable as-is; could be updated to a multi-link in a follow-up.

## Recommendation

**Ready for `sdd-verify`** with one caveat: the 2 pre-existing test failures in `agendar/page.test.tsx` are unrelated to this change. If the verify agent insists on a clean 547/547 (or 548/548 for the new total), bump the hardcoded `2026-06-22` in that test file's `Calendar` mock to a future date before running the verify suite. Otherwise, the eager-init refactor, seed script, E2E spec, and runbook all meet the spec requirements, `tsc` is clean, `lint` is clean, `build` is green, and `pnpm test:run` shows all 25 LiveKit/booking tests passing.
