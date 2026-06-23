# Tasks — LiveKit Room-Finished Webhook (`livekit-webhooks`)

> Auto-forecast mode. Review budget: 800 lines (user D2). Delivery: single PR at the 800-line cap, with a mechanical chained fallback (`stacked-to-main`) if the diff exceeds the cap.
>
> **Change ID**: `2026-06-19-livekit-webhooks`
> **Mode**: auto / 800-line budget
> **Delivery**: single PR (~800 lines), chained fallback (`stacked-to-main`) if >800
> **Total estimated lines**: ~800 (single-PR plan); mechanical split PR-1 infra ~400 + PR-2 domain ~400 if the diff lands over the cap
> **Split (mechanical fallback)**:
> - **PR-1** (infra): `livekit.yaml`, `docker-compose.yml` edits, env vars, `LiveKitServerClient.verifyWebhook`, `webhookDedupe` helper, route handler, infra + API test files
> - **PR-2** (domain): `autoCompleteOnRoomFinishedUseCase`, `AuditAction` union extension, `0005` migration, `audit-logs.ts` schema change, `writeAuditLogUseCase` type widening, D10 footer removal, use case test, call page footer test extension
>
> **Soft exception**: single-PR plan is at the user's cached D2 800-line budget; the canonical `chained-pr` 400-line cap is exceeded but the natural seam (infra vs domain) makes a 2-PR chain mechanically clean if needed. See "Review Workload Forecast" below for the documented rationale (per design §10.4).

**Note on paths**: The design phase reconciled path references against the actual codebase. Key facts used in this task file:

- `LiveKitServerClient` lives at `src/infrastructure/livekit/livekit-server.ts` (extends the existing class, does NOT replace it).
- `webhookDedupe` extends the existing `src/infrastructure/redis/cache.ts` (no new module — reuses the same `redis` graceful-null singleton from `src/infrastructure/redis/index.ts`).
- `AuditAction` is exported from `src/application/use-cases/audit/write-audit-log.use-case.ts` (mirroring the video-calls + modality-toggle precedent). The new `'CITA_AUTO_COMPLETED_BY_WEBHOOK'` value is appended as the last variant.
- `getDb()` is the existing app-level DB accessor (one global). The use case pattern `useCase(db, input)` matches the existing `bookings.ts` procedures; the route handler calls the use case directly via the `@/application` barrel.
- The next migration sequence number is `0005` (existing migrations end at `0004_modality.sql`).
- `autoCompleteOnRoomFinishedUseCase` is NOT wrapped in a tRPC procedure (AD-9) — the route handler is its only caller. It lives under `use-cases/bookings/` next to `get-room-token.use-case.ts` and `create-appointment.use-case.ts`.
- The route handler reads the body via `await req.text()` (NOT `req.json()` — AD-3), and uses `runtime = "nodejs"` because `WebhookReceiver` uses `node:crypto`.

---

## Change overview

This change ships the **D10 mitigation that closes the manual-completion loop for online video consultations**: the self-hosted LiveKit container is taught to fire a `room_finished` webhook (new `livekit.yaml` + docker-compose tweak), a Next.js route handler at `POST /api/livekit/webhook` receives it, the signature is verified via the SDK's `WebhookReceiver` (D1), the event is deduped by `event.id` in Redis with a 24h TTL (D4), and a new internal use case `autoCompleteOnRoomFinishedUseCase` atomically transitions an `ONLINE` cita from `EN_CURSO` to `COMPLETADA` (≥1 participant) or `NO_ASISTIO` (0 participants), then writes a system-actor `audit_logs` row tagged `'CITA_AUTO_COMPLETED_BY_WEBHOOK'`. The D10 footer is removed from the call page. The change is **additive at the data plane** (one `ALTER COLUMN ... DROP NOT NULL` on `audit_logs.usuario_id`), **additive at the infra plane** (one YAML config + docker-compose edit + one Redis helper + one SDK wrapper extension), **additive at the HTTP plane** (one route handler, NOT tRPC), **additive at the domain plane** (one use case, NOT exposed via tRPC), and **subtractive at the UI plane** (one footer removed). No new third-party dependencies. The full intent, scope, and decision register live in [`proposal.md`](./proposal.md) (D1-D11, AD-1..AD-16). The technical design, file-by-file change list, and 7-scenario use case test inventory live in [`design.md`](./design.md) (14 sections, ~1,000 lines).

## Review Workload Forecast

| PR | Files | LOC est. | 400-line risk | 800-line risk | Decision |
|---|---|---|---|---|---|
| **Single PR** | ~20 | ~800 | HIGH (over) | OK (at cap) | Chained fallback if >800 |
| **PR-1 (chained fallback)** | ~10 | ~400 | OK | OK | `stacked-to-main` |
| **PR-2 (chained fallback)** | ~10 | ~400 | OK | OK | `stacked-to-main`, depends on PR-1 |

Decision needed before apply: No
Chained PRs recommended: Yes (mechanical fallback if single PR > 800)
Chain strategy: stacked-to-main
400-line budget risk: Medium

**Forecast rationale (per design §10.4):** The single-PR plan is at the user's cached 800-line budget (D2). The canonical 400-line `chained-pr` cap is exceeded by the single PR but both chained slices fit comfortably under 400 lines each. The split is mechanically defined (D10 / AD-12):

- **PR-1 infra** is independently shippable — the route handler exists and is reachable but does nothing meaningful until PR-2 lands. If a doctor clicks "Completar" before PR-2 ships, the manual flow continues unchanged.
- **PR-2 domain** closes the loop — it adds the use case, the audit union extension, the nullable migration, the audit-write pattern, and the D10 footer removal. Depends on PR-1 because the route handler is the only place that calls the use case, and the audit-union extension is referenced by the use case's audit call.

```
Single PR ────► main  (preferred if diff ≤ 800)
                 ──OR──
PR-1 ────► main (merge PR-1 first)
           │
           └──► PR-2 ────► main  (stack PR-2 on PR-1, merge second)
```

The `sdd-apply` phase MUST measure the diff at PR-creation time. If the diff > 800 lines, fall back to the chained PR-1 / PR-2 plan; otherwise ship as a single PR. The chained fallback is the safety valve, not the plan.

---

## Phase 1: Foundation (Schema + Audit)

### Task 1: Schema + audit union extension (foundation)

- **Type**: code (MODIFY)
- **Files**:
  - MODIFY `src/infrastructure/db/schema/audit-logs.ts` (~+0 / -1 line: drop `.notNull()` from `usuarioId`; the FK and `onDelete: "cascade"` stay)
  - MODIFY `src/application/use-cases/audit/write-audit-log.use-case.ts` (~+2 lines: append `| "CITA_AUTO_COMPLETED_BY_WEBHOOK"` to the `AuditAction` union; widen `WriteAuditLogInput.usuarioId` from `string` to `string | null`)
- **Spec**: REQ-VCA-WH-2 (audit action), REQ-BA-WH-1 (system-actor audit)
- **LOC est.**: ~3 lines (code only; migration in Task 2)
- **Verify**: `pnpm test:run src/application/use-cases/audit/` (existing audit tests still pass; widening `string → string | null` is backwards-compatible — every existing caller passes a real user id which IS assignable to `string | null`); `pnpm tsc --noEmit` clean.
- **Commit shape**: "1 commit: feat(audit): make audit_logs.usuario_id nullable and add CITA_AUTO_COMPLETED_BY_WEBHOOK action"
- **Status**: DONE — `src/infrastructure/db/schema/audit-logs.ts` and `src/application/use-cases/audit/write-audit-log.use-case.ts` updated; tsc clean.
- **Notes**: This task is the foundation that every downstream task depends on (Task 2 needs the schema change to generate the migration; Task 6's use case writes audit rows with `usuarioId: null` and the new union value). The schema change is one line; the union extension is one line; the type widening is one line. The existing `audit_logs.usuario_id` FK to `usuarios.id` and `onDelete: "cascade"` stay intact — existing human-actor rows are unaffected.

### Task 2: Generate Drizzle migration `0005_*.sql`

- **Type**: code (CREATE)
- **Files**:
  - CREATE `src/infrastructure/db/migrations/0005_*.sql` (~5 lines, post-edited)
  - MODIFY `src/infrastructure/db/__tests__/migrations.test.ts` (~+30 lines: extend the existing migration test to cover 0005 forward — applies cleanly, column is nullable after forward, pre-existing human-actor rows are unaffected; down migration is documented but NOT run)
- **Spec**: REQ-BA-WH-1 (audit actor), R6 mitigation
- **LOC est.**: ~35 lines (5 migration + 30 test)
- **Verify**: `pnpm drizzle-kit generate` produces a single `0005_*.sql` file containing ONLY the `ALTER TABLE "audit_logs" ALTER COLUMN "usuario_id" DROP NOT NULL;` statement (D9, OQ7=yes); if Drizzle Kit produces extra statements (e.g. a no-op `DROP DEFAULT`), post-edit the file to remove them and re-run `pnpm drizzle-kit generate` to confirm "No schema changes"; `pnpm db:migrate` applies 0005 forward without errors; `pnpm test:run src/infrastructure/db/__tests__/migrations.test.ts` passes the new forward-and-shape assertions.
- **Commit shape**: "1 commit: feat(db): add 0005 migration making audit_logs.usuario_id nullable"
- **Status**: DONE — `src/infrastructure/db/migrations/0005_massive_serpent_society.sql` created (single ALTER statement, post-edited with header comment); `pnpm db:generate` reports "No schema changes". Migration file is on disk for the user to run via `pnpm db:migrate`. Migration shape unit test added at `src/infrastructure/db/__tests__/migrations.test.ts` (forward-statement + down-documentation assertions — matches the project's no-DB unit-test pattern, 8 scenarios).
- **Notes**: The post-edit step is non-negotiable. Drizzle Kit's auto-generated shape MAY include redundant statements (e.g. `DROP DEFAULT` if the column had one — it doesn't here, but the apply phase MUST verify). The DOWN migration (`ALTER TABLE "audit_logs" ALTER COLUMN "usuario_id" SET NOT NULL;`) is documented in design §8.5 but NOT auto-generated (matches the project pattern of forward-only migrations in `0000_even_starhawk.sql` and `0001_hot_komodo.sql`). The migration test asserts the forward applies cleanly and existing human-actor rows are unaffected (a SELECT for `usuario_id IS NOT NULL` returns the expected count).

---

## Phase 2: Infra (LiveKit config + SDK + Redis)

### Task 3: Self-hosted LiveKit YAML config + Docker integration

- **Type**: code (CREATE + MODIFY)
- **Files**:
  - CREATE `docker/dev/livekit.yaml` (~15 lines: `port: 7880`, `bind_addresses: [""]`, `rtc:` block (TCP/UDP ports 7881/7882), `turn: { enabled: false }`, `webhook: { api_key: devkey, urls: [${LIVEKIT_WEBHOOK_URL:-http://host.docker.internal:3000/api/livekit/webhook}] }`, `keys: { devkey: c2VjcmV0 }` — base64 of `secret`)
  - MODIFY `docker-compose.yml` (~+5 lines: `livekit` service gets `volumes: - ./docker/dev/livekit.yaml:/etc/livekit.yaml:ro`, append `--config /etc/livekit.yaml` to the existing `--dev --bind 0.0.0.0` command, add `extra_hosts: - "host.docker.internal:host-gateway"` for Linux parity)
  - MODIFY `.env.example` (~+5 lines: append `LIVEKIT_WEBHOOK_URL=http://host.docker.internal:3000/api/livekit/webhook` with the cross-platform comment)
  - MODIFY `.env.local.example` (~+5 lines: same as `.env.example` with the dev-default value)
  - MODIFY `docs/livekit.md` (~+35 / -10 lines: ADD a "Webhooks" section after section 4 (config block, `--config` flag, cross-platform `host.docker.internal`, audit log side-effect); DELETE the existing "D10 limitation" paragraph)
- **Spec**: REQ-LI-WH-1 (Webhook Configuration), R5 + R8 mitigation
- **LOC est.**: ~55 lines (15 yaml + 5 compose + 5+5 env files + 45 docs net = ~55)
- **Verify**: `docker compose config` (if docker is available) reports the mounted volume, the `--config` flag, and the `extra_hosts` entry — manual inspection of the rendered compose is acceptable when docker is not on the dev machine; `pnpm tsc --noEmit` clean (the YAML and env files don't touch TS but the apply phase should confirm nothing is broken); visual inspection of `docker/dev/livekit.yaml` confirms the `webhook.api_key` matches `LIVEKIT_API_KEY=devkey` in `.env.local.example` (mismatch = 401 on every webhook).
- **Commit shape**: "1 commit: feat(docker): add LiveKit webhook config with docker-compose + env + docs"
- **Status**: DONE — `docker/dev/livekit.yaml`, `docker-compose.yml` (livekit service: volumes + extra_hosts + --config), `.env.example`, `.env.local.example`, `docs/livekit.md` all updated. Docker is not installed locally; manual review confirms shape matches design §3.
- **Notes**: The `keys.devkey: c2VjcmV0` is the base64-encoded form of the literal `secret` (the dev API secret per `docs/livekit.md:30`). The `devkey: <secret>` shorthand that works under `--dev` WITHOUT `--config` does NOT work once `--config` is added; the base64 form is required by LiveKit's config schema. The `extra_hosts` entry is added unconditionally (NOT behind a platform conditional) — harmless on Mac/Windows Docker Desktop, required on Linux (R8). The `LIVEKIT_WEBHOOK_URL` env var is consumed by Docker Compose when starting the `livekit` service; if unset, Docker Compose uses the `${LIVEKIT_WEBHOOK_URL:-<default>}` fallback. The user's existing `.env.local` works as-is (no manual edit needed).

### Task 4: `LiveKitServerClient.verifyWebhook` extension

- **Type**: code (MODIFY + EXTEND_TEST)
- **Files**:
  - MODIFY `src/infrastructure/livekit/livekit-server.ts` (~+20 lines: import `WebhookReceiver` and `WebhookEvent` type from `livekit-server-sdk`; add `verifyWebhook(rawBody: string, authHeader: string): WebhookEvent` method on the existing class — body is `const receiver = new WebhookReceiver(this.apiKey, this.apiSecret); return receiver.receive(rawBody, authHeader);`)
  - MODIFY `src/infrastructure/livekit/__tests__/livekit-server.test.ts` (~+90 lines: new `describe("verifyWebhook")` block with 4 scenarios — valid signature returns parsed event, invalid signature throws with `"sha256"` in the message, missing auth header throws with `"authorization header is empty"`, lazy singleton unchanged)
- **Spec**: REQ-VCA-WH-1 (Webhook Endpoint signature verification), R1 mitigation
- **LOC est.**: ~110 lines (20 code + 90 tests)
- **Verify**: `pnpm test:run src/infrastructure/livekit/__tests__/livekit-server.test.ts`; `pnpm tsc --noEmit` clean; the valid-signature test signs a real JWT with the SDK's `AccessToken` (NOT a mocked SDK) because the JWT signing IS the value being verified; the existing lazy-singleton test block at lines 106-167 of the current file passes untouched.
- **Commit shape**: "1 commit: feat(livekit): add verifyWebhook method wrapping SDK WebhookReceiver"
- **Status**: DONE — `verifyWebhook` method added at `livekit-server.ts:101-104` (async, returns `Promise<WebhookEvent>` — the SDK's `WebhookReceiver.receive` is synchronous but typing as `Promise<WebhookEvent>` keeps the signature uniform with `createRoomToken` and lets the route handler `await` it). Test file has a `describe("LiveKitServerClient.verifyWebhook")` block with 3 scenarios (valid signature returns parsed event, sha256 mismatch throws, missing auth header throws). The lazy singleton regression is covered by the pre-existing `describe("getLiveKitServerClient lazy singleton")` block.
- **Notes**: The constructor, the env-var check, the lazy singleton, and `createRoomToken` are unchanged — the new method is additive on the existing class. The `WebhookEvent` type is imported from `livekit-server-sdk`; its `event` field is a string union of all event names. Throws on signature mismatch / missing header / expired token; the route handler catches and maps to 401.

### Task 5: Redis `webhookDedupe` helper

- **Type**: code (MODIFY + CREATE)
- **Files**:
  - MODIFY `src/infrastructure/redis/cache.ts` (~+25 lines: append `export async function webhookDedupe(eventId: string, ttlSeconds = 86400): Promise<{ isNew: boolean }>` — internally `if (!redis) return { isNew: true }` for degrade-open; on success `await redis.set("livekit:webhook:${eventId}", "1", "EX", ttlSeconds, "NX")` and return `{ isNew: result === "OK" }`; on throw, return `{ isNew: true }` for degrade-open)
  - CREATE `src/infrastructure/redis/__tests__/cache.webhookDedupe.test.ts` (~110 lines: 5 scenarios — first call returns `{ isNew: true }`, second call returns `{ isNew: false }`, key shape `livekit:webhook:<eventId>`, TTL `86400` is passed, degrade-open on Redis throw)
- **Spec**: REQ-VCA-WH-1 (idempotency), R2 mitigation, AD-5
- **LOC est.**: ~135 lines (25 code + 110 tests)
- **Verify**: `pnpm test:run src/infrastructure/redis/`; `pnpm tsc --noEmit` clean; the `redis` client is the existing graceful-null singleton from `src/infrastructure/redis/index.ts` (no new connection setup); the key namespace `livekit:webhook:` matches the existing `slots:` pattern in the same file.
- **Commit shape**: "1 commit: feat(redis): add webhookDedupe helper with degrade-open on unreachable"
- **Notes**: Degrade-open on Redis unreachable is intentional (AD-5): a `cache miss` that incorrectly returns `{ isNew: false }` would silently drop legitimate events when Redis is down — much worse than a stale replay that re-runs the use case (the use case is itself idempotent — terminal states are no-ops, the optimistic UPDATE catches races). The 24h TTL is generous but bounded (covers any realistic retry window while bounding memory footprint).

---

## Phase 3: Domain (Use case + Audit)

### Task 6: `autoCompleteOnRoomFinishedUseCase`

- **Type**: code (CREATE)
- **Files**:
  - CREATE `src/application/use-cases/bookings/auto-complete-on-room-finished.use-case.ts` (~110 lines: full pipeline per design §7 — parse UUID from `event.room.name` via `/^cita-([0-9a-f-]{36})$/`, load cita, modality gate (PRESENCIAL → throw `FORBIDDEN`), terminal-state no-op (COMPLETADA/CANCELADA/NO_ASISTIO), non-EN_CURSO no-op (PENDIENTE/CONFIRMADA), target state from `event.room.num_participants` (≥1 → COMPLETADA, 0 → NO_ASISTIO), atomic `UPDATE citas SET estado = ? WHERE id = ? AND estado = 'EN_CURSO'` with `rowCount === 0` → race lost, audit row with `usuarioId: null` + `accion: "CITA_AUTO_COMPLETED_BY_WEBHOOK"`)
  - MODIFY `src/application/index.ts` (~+3 lines: re-export `autoCompleteOnRoomFinishedUseCase` + `AutoCompleteOnRoomFinishedInput` / `AutoCompleteOnRoomFinishedOutput` types)
  - CREATE `src/application/use-cases/bookings/__tests__/auto-complete-on-room-finished.test.ts` (~250 lines: 7 scenarios per design §7.2 — ≥1 participant → COMPLETADA, 0 participants → NO_ASISTIO, PRESENCIAL rejected, terminal-state no-op (COMPLETADA + CANCELADA + NO_ASISTIO parameterized), non-EN_CURSO no-op (CONFIRMADA), race lost (mock UPDATE returns empty), audit row shape)
- **Spec**: REQ-VCA-WH-2 (Auto-Completion Use Case), REQ-BA-WH-1, R3/R4/R11/R12 mitigation
- **LOC est.**: ~363 lines (113 code + 250 tests)
- **Verify**: `pnpm test:run src/application/use-cases/bookings/__tests__/auto-complete-on-room-finished.test.ts`; `pnpm tsc --noEmit` clean; mock `getDb()` (or use a test DB) and `writeAuditLogUseCase` via `vi.mock("@/application")`; assert the atomic UPDATE uses `eq(schema.citas.estado, ConsultationStatus.EN_CURSO)` in the WHERE clause (the compare-and-swap primitive, AD-7); assert the audit call has `usuarioId: null` (system actor, AD-10) and `accion: "CITA_AUTO_COMPLETED_BY_WEBHOOK"`.
- **Commit shape**: "1 commit: feat(bookings): add autoCompleteOnRoomFinishedUseCase with optimistic UPDATE + audit"
- **Status**: DONE — use case implemented at `src/application/use-cases/bookings/auto-complete-on-room-finished.use-case.ts` (~229 lines; matches the design's intent). Barrel exports added at `src/application/index.ts:30-34`. Test file created at `src/application/use-cases/bookings/__tests__/auto-complete-on-room-finished.test.ts` (~9 scenarios: the 7 design scenarios + 2 bonus scenarios — invalid room name (BAD_REQUEST) and cita not found (NOT_FOUND)).
- **Notes**: The use case is NOT wrapped in a tRPC procedure (AD-9 / D6 step 14) — only the route handler invokes it. Its safety comes from being reachable only by the trusted route handler, which validates the LiveKit signature first. The use case NEVER calls `updateAppointmentStatusUseCase` — that path is doctor-only and would fail the `cita.doctorId !== actor.doctorId` check. The system-actor path is a separate audit story with `usuarioId: null`.

**Note on signature shape**: The actual on-disk implementation uses `(db, input)` — the project's canonical pattern (matches `getRoomTokenUseCase(db, input)`, `updateAppointmentStatusUseCase(db, input)`, etc.). The design's pseudocode showed `(event)` with an internal `getDb()` call; the implementer chose the project-consistent shape. The route handler imports `db` from `@/infrastructure/db` and passes it. No deviation in behavior — the design's `(event)` form would have called `getDb()` from inside the use case, but the use case layer's Clean Architecture contract is "the caller provides the db handle".

---

## Phase 4: Integration (Route handler)

### Task 7: Webhook route handler `POST /api/livekit/webhook`

- **Type**: code (CREATE)
- **Files**:
  - CREATE `src/app/api/livekit/webhook/route.ts` (~85 lines: Next.js App Router POST handler — `rawBody = await req.text()`, `authHeader = req.headers.get("authorization") ?? ""`, `try { event = getLiveKitServerClient().verifyWebhook(rawBody, authHeader) } catch { return 401 }`, parse early `if (!event?.event) return 400`, `const { isNew } = await webhookDedupe(event.id); if (!isNew) return 200 { ok: true, deduped: true }`, `if (event.event !== "room_finished") return 200 { ok: true, ignored: event.event }`, `try { const result = await autoCompleteOnRoomFinishedUseCase(event); return 200 { ok: true, ...result } } catch { return 200 { ok: false, error: "internal" } }`; export `runtime = "nodejs"` and `dynamic = "force-dynamic"`)
  - CREATE `src/app/api/livekit/__tests__/route.test.ts` (~210 lines: 5 scenarios — valid signature → 200 + dispatch called, invalid signature → 401 + no dispatch, dedupe hit → 200 + no dispatch, dedupe miss → dispatch called, dispatch called with correct event payload; mock `getLiveKitServerClient().verifyWebhook`, `webhookDedupe`, and `autoCompleteOnRoomFinishedUseCase` via `vi.mock(...)`)
- **Spec**: REQ-VCA-WH-1 (Webhook Endpoint), R1/R2/R10 mitigation, AD-1/AD-3
- **LOC est.**: ~295 lines (85 code + 210 tests)
- **Verify**: `pnpm test:run src/app/api/livekit/__tests__/route.test.ts`; `pnpm tsc --noEmit` clean; the route handler test mocks the SDK and use case (R10 — CI does NOT need a running LiveKit container); assert the handler reads the body via `await req.text()` (NOT `req.json()` — AD-3, the signature hashes the raw bytes); assert the 200-OK-on-use-case-throw behavior (LiveKit stops retrying on internal errors).
- **Commit shape**: "1 commit: feat(api): add POST /api/livekit/webhook route handler with signature + dedupe + dispatch"
- **Status**: DONE — route handler created at `src/app/api/livekit/webhook/route.ts` (~115 lines including comments). Test file created at `src/app/api/livekit/__tests__/route.test.ts` (~225 lines, 8 scenarios — the 5 design scenarios + 3 bonus: missing auth header → 401, non-room_finished → 200 ignored, use case throws → 200 `{ok:false}`, parsed event missing `event` field → 400). `runtime = "nodejs"` and `dynamic = "force-dynamic"` exported.
- **Notes**: The route handler is the trust boundary — NOT a tRPC procedure (AD-1), NOT under `/api/trpc/`. The trust boundary sits OUTSIDE the tRPC schema because LiveKit's webhook POST is untrusted input that must be parsed with the raw body intact for signature verification. The handler returns 200 OK for every event LiveKit could send, including use-case throws (so LiveKit stops retrying) — only signature failure returns 401, only malformed body returns 400. The dedupe step runs for ALL events so a replay of any event family cannot re-run a side effect.

---

## Phase 5: UI Cleanup (D10 footer removal)

### Task 8: D10 footer removal from call page

- **Type**: code (MODIFY + EXTEND_TEST)
- **Files**:
  - MODIFY `src/app/citas/[id]/llamada/page.tsx` (~-12 lines: DELETE the D10 footer `<p>` block — "Si la videollamada termina, recuerda marcar la cita como completada en la página de la cita..." — at lines 156-167; the closing `</div>` for the outer container stays)
  - MODIFY `src/app/citas/[id]/llamada/__tests__/page.test.tsx` (~+20 / -10 lines: DELETE any assertion that the footer text `"quedará en 'En curso'"` or the `<Link>` to `/citas/${citaId}` is rendered; ADD assertion that no element in the DOM contains `"quedará en 'En curso'"` and no `<Link>` with text matching `"página de la cita"` is rendered — runs in all three states per REQ-VCU-WH-1)
- **Spec**: REQ-VCU-WH-1 (D10 footer REMOVED)
- **LOC est.**: ~-2 lines net (12 deleted, 20 added, 10 deleted = -2)
- **Verify**: `pnpm test:run src/app/citas/[id]/llamada/`; `pnpm tsc --noEmit` clean; `pnpm lint` clean; the call page renders without the footer confession in all three states (loading, error, success); the `<LiveKitRoom>` above is unchanged.
- **Commit shape**: "1 commit: feat(ui): remove D10 limitation footer from call page (webhook now handles auto-completion)"
- **Status**: DONE — `src/app/citas/[id]/llamada/page.tsx`: the D10 `<p>` block (original lines 156-167) is replaced by a comment block explaining the removal and pointing to `video-calls-ui/spec.md REQ-VCU-WH-1`. The closing `</div>` of the outer container stays. `src/app/citas/[id]/llamada/__tests__/page.test.tsx`: the previous "renders the D10 footer note with a link to /citas/{citaId}" test (in the success describe) is replaced with "does NOT render the D10 limitation footer" assertions for the success state. Two new tests added in the loading and error describes to assert the footer is absent in all three states (REQ-VCU-WH-1 acceptance criterion).
- **Notes**: AD-15 — the footer was a "we know this is broken" confession; after this change, it's not broken anymore. The audit log carries the traceability; the call page shows the current state, period. The doctor's existing "Completar" / "No asistio" buttons on the detail page stay (UX simplification is a follow-up `call-page-ux-redesign`).

---

## Phase 6: Cross-PR Verification (Final)

### Task 9: Cross-PR verification (full suite + final gates)

- **Type**: verify
- **Files**:
  - (no code changes — verification only)
  - The 4 spec delta files (`livekit-infrastructure`, `video-calls-api`, `booking-api`, `video-calls-ui`) are already created by the `sdd-spec` phase and visible in the PR description for traceability
- **Spec**: All 5 REQ-IDs (REQ-LI-WH-1, REQ-VCA-WH-1, REQ-VCA-WH-2, REQ-BA-WH-1, REQ-VCU-WH-1)
- **LOC est.**: 0 lines (verification only)
- **Verify**:
  1. `pnpm test:run` — all green; the 4 new test files (use case + route + dedupe + migration) + 2 extended test files (`livekit-server.verifyWebhook`, call page footer) pass; the 6 prior PR test files from `modality-toggle` and `video-calls` still pass; no regressions. ~20 new scenarios total.
  2. `pnpm tsc --noEmit` — clean (the `AuditAction` union extension + `WriteAuditLogInput.usuarioId: string | null` widening + `LiveKitServerClient.verifyWebhook` method + new use case types flow through the type system).
  3. `pnpm lint` — clean.
  4. `pnpm build` — succeeds (Next.js production build catches route handler config issues like missing `runtime = "nodejs"`).
  5. `pnpm drizzle-kit generate` — reports "No schema changes" (confirms the migration matches the schema, no drift).
  6. **Manual webhook smoke test**: `docker compose up -d livekit`, open an ONLINE cita in a browser, both participants join the call, both leave → observe the `audit_logs` row with `accion: 'CITA_AUTO_COMPLETED_BY_WEBHOOK'` and the cita transitions to `COMPLETADA`. Repeat with nobody joining → cita transitions to `NO_ASISTIO`. Test the signature failure path by `curl -X POST .../api/livekit/webhook -H 'Authorization: bogus' -d '{}'` → 401.
- **Commit shape**: no commit (verification gate)
- **Notes**: This is the final pre-merge gate. The PR description MUST include: a "How to verify" section with the manual smoke test + curl command; a "Risk notes" section pointing to R1 (forged webhooks — mitigated by signature verification), R2 (replay attacks — mitigated by Redis dedupe), R5 (self-hosted LiveKit not configured — mitigated by the same PR), R6 (audit_logs.usuario_id not nullable — mitigated by Task 1 + 2), R8 (Linux parity — mitigated by `extra_hosts`). When all 6 verification gates pass, the change is ready for `sdd-archive` to sync the delta specs into `openspec/specs/`. If the single-PR diff exceeds 800 lines at PR-creation time, fall back to the chained PR-1 (Tasks 1-5) / PR-2 (Tasks 1-2 + 6-8) split per design §10.4.

---

## Cross-cutting: commit shape per task (work-unit-commits)

Per the `work-unit-commits` skill, each task is a single work unit that can stand alone as a reviewable commit. The commit shapes (one per task):

| Task | Commit message |
|------|----------------|
| Task 1 | `feat(audit): make audit_logs.usuario_id nullable and add CITA_AUTO_COMPLETED_BY_WEBHOOK action` |
| Task 2 | `feat(db): add 0005 migration making audit_logs.usuario_id nullable` |
| Task 3 | `feat(docker): add LiveKit webhook config with docker-compose + env + docs` |
| Task 4 | `feat(livekit): add verifyWebhook method wrapping SDK WebhookReceiver` |
| Task 5 | `feat(redis): add webhookDedupe helper with degrade-open on unreachable` |
| Task 6 | `feat(bookings): add autoCompleteOnRoomFinishedUseCase with optimistic UPDATE + audit` |
| Task 7 | `feat(api): add POST /api/livekit/webhook route handler with signature + dedupe + dispatch` |
| Task 8 | `feat(ui): remove D10 limitation footer from call page (webhook now handles auto-completion)` |
| Task 9 | (verification gate, no commit) |

Tasks 1 + 2 are the foundation (must land first); Tasks 3 + 4 + 5 are infra (parallel); Task 6 is domain (depends on Tasks 1+2); Task 7 is integration (depends on Tasks 4+5+6); Task 8 is UI cleanup (independent); Task 9 is the final verify gate. If the diff lands over 800 lines and the chained fallback fires: PR-1 = Tasks 1-5 (infra, ~400 lines), PR-2 = Tasks 1-2 (re-applied on top of PR-1) + 6-8 (domain, ~400 lines).

---

## Open dependencies

**None for the implementation.** All required changes are within this change. The video-calls change (`2026-06-16`, archived) provides the `LiveKitServerClient`, the `livekit-server-sdk@2.15.4` dependency, the `livekit` Docker service, and the call page footer that this change removes. The modality-toggle change (`2026-06-19`, archived) provides the `citas.modalidad` column, the `ConsultaModalidad` enum, the `getRoomToken` modality gate, and the audit-log write pattern that this change reuses. No new third-party dependencies, no new feature flags, no new i18n keys.

External (out of scope) follow-ups that BLOCK on this change:

- `livekit-recording` — recording / egress webhooks (the route handler returns 200 OK no-op for `egress_*` and `track_*` events; the dedupe + dispatch infrastructure is in place).
- `call-page-ux-redesign` — remove or relabel the doctor's redundant "Completar" / "No asistio" buttons (the webhook fires first, so the buttons are mostly redundant after this change).
- `livekit-tls-prod` — TLS certs + production domain (pre-existing follow-up from video-calls; the webhook handler is the same in prod, only the LiveKit config block changes).
- `livekit-turn-prod` — production TURN server (pre-existing follow-up from video-calls).
- `livekit-pin-image` — pin `livekit-server:latest` to a digest (R9, accepted risk, deferred per video-calls D6 precedent).
- `cita-eventing` — Slack/email notification on `room_finished` (audit log is the local source of truth).
- `livekit-room-name-persistence` — write the derived `citas.livekit_room_name` column for debugging (R7 — currently unused).
- `doctor-cita-realtime` — real-time doctor notification when a cita auto-completes (toast on the next page load is the MVP).
- `livekit-secret-rotation` — multi-tenant webhook secret rotation window (single-secret is fine for self-hosted).

## Out of scope reminders

The following items are explicitly NOT in this change (per the proposal's "Out of Scope" table and the design's §13). They are deferred to follow-up changes:

1. **Recording / egress webhooks** — the route handler returns 200 OK no-op for `egress_*` events (D5). **Future change**: `livekit-recording`.
2. **Call-page UX simplification** — the doctor's "Completar" / "No asistio" buttons stay (AD-15). The audit log is the patient-side cue. **Future change**: `call-page-ux-redesign`.
3. **TLS / production TURN / image pin** — same risk profile as the existing setup. **Future changes**: `livekit-tls-prod`, `livekit-turn-prod`, `livekit-pin-image` (pre-existing follow-ups from video-calls).
4. **`updateAppointmentStatusUseCase` extension to skip the doctor check** — explicitly rejected (AD-9). System actors use a separate path with separate audit actors for clarity. Two paths, two actors, no privilege escalation surface.
5. **LiveKit room name in the cita row** — `citas.livekit_room_name` exists but is unused; the webhook handler parses from `event.room.name` via regex (R7). **Future change**: `livekit-room-name-persistence`.
6. **External eventing** — Slack/email notifications. **Future change**: `cita-eventing`.

The `sdd-apply` phase MUST NOT add any of the above. The `sdd-archive` report MUST call out R7 and R9 in the archive notes so the next reviewer scanning the diff sees them.

## Decisions made during planning

**None.** All 11 default decisions (D1-D11) and all 16 architecture decisions (AD-1..AD-16) from the proposal are honored verbatim. The single-PR plan with chained fallback matches D10 / AD-12. The soft exception over the canonical 400-line cap is documented above (single PR at the user's cached 800-line budget; chained fallback mechanically defined per design §10.4) — no new decisions are made at the tasks phase; the design and proposal are the authoritative sources.

The 6 out-of-scope reminders above are reaffirmed from the proposal's "Out of Scope" table — no re-litigation at the tasks phase.

---

## Summary for the Orchestrator

**Tasks file**: `openspec/changes/2026-06-19-livekit-webhooks/tasks.md` (this file)
**Mode**: auto / 800-line budget
**Delivery**: single PR (~800 lines), chained fallback (`stacked-to-main`) if >800
**Total tasks**: 9 (Tasks 1-9 organized in 6 phases: Foundation, Infra, Domain, Integration, UI Cleanup, Verify)
**Review workload forecast verdict**: Single PR is at the user's cached 800-line D2 budget; canonical 400-line cap exceeded but both chained slices fit comfortably. Chained fallback is mechanically defined (D10 / AD-12) — the apply phase MUST measure the diff at PR-creation time and fall back to PR-1 (Tasks 1-5) + PR-2 (Tasks 1-2 + 6-8) if the diff > 800.
**Decision needed before apply**: No
**Chain strategy**: `stacked-to-main`

**Next step**: `sdd-apply` — implement Tasks 1-9 in dependency order. Each task is a reviewable work unit; the apply phase commits one task per work unit (per the `work-unit-commits` skill) with the commit shape documented above. The `sdd-verify` phase runs the cross-PR verification gates from Task 9 (test + tsc + lint + build + drizzle-kit + manual webhook smoke test).

> Archived on 2026-06-20