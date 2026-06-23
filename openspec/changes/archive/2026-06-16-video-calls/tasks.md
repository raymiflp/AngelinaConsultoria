# Tasks — Video Calls (`video-calls`)

> Auto-forecast mode. Review budget: 800 lines. Delivery: chained PRs (`stacked-to-main`).

**Change ID**: `2026-06-16-video-calls`
**Mode**: auto / 800-line budget
**Delivery**: chained PRs (stacked-to-main)
**Total estimated lines**: ~1,220 (UI + tests + specs)
**Split**:
- **PR-1** (Data + API + specs): ~580 lines — independently testable via tRPC client
- **PR-2** (UI + tests): ~640 lines — ships the call page and join button

**Note on paths**: The design phase reconciled the path references against the actual codebase. Key facts used in this task file:

- The `AuditAction` type lives at `src/application/use-cases/audit/write-audit-log.use-case.ts` (not `src/domain/enums/index.ts` as the user prompt's task 3.1 suggested). The spec allows either location; the design picked the audit use case to keep the union co-located with the writer. This task file follows the design.
- The `livekit_room_name` column is `varchar(128)` per the spec (`REQ-DB-VC-1`) and the design's `§5.1`, not `text` as the user prompt's task 1.1 suggested. The Drizzle migration's `ALTER TABLE` statement will reflect `varchar(128)`.
- `JoinCallButton` lives at `src/components/booking/JoinCallButton.tsx` (the existing `src/components/booking/` barrel houses `StatusBadge`, `AppointmentCard`, and `SlotGrid`).
- The detail page `src/app/citas/[id]/page.tsx` is already a `"use client"` component, so mounting `<JoinCallButton>` is an additive change with no refactor.
- The `.env.example` placeholders use `changeme` / `changeme-in-prod` per the spec's `REQ-LK-INF-2` (the dev defaults `devkey` / `secret` are the comment explanation, not the placeholder values). This is a deviation from the design's prose, which is silent on the exact placeholder text; the spec wins because it carries the assertion in a scenario.
- The use case pattern is `useCase(db as never, input)` (matches the existing `bookings.ts` procedures). The `db` is cast to `never` to satisfy the tRPC context's `db` type without bloating the test mocks.
- The `livekit-server-sdk` package version is pinned to an exact version (no `^`) per the risk-register entry for SDK drift. The apply phase will pick the version that matches the existing `@livekit/components-react@2.9.4` / `livekit-client@2.11.4` release line.

---

## PR-1 — Data + API + Specs

**Goal**: Land the data plane (column + migration + domain getter), the LiveKit server client wrapper, the `getRoomToken` use case, the tRPC procedure, the audit enum extension, the Docker service, and the env vars. After PR-1, the `bookings.getRoomToken` procedure is callable from the tRPC client and returns a valid JWT, but no UI calls it yet.

**Base branch**: `main`. PR-1 merges to `main` first; PR-2 branches off `main` after PR-1 lands.

**Status**: ✅ APPLIED (2026-06-16). PR-1 data + API + specs are in place. Quality gates: type-check clean (only the 3 pre-existing errors in `DoctorExperience.test.tsx` / `DoctorHero.test.tsx` remain, out of scope), 386 tests pass (50 files, 26 new), lint exits 0 (warnings only, all pre-existing), `pnpm db:generate` produced `0003_good_colonel_america.sql` with the single `ALTER TABLE "citas" ADD COLUMN "livekit_room_name" varchar(128);` statement.

### Group 1: Database & Domain

#### Task 1.1 — Add `livekit_room_name` column to `citas` schema

| Field | Value |
|---|---|
| **Files** | `src/infrastructure/db/schema/citas.ts` (MODIFY, +3 lines) |
| **Description** | Add `livekitRoomName: varchar("livekit_room_name", { length: 128 })` to the `citas` table definition, placed after the `notas` column with a single-line comment explaining the column is reserved for future use and unused in MVP. The column MUST be nullable (no `.notNull()`), have no default, no index, no unique constraint, no foreign key — per `REQ-DB-VC-1`. The import block is unchanged (`varchar` is already imported). The existing columns and indexes MUST be untouched. |
| **Acceptance criteria** | 1. `livekitRoomName: varchar("livekit_room_name", { length: 128 })` is in the schema ✅<br/>2. The column has no `.notNull()`, no `.default(...)`, no index, no unique, no FK ✅<br/>3. `pnpm db:generate` produces a new `0003_*.sql` with a single `ALTER TABLE "citas" ADD COLUMN "livekit_room_name" varchar(128);` statement ✅<br/>4. The DOWN step is `ALTER TABLE "citas" DROP COLUMN "livekit_room_name";` ✅<br/>5. Existing columns and indexes are unchanged ✅ |
| **Dependencies** | None |
| **Estimated lines** | ~3 |

#### Task 1.2 — Add `Cita.livekitRoomName` getter

| Field | Value |
|---|---|
| **Files** | `src/domain/entities/cita.ts` (MODIFY, +5 lines) |
| **Description** | Add a `get livekitRoomName(): string` property accessor to the `Cita` class. The getter MUST return the exact string `cita-${this.id}` (4-char prefix `cita-` followed by the cita's id verbatim, no transformation, no lowercasing of UUID hex characters). The constructor signature MUST NOT change. The getter MUST NOT read any DB column. A JSDoc comment on the getter MUST explain it is the source of truth in MVP and that the `citas.livekit_room_name` column is reserved for future use. |
| **Acceptance criteria** | 1. `cita.livekitRoomName` returns `"cita-<uuid>"` for any cita instance ✅<br/>2. The result matches `/^cita-[0-9a-f-]{36}$/` ✅<br/>3. The declaration is a `get` accessor (not a method) — `typeof cita.livekitRoomName === "string"` ✅<br/>4. The constructor signature is unchanged ✅<br/>5. The existing `Cita.create()` factory works as before (no new required argument) ✅<br/>6. Existing tests in `src/domain/entities/__tests__/cita.test.ts` pass without modification ✅ |
| **Dependencies** | 1.1 (the column is added even though the getter does not read it) |
| **Estimated lines** | ~5 |

#### Task 1.3 — Test for `Cita.livekitRoomName` getter

| Field | Value |
|---|---|
| **Files** | `src/domain/entities/__tests__/cita.test.ts` (MODIFY, +30 lines) |
| **Description** | Append a new `describe("livekitRoomName getter", ...)` block to the existing test file. Cover 4 scenarios per the spec's `REQ-DE-VC-1` scenarios: (1) returns the documented `cita-${id}` format and matches the regex; (2) is a property accessor (not a method — `typeof === "string"`); (3) is pure and does not read the DB column (assert the same value is returned for a `Cita` constructed via `Cita.create({...})` which has no column knowledge); (4) does not mutate state across 100 accesses. Reuse the existing `futureDate()` helper. No DB mocks needed. |
| **Acceptance criteria** | 1. Test 1: getter returns `cita-<uuid>` and matches the regex ✅<br/>2. Test 2: `typeof cita.livekitRoomName === "string"` and `cita.livekitRoomName` is not a function ✅<br/>3. Test 3: two citas with different `id`s return different room names; the getter does not consult the DB ✅<br/>4. Test 4: 100 accesses of the getter return identical values and the cita is unchanged ✅<br/>5. Existing 7 tests still pass ✅ |
| **Dependencies** | 1.2 |
| **Estimated lines** | ~30 |

**Group 1 subtotal**: ~38 lines

### Group 2: LiveKit Server Client & Env Validation

#### Task 2.1 — Create `LiveKitServerClient` wrapper

| Field | Value |
|---|---|
| **Files** | `src/infrastructure/livekit/livekit-server.ts` (NEW, ~50 lines)<br/>`src/infrastructure/livekit/index.ts` (NEW — barrel, +1 line) |
| **Description** | Create a new `src/infrastructure/livekit/` directory. Implement the `LiveKitServerClient` class per the design's `§5.3`: private fields for `apiKey`, `apiSecret`, `serverUrl`; constructor reads `process.env.LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `NEXT_PUBLIC_LIVEKIT_URL` and throws a clear `Error` at construction time if any is missing. The error message MUST be exactly: `"LiveKit env vars missing. Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET in .env.local. See docs/livekit.md for setup."` (single string, can be concatenated). Implement `async createRoomToken({ identity, roomName, ttl })` that builds an `AccessToken` with `roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false` grants and returns `{ token, serverUrl, roomName }`. Export a module-level singleton `livekitServerClient = new LiveKitServerClient()` so the eager env-var check fires at module import (per AD-7 / `REQ-LK-INF-4`). Create a barrel `index.ts` re-exporting the singleton + the type. |
| **Acceptance criteria** | 1. The class is exported from `src/infrastructure/livekit/livekit-server.ts` ✅<br/>2. The singleton `livekitServerClient` is exported ✅<br/>3. The constructor reads all three env vars and throws the documented error if any is missing ✅<br/>4. `createRoomToken` returns `{ token, serverUrl, roomName }` with the documented grant shape ✅<br/>5. The module-level singleton instantiation means the env-var check is eager (boot-time, not per-request) ✅<br/>6. The barrel re-exports the singleton and types ✅ |
| **Dependencies** | 2.2 (the `livekit-server-sdk` package must be installed) |
| **Estimated lines** | ~50 (impl) + 1 (barrel) |

#### Task 2.2 — Add LiveKit server SDK dependency

| Field | Value |
|---|---|
| **Files** | `package.json` (MODIFY, +1 line) |
| **Description** | Add `livekit-server-sdk` to `dependencies` in `package.json`, pinned to an exact version (no `^` per the risk-register entry for SDK drift). The version MUST match the `livekit-client` / `@livekit/components-react` release line already in the project (apply phase will pin the exact `2.x.y` that ships in lockstep with `livekit-client@2.11.4`). No new client-side deps are needed; `@livekit/components-react` and `livekit-client` are already in `package.json` from earlier prep work. |
| **Acceptance criteria** | 1. `"livekit-server-sdk": "2.x.y"` (exact, no caret) is in `dependencies` ✅<br/>2. `pnpm install` succeeds ✅<br/>3. `pnpm type-check` resolves the new import in `livekit-server.ts` ✅ |
| **Dependencies** | None |
| **Estimated lines** | ~1 |

#### Task 2.3 — Test for `LiveKitServerClient` env-var validation

| Field | Value |
|---|---|
| **Files** | `src/infrastructure/livekit/__tests__/livekit-server.test.ts` (NEW, ~50 lines) |
| **Description** | Vitest. Use `vi.resetModules()` in `beforeEach` to clear the module cache so each test re-imports the module with a fresh env. Cover 3 scenarios per the spec's `REQ-LK-INF-4`: (1) all env vars set → import succeeds and `livekitServerClient` is an instance of `LiveKitServerClient`; (2) `LIVEKIT_API_KEY` unset → import throws an `Error` whose message contains `"LiveKit env vars missing"`, `"LIVEKIT_API_KEY"`, `"LIVEKIT_API_SECRET"`, and `"docs/livekit.md"`; (3) `LIVEKIT_API_SECRET` unset → same documented error. Save/restore the original env values in `afterEach`. |
| **Acceptance criteria** | 1. Scenario 1: module import succeeds, singleton is an instance, second import returns the same reference (Node module cache) ✅<br/>2. Scenario 2: `LIVEKIT_API_KEY` unset throws with the documented message fragments ✅<br/>3. Scenario 3: `LIVEKIT_API_SECRET` unset throws with the documented message fragments ✅<br/>4. No test depends on a real LiveKit network connection ✅<br/>5. Env vars are restored after each test (no leakage to other tests) ✅ |
| **Dependencies** | 2.1 |
| **Estimated lines** | ~50 |

**Group 2 subtotal**: ~102 lines

### Group 3: Audit Action Enum Extension

#### Task 3.1 — Add `CITA_ROOM_TOKEN_ISSUED` to the `AuditAction` union

| Field | Value |
|---|---|
| **Files** | `src/application/use-cases/audit/write-audit-log.use-case.ts` (MODIFY, +1 line) |
| **Description** | Append `\| "CITA_ROOM_TOKEN_ISSUED"` as the last variant of the `AuditAction` union in `src/application/use-cases/audit/write-audit-log.use-case.ts`. The extension is purely additive — no existing variants are removed, reordered, or renamed. The change preserves the `AuditAction` type alias exported from this file and re-exported by `src/application/index.ts`. Per the spec's `REQ-VC-API-6`, the value `"CITA_ROOM_TOKEN_ISSUED"` MUST be accepted by any function typed `accion: AuditAction` after the change. |
| **Acceptance criteria** | 1. `AuditAction` includes `"CITA_ROOM_TOKEN_ISSUED"` as a new variant ✅<br/>2. All 8 prior variants (`"CITA_CREATED"`, `"CITA_CANCELLED"`, `"CITA_STATUS_CHANGED"`, `"CITA_NOTES_UPDATED"`, `"PROFILE_UPDATED"`, `"DOCTOR_AVAILABILITY_UPDATED"`, `"PATIENT_LIST_VIEWED"`, `"APPOINTMENT_LIST_VIEWED"`) are still present and in the original order ✅<br/>3. `pnpm type-check` clean — no compile errors at any existing call site (the union extension is backward-compatible) ✅<br/>4. The `src/application/index.ts` barrel re-exports the updated `AuditAction` type without changes ✅ |
| **Dependencies** | None (the union extension is a standalone type change) |
| **Estimated lines** | ~1 |

**Group 3 subtotal**: ~1 line

### Group 4: GetRoomToken Use Case

#### Task 4.1 — Create `getRoomTokenUseCase`

| Field | Value |
|---|---|
| **Files** | `src/application/use-cases/bookings/get-room-token.use-case.ts` (NEW, ~115 lines) |
| **Description** | Create the use case per the design's `§5.4`. Signature: `getRoomTokenUseCase(db: NodePgDatabase<typeof schema>, input: GetRoomTokenInput): Promise<GetRoomTokenOutput>`. The input type is `{ citaId: string; actor: { id: string; role: UserRole } }`. The output type is `{ token: string; serverUrl: string; roomName: string }`. Logic: (1) load the cita with `db.select({...}).from(citas).innerJoin(doctores, ...).innerJoin(pacientes, ...).where(eq(citas.id, input.citaId)).limit(1)`; (2) if no row OR the actor is not the cita's `doctor.usuarioId` and not the cita's `paciente.usuarioId`, throw `TRPCError({ code: "NOT_FOUND" })` (per AD-11 the NOT_FOUND shape is identical for both cases to avoid leaking cita existence); (3) evaluate the status + time-window gate: `EN_CURSO` passes unconditionally, `CONFIRMADA` with `Math.abs(Date.now() - fechaHora.getTime()) <= 15 * 60 * 1000` passes, `PENDIENTE` throws `FORBIDDEN` with `"La cita debe estar confirmada antes de unirse a la videollamada."`, `CONFIRMADA` outside the window throws `FORBIDDEN` with `"La videollamada se habilita 15 minutos antes de la hora de la cita."`, anything else (`COMPLETADA` / `CANCELADA` / `NO_ASISTIO`) throws `FORBIDDEN` with `"Esta cita ya no permite unirse a una videollamada."`; (4) call `livekitServerClient.createRoomToken({ identity: \`${actor.role.toLowerCase()}-${actor.id}\`, roomName: \`cita-${row.id}\`, ttl: "1h" })` and return its result. The use case does NOT write the audit log (per AD-12, the audit call lives in the procedure). The use case does NOT import `writeAuditLogUseCase`. |
| **Acceptance criteria** | 1. The use case function is exported as `getRoomTokenUseCase` ✅<br/>2. The function signature matches `{ citaId, actor: { id, role } }` input and `{ token, serverUrl, roomName }` output ✅<br/>3. The `SELECT` joins `citas` + `doctores` + `pacientes` and returns `doctorUsuarioId` + `pacienteUsuarioId` + `fechaHora` + `estado` + `id` in a single query ✅<br/>4. Non-participant throws `NOT_FOUND` with the same shape as the non-existent cita case ✅<br/>5. Each of the 5 documented error messages is thrown for the matching gate case ✅<br/>6. `EN_CURSO` returns a token regardless of time; `CONFIRMADA` returns a token iff within the symmetric ±15 min window ✅<br/>7. The room name is `cita-${row.id}` (server-side derived, NOT from the DB column) ✅<br/>8. The identity is `${role.toLowerCase()}-${id}` (e.g. `doctor-<uuid>` / `paciente-<uuid>`) ✅<br/>9. The TTL is `"1h"` ✅ |
| **Dependencies** | 1.1 (schema column for forward-compat — the use case does not read it), 1.2 (getter is the canonical source of the room name in tests), 2.1 (`livekitServerClient` singleton), 3.1 (not strictly required for the use case code but the procedure in 5.1 needs it) |
| **Estimated lines** | ~115 |

#### Task 4.2 — Re-export the new use case from the application barrel

| Field | Value |
|---|---|
| **Files** | `src/application/index.ts` (MODIFY, +3 lines) |
| **Description** | Add a `// ── Bookings (video-calls) ──` section (or append to the existing `// ── Bookings ──` section) with three lines: re-export `getRoomTokenUseCase` from `./use-cases/bookings/get-room-token.use-case`, re-export `GetRoomTokenInput` and `GetRoomTokenOutput` from the same file as types. The new lines go after the existing `getMyAppointmentsUseCase` export to preserve the existing section ordering. |
| **Acceptance criteria** | 1. `import { getRoomTokenUseCase, type GetRoomTokenInput, type GetRoomTokenOutput } from "@/application"` resolves ✅<br/>2. The procedure in task 5.1 can import the use case from `@/application` ✅<br/>3. Existing 6 bookings re-exports are untouched ✅ |
| **Dependencies** | 4.1 |
| **Estimated lines** | ~3 |

#### Task 4.3 — Test for `getRoomTokenUseCase`

| Field | Value |
|---|---|
| **Files** | `src/application/use-cases/bookings/__tests__/get-room-token.test.ts` (NEW, ~160 lines) |
| **Description** | Vitest. Mock the Drizzle query chain with `vi.fn()` returning canned rows and mock `livekitServerClient.createRoomToken` with `vi.spyOn` to return a fixture `{ token: "jwt-fixture", serverUrl: "ws://localhost:7880", roomName: "cita-<id>" }`. Use `vi.useFakeTimers()` to pin `Date.now()` to a known instant so the symmetric window can be asserted without flake. Cover 8 scenarios per the spec's `REQ-VC-API-2` and `REQ-VC-API-3`: (1) cita not found → `NOT_FOUND`; (2) non-participant (neither doctor.usuarioId nor paciente.usuarioId matches) → `NOT_FOUND` with the same shape as case 1; (3) doctor participant passes auth; (4) patient participant passes auth; (5) `PENDIENTE` → `FORBIDDEN` + Spanish message; (6) `CONFIRMADA` +30 min future → `FORBIDDEN` + Spanish message; (7) `CONFIRMADA` -10 min past → returns token (symmetric window); (8) `CONFIRMADA` +5 min future → returns token; (9) `EN_CURSO` → returns token regardless of time; (10) `COMPLETADA` → `FORBIDDEN` + Spanish message; (11) `CANCELADA` and (separately) `NO_ASISTIO` → `FORBIDDEN` + Spanish message. Assert the token call is made with the documented identity format and the `cita-${id}` room name. |
| **Acceptance criteria** | 1. All 8 (logical) / 11 (test cases counting CANCELADA/NO_ASISTIO separately) scenarios are covered and pass ✅<br/>2. The mocked `livekitServerClient.createRoomToken` is asserted to be called with the documented identity `${role.toLowerCase()}-${id}` and the room name `cita-${citaId}` and TTL `"1h"` ✅<br/>3. The NOT_FOUND shape for "cita not found" and "non-participant" is identical (assertion: same `code` and same `message` string) ✅<br/>4. The `EN_CURSO` scenario uses a `fechaHora` 7 days in the future to prove the time check is bypassed ✅<br/>5. Tests are deterministic (fake timers + canned row, no real DB) ✅<br/>6. No `audit_logs` is touched (the use case does not write the audit log) ✅ |
| **Dependencies** | 4.1, 4.2 |
| **Estimated lines** | ~160 |

**Group 4 subtotal**: ~278 lines

### Group 5: tRPC Procedure & Audit Log

#### Task 5.1 — Add `getRoomToken` procedure to the bookings router

| Field | Value |
|---|---|
| **Files** | `src/infrastructure/api/routers/bookings.ts` (MODIFY, +38 lines) |
| **Description** | Append the `getRoomToken` procedure to the existing `bookingsRouter` per the design's `§5.5` and `AD-1`. The procedure is `protectedProcedure.input(z.object({ citaId: z.string().uuid() })).output(z.object({ token: z.string().min(1), serverUrl: z.string().url(), roomName: z.string().regex(/^cita-[0-9a-f-]{36}$/) })).query(...)`. The handler body: (a) call `getRoomTokenUseCase(ctx.db as never, { citaId: input.citaId, actor: { id: ctx.session!.user.id, role: ctx.session!.user.role as UserRole } })`; (b) per AD-10, the audit `detalles` is `{ roomName: result.roomName, role: ctx.session!.user.role }` and the `token` MUST NOT flow into the audit call; (c) per AD-12, the `writeAuditLogUseCase` call is wrapped in `try { ... } catch (err) { console.warn(...) }` so an audit failure does not fail the procedure (the token is already issued and the user is waiting in the call page); (d) return the use case result. Add the `getRoomTokenUseCase` to the existing `@/application` import line. The procedure is appended after `updateAppointmentNotes` per the spec. |
| **Acceptance criteria** | 1. The procedure is callable as `api.bookings.getRoomToken({ citaId })` from the tRPC client ✅<br/>2. The input/output Zod schemas match the design (input `citaId: uuid`, output `token: non-empty string`, `serverUrl: url`, `roomName: matches regex`) ✅<br/>3. The procedure is `protectedProcedure` — anonymous callers get `UNAUTHORIZED` (not `NOT_FOUND`) per the spec's `REQ-VC-API-1` scenario ✅<br/>4. On success, an `audit_logs` row is written with `accion: "CITA_ROOM_TOKEN_ISSUED"`, `entidadAfectada: "citas"`, `entidadId: input.citaId`, and `detalles: { roomName, role }` ✅<br/>5. The `detalles` JSON does NOT contain a `token` field (no flow from the use case return into the audit call) ✅<br/>6. An audit write throw is caught and logged via `console.warn`; the procedure still returns the token ✅<br/>7. On `NOT_FOUND` (non-participant or non-existent cita) and on `FORBIDDEN` (status/time gate), NO audit row is written ✅<br/>8. The existing 7 procedures are completely untouched ✅ |
| **Dependencies** | 4.1, 4.2, 3.1 (the audit call references `"CITA_ROOM_TOKEN_ISSUED"`) |
| **Estimated lines** | ~38 |

#### Task 5.2 — Test for the `getRoomToken` procedure

| Field | Value |
|---|---|
| **Files** | `src/infrastructure/api/routers/__tests__/bookings.getRoomToken.test.ts` (NEW, ~80 lines) |
| **Description** | Vitest. Use `createCaller` with a mocked `db` and a mocked `writeAuditLogUseCase` (via `vi.mock("@/application")`). Mock `livekitServerClient.createRoomToken` via the same `vi.mock` for the wrapper module. Mirror the pattern of the existing `src/infrastructure/api/routers/__tests__/bookings.test.ts` (read first to align with the project's test conventions). Cover 5 scenarios per the spec's `REQ-VC-API-1` and `REQ-VC-API-5`: (1) anonymous request → `UNAUTHORIZED` (asserts `protectedProcedure` is the gate; no use case call); (2) authenticated non-participant → `NOT_FOUND` and NO audit row written; (3) authenticated participant with a valid `CONFIRMADA` cita within the window → returns the shape `{ token, serverUrl, roomName }` and the audit log was written exactly once with `accion: "CITA_ROOM_TOKEN_ISSUED"` and `detalles: { roomName, role }` and `detalles` does NOT contain a `token` field; (4) `PENDIENTE` → `FORBIDDEN` + Spanish message and NO audit row; (5) audit write throws → procedure still resolves with the token and a warning is logged. |
| **Acceptance criteria** | 1. All 5 scenarios are covered and pass ✅<br/>2. The mock asserts the audit call's `detalles` does NOT include `token` (substring or deep-equal check) ✅<br/>3. The mock asserts no audit call on `NOT_FOUND` and `FORBIDDEN` paths ✅<br/>4. The mock asserts the use case was called with `actor.id === ctx.session.user.id` and `actor.role === ctx.session.user.role` ✅<br/>5. The test does not require a real DB or a real LiveKit network connection ✅ |
| **Dependencies** | 5.1 |
| **Estimated lines** | ~80 |

**Group 5 subtotal**: ~118 lines

### Group 6: Docker & Env

#### Task 6.1 — Add `livekit` service to `docker-compose.yml`

| Field | Value |
|---|---|
| **Files** | `docker-compose.yml` (MODIFY, +15 lines) |
| **Description** | Append a `livekit` service to the `services` block, placed after `meilisearch` and before the `volumes` block. Use the exact configuration from the spec's `REQ-LK-INF-1`: `image: livekit/livekit-server:latest`, `container_name: medico-livekit`, `restart: unless-stopped`, ports `"7880:7880"` (HTTP signaling), `"7881:7881"` (WebRTC over TCP), `"7882:7882/udp"` (WebRTC over UDP), `command: --dev --bind 0.0.0.0`, healthcheck `["CMD", "wget", "-qO-", "http://localhost:7880/"]` every `10s` with `timeout: 3s` and `retries: 5`. No new volume. The four existing services (`postgres`, `redis`, `minio`, `meilisearch`) MUST be untouched. Update the file's top-of-file comment to list LiveKit as a 5th service. |
| **Acceptance criteria** | 1. `docker compose config` parses without errors ✅<br/>2. The `livekit` service block is present with the documented ports, command, and healthcheck ✅<br/>3. `docker compose up -d livekit` brings up the `medico-livekit` container ✅<br/>4. `curl -sS http://localhost:7880` returns a LiveKit server identification response ✅<br/>5. The four existing services and the `volumes` block are unchanged ✅ |
| **Dependencies** | None |
| **Estimated lines** | ~15 |

#### Task 6.2 — Add LiveKit env var placeholders to `.env.example`

| Field | Value |
|---|---|
| **Files** | `.env.example` (MODIFY, +6 lines) |
| **Description** | Append a `# LiveKit (video calls — self-hosted SFU)` block at the bottom of the file with: (1) a comment line that reads `# Get these from your LiveKit deployment. For local dev, use devkey/secret (the defaults of livekit-server --dev).`; (2) `LIVEKIT_API_KEY=changeme`; (3) `LIVEKIT_API_SECRET=changeme-in-prod`; (4) `NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880`. Per the spec's `REQ-LK-INF-2`, the placeholders MUST NOT be the real dev values (`devkey` / `secret`) — they are placeholders that the dev replaces after `cp .env.example .env.local`. The `NEXT_PUBLIC_LIVEKIT_URL` line uses the dev `ws://` scheme (per D6) and the comment does not suggest `wss://` for dev. |
| **Acceptance criteria** | 1. The file parses (no syntax errors) ✅<br/>2. The placeholder values are NOT `devkey` and `secret` (per the spec's "Scenario: .env.example uses placeholders") ✅<br/>3. The comment line names `devkey` and `secret` and references `livekit-server --dev` (per the spec's "Scenario: .env.example comment explains the dev defaults") ✅<br/>4. `NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880` is present (per the spec's "Scenario: dev URL is ws://localhost:7880") ✅<br/>5. The existing env vars (DATABASE_URL, REDIS_URL, NEXT_PUBLIC_POSTHOG_KEY) are untouched ✅ |
| **Dependencies** | None |
| **Estimated lines** | ~6 |

#### Task 6.3 — Add LiveKit env vars to `.env.local.example`

| Field | Value |
|---|---|
| **Files** | `.env.local.example` (MODIFY, +3 lines) |
| **Description** | Append a `# LiveKit (video calls — self-hosted SFU)` block at the bottom of the file with the real dev values: `LIVEKIT_API_KEY=devkey`, `LIVEKIT_API_SECRET=secret`, `NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880`. Per the spec's `REQ-LK-INF-2` "Scenario: .env.local.example uses real dev values", the `.env.local.example` carries the actual dev defaults so a fresh clone + `cp .env.local.example .env.local` works out of the box. The five existing env vars are untouched. |
| **Acceptance criteria** | 1. The file parses ✅<br/>2. `LIVEKIT_API_KEY=devkey` is present ✅<br/>3. `LIVEKIT_API_SECRET=secret` is present ✅<br/>4. `NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880` is present ✅<br/>5. The five existing env vars are untouched ✅ |
| **Dependencies** | None |
| **Estimated lines** | ~3 |

#### Task 6.4 — Create `docs/livekit.md` developer doc

| Field | Value |
|---|---|
| **Files** | `docs/livekit.md` (NEW, ~35 lines) |
| **Description** | Create a new developer doc with 4 sections per the spec's `REQ-LK-INF-5`: (1) **Starting LiveKit locally** — `docker compose up -d livekit` with a one-line explanation; (2) **Dev key/secret are `devkey` / `secret`** — called out verbatim because it is the most common footgun; (3) **`.env.local` snippet** — show the exact three-line block with the dev values; (4) **Production requires `wss://` + a real certificate** — note that this is out of MVP scope and point at a future `livekit-tls-prod` change. The doc is in English (per the spec). The user-facing strings it references (e.g. the Spanish `boot-time error` message from `livekit-server.ts`) are in Spanish per the project convention. No external links. |
| **Acceptance criteria** | 1. The file is created at `docs/livekit.md` ✅<br/>2. Section 1 mentions `docker compose up -d livekit` ✅<br/>3. Section 2 calls out `devkey` and `secret` verbatim ✅<br/>4. Section 3 shows the exact `.env.local` snippet ✅<br/>5. Section 4 mentions `wss://` and a real cert and points to a future change ✅<br/>6. The doc is in English (spec body language) ✅ |
| **Dependencies** | None |
| **Estimated lines** | ~35 |

#### Task 6.5 — Append LiveKit section to `docs/SETUP.md`

| Field | Value |
|---|---|
| **Files** | `docs/SETUP.md` (MODIFY, +3 lines) |
| **Description** | Append a one-paragraph "LiveKit" mention in the "Servicios con Docker" section of `docs/SETUP.md`. The mention MUST include the `docker compose up -d livekit` command and MUST list `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `NEXT_PUBLIC_LIVEKIT_URL` as required env vars (per the spec's `REQ-LK-INF-5` "Scenario: README dev section mentions LiveKit"). The mention should link to `docs/livekit.md` for the full setup. The existing sections (requisitos, clonar, variables de entorno, base de datos, desarrollo, testing, producción) MUST be untouched. |
| **Acceptance criteria** | 1. The LiveKit command is copy-pasteable ✅<br/>2. The three env vars are listed ✅<br/>3. A link or reference to `docs/livekit.md` is present ✅<br/>4. The existing sections are unchanged ✅ |
| **Dependencies** | None |
| **Estimated lines** | ~3 |

**Group 6 subtotal**: ~62 lines

**PR-1 TOTAL: ~580 lines** — within the 800-line budget, with a ~220 line buffer.

---

## PR-2 — UI + Tests

**Goal**: Land the user-facing surface: the call page at `/citas/[id]/llamada` and the `JoinCallButton` on the existing appointment detail page. After PR-2, a doctor and patient can complete a real call from two browsers. PR-2 depends on PR-1 (the call page calls `api.bookings.getRoomToken.useQuery` from PR-1 and the detail page wires `JoinCallButton` which navigates to the call page).

**Base branch**: `main` (after PR-1 merges). PR-2 is stacked on PR-1.

**Status**: 📋 PENDING (not yet applied). Quality gates to clear on apply: `pnpm tsc --noEmit` clean, `pnpm lint` clean, `pnpm test:run` all green (the 2 new component tests + 1 page test must pass), the call page smoke test from the design's `§6` must pass (doctor + patient in two browsers complete a call, the audit log entry is written, the cita is closed via "Completar"), and the D10 limitation footer note is present in the DOM of the call page.

### Group 7: Call Page

#### Task 7.1 — Create `/citas/[id]/llamada` call page

| Field | Value |
|---|---|
| **Files** | `src/app/citas/[id]/llamada/page.tsx` (NEW, ~140 lines) |
| **Description** | Create the call page per the design's `§4 "New files (PR-2)"` and the spec's `REQ-VC-UI-1` and `REQ-VC-UI-2`. The page is a client component (`"use client"`). It reads `citaId = useParams().id` via `useParams()` from `next/navigation` (NOT react-router). It calls `api.bookings.getRoomToken.useQuery({ citaId }, { enabled: !!session, retry: 1 })`. Renders 3 states: (1) **Loading** — `<Loader2 className="size-8 animate-spin" />` plus a `<p>` with the text `"Conectando con la sala…"`; (2) **Error** — a `<p role="alert">` with the error message, a `"Reintentar"` `Button` that calls `refetch()`, and a `"Volver"` link to `/citas/${citaId}`; (3) **Success** — a sticky top bar (back link + `En vivo` badge with `aria-live="polite"` and a pulsing red dot + cita summary) above a `<LiveKitRoom serverUrl={data.serverUrl} token={data.token} connect video audio onDisconnected={() => router.push(\`/citas/${citaId}\`)}><VideoConference /></LiveKitRoom>` and a footer note documenting the D10 limitation per the spec's `REQ-VC-UI-5` (text: `"Si ambos salen sin finalizar, la cita quedará en 'En curso' y el doctor deberá cerrarla manualmente desde /citas/${citaId}."`). All interactive elements MUST be keyboard-navigable; icon-only buttons MUST have `aria-label` per the spec's `REQ-VC-UI-6`. The `useParams()` import comes from `next/navigation` (NOT react-router). The page does NOT pre-fetch the token server-side (per AD-5). |
| **Acceptance criteria** | 1. The page renders correctly in all 3 states (loading / error / success) ✅<br/>2. The loading state shows a `Spinner` and the text `"Conectando con la sala…"` (per `REQ-VC-UI-1` "Scenario: Loading state shows the spinner and message") ✅<br/>3. The error state shows `<p role="alert">`, a `"Reintentar"` Button that calls `refetch()`, and a `"Volver"` link to `/citas/${citaId}` (per `REQ-VC-UI-1` "Scenario: Error state shows retry and back controls") ✅<br/>4. The success state mounts `<LiveKitRoom>` with `serverUrl`, `token`, `connect`, `video`, `audio`, and `onDisconnected` props (per `REQ-VC-UI-2`) ✅<br/>5. The `onDisconnected` callback calls `router.push(\`/citas/${citaId}\`)` (per `REQ-VC-UI-2` "Scenario: Leave button navigates back") ✅<br/>6. The top bar is sticky at the top of the page and contains the back link + `En vivo` badge with `aria-live="polite"` and the cita summary in Spanish (per `REQ-VC-UI-3`) ✅<br/>7. The footer note is in the DOM with the text `"quedará en 'En curso'"` and a link to `/citas/${citaId}` (per `REQ-VC-UI-5` "Scenario: Footer note is present on the call page") ✅<br/>8. The `useQuery` is called with `{ enabled: !!session, retry: 1 }` so anonymous users do not fire the request (per `REQ-VC-UI-1` "Scenario: Unauthenticated session prevents the query") ✅<br/>9. Icon-only buttons carry `aria-label`; the "En vivo" status uses `aria-live="polite"` (per `REQ-VC-UI-6`) ✅ |
| **Dependencies** | PR-1 (uses the `api.bookings.getRoomToken.useQuery` procedure and the `CITA_ROOM_TOKEN_ISSUED` audit action) |
| **Estimated lines** | ~140 |

**Group 7 subtotal**: ~140 lines

### Group 8: JoinCallButton

#### Task 8.1 — Create `JoinCallButton` component

| Field | Value |
|---|---|
| **Files** | `src/components/booking/JoinCallButton.tsx` (NEW, ~55 lines)<br/>`src/components/booking/index.ts` (MODIFY, +2 lines) |
| **Description** | Create the `JoinCallButton` component per the spec's `REQ-VC-UI-4`. Client component (`"use client"`). Props: `{ citaId: string; estado: ConsultationStatus; fechaHora: Date; isDoctor: boolean }`. The `isDoctor` prop is declared for future role-aware copy (D7 commits to a single label for MVP) — it is received but not used in the rendered output. Visibility logic: `const inWindow = Math.abs(Date.now() - props.fechaHora.getTime()) <= FIFTEEN_MIN_MS; const visible = props.estado === ConsultationStatus.EN_CURSO \|\| (props.estado === ConsultationStatus.CONFIRMADA && inWindow);` If `!visible`, return `null` (no DOM residue). Otherwise render a shadcn `Button` with a `Video` icon from `lucide-react` (with `aria-hidden="true"` — the visible text describes the action) and the label `"Unirse a la videollamada"`. On click, call `useRouter().push(\`/citas/${props.citaId}/llamada\`)`. The `FIFTEEN_MIN_MS` constant is `15 * 60 * 1000`. Update the `src/components/booking/index.ts` barrel to re-export the component (and its props type, if the type is exported). |
| **Acceptance criteria** | 1. The component renders to `null` when the visibility check fails (per `REQ-VC-UI-4` "Scenario: Hidden button leaves no DOM residue") ✅<br/>2. The component renders the Button + Video icon + label when visible (per `REQ-VC-UI-4` "Scenario: EN_CURSO cita shows the button" and "Scenario: CONFIRMADA cita within the ±15 min window shows the button") ✅<br/>3. Click calls `router.push(\`/citas/${citaId}/llamada\`)` (per `REQ-VC-UI-4` "Scenario: Click navigates to the call page") ✅<br/>4. The `isDoctor` prop is in the type signature and is received without TypeScript errors ✅<br/>5. The barrel re-exports the component (and the type, if exported) ✅<br/>6. The `Video` icon has `aria-hidden="true"` because the visible text describes the action (WCAG AA per `REQ-VC-UI-6`) ✅ |
| **Dependencies** | PR-1 (none strictly — the component is a pure function of props — but the test in 8.2 and the wire in 9.1 depend on PR-1's tRPC client type) |
| **Estimated lines** | ~55 (impl) + 2 (barrel) |

#### Task 8.2 — Test for `JoinCallButton`

| Field | Value |
|---|---|
| **Files** | `src/components/booking/__tests__/JoinCallButton.test.tsx` (NEW, ~100 lines) |
| **Description** | Vitest + `@testing-library/react`. Mock `useRouter` from `next/navigation`. Use `vi.useFakeTimers()` to pin `Date.now()` to a known instant so the symmetric window can be asserted without flake. Cover 7+ scenarios per the spec's `REQ-VC-UI-4` and `REQ-VC-UI-6`: (1) `EN_CURSO` shows the button regardless of time (use a `fechaHora` 7 days in the future); (2) `CONFIRMADA` +5 min future shows; (3) `CONFIRMADA` -10 min past shows (symmetric window); (4) `PENDIENTE` hidden; (5) `CONFIRMADA` +30 min future hidden; (6) `COMPLETADA` hidden; (7) `CANCELADA` hidden; (8) `NO_ASISTIO` hidden; (9) click navigates to `/citas/${citaId}/llamada`. The test file follows the existing `src/components/booking/__tests__/StatusBadge.test.tsx` style (read first to align with the project's test conventions). |
| **Acceptance criteria** | 1. All 7+ scenarios are covered and pass ✅<br/>2. The click scenario asserts `mockRouter.push` was called with `/citas/${citaId}/llamada` ✅<br/>3. The hidden scenarios assert the `queryByRole("button")` returns `null` (no DOM residue) ✅<br/>4. The visible scenarios assert the button text contains `"Unirse a la videollamada"` and the `Video` icon is present ✅<br/>5. The test is deterministic (fake timers + canned props, no real network) ✅ |
| **Dependencies** | 8.1 |
| **Estimated lines** | ~100 |

**Group 8 subtotal**: ~157 lines

### Group 9: Detail Page Wire & Call Page Tests

#### Task 9.1 — Mount `<JoinCallButton>` on the appointment detail page

| Field | Value |
|---|---|
| **Files** | `src/app/citas/[id]/page.tsx` (MODIFY, +12 lines) |
| **Description** | Add a `<JoinCallButton>` to the existing detail page per the spec's `REQ-VC-UI-5`. Import the component from `@/components/booking`. Place the button: (a) inside the existing `Acciones` card (the doctor status-transition card) for the DOCTOR view — placed at the top of the `flex flex-wrap gap-2` div, before the status transition buttons; (b) in a NEW dedicated `<Card>` for the PACIENTE view — placed after the main info card and before the patient cancel option. Pass the exact props per the spec: `citaId={cita.id} estado={cita.estado} fechaHora={new Date(cita.fechaHora)} isDoctor={isDoctor}`. The `new Date(...)` wrap converts the Drizzle `timestamp` to a JS `Date`. The integration is purely additive — the existing layout, action buttons, notes editor, status badge, and patient cancel option MUST remain unchanged. The `JoinCallButton` self-hides on the server (returns `null` when the visibility check fails), so no extra conditional is needed at the call site. |
| **Acceptance criteria** | 1. The doctor view places `<JoinCallButton>` inside the `Acciones` card (per `REQ-VC-UI-5` "Scenario: Doctor view places the button with the action card") ✅<br/>2. The patient view places `<JoinCallButton>` in a new dedicated card (per `REQ-VC-UI-5` "Scenario: Patient view places the button in a dedicated card") ✅<br/>3. The doctor's transition buttons (`Confirmar` / `Iniciar consulta` / `Completar` / `No asistió` / `Cancelar cita`) are unchanged ✅<br/>4. The notes editor is unchanged ✅<br/>5. The status badge is unchanged ✅<br/>6. The patient cancel option is unchanged ✅<br/>7. The hidden button (visibility check fails) renders to `null` and leaves no DOM residue (per `REQ-VC-UI-5` "Scenario: Hidden button leaves no DOM residue") ✅<br/>8. The existing 0 tests in `src/app/citas/[id]/` (if any) still pass — the change is purely additive ✅ |
| **Dependencies** | 8.1 |
| **Estimated lines** | ~12 |

#### Task 9.2 — Test for the call page

| Field | Value |
|---|---|
| **Files** | `src/app/citas/[id]/llamada/__tests__/page.test.tsx` (NEW, ~90 lines) |
| **Description** | Vitest + `@testing-library/react`. Mock `useParams` from `next/navigation` and `useRouter` from `next/navigation`. Mock `useSession` from `next-auth/react` to return `{ data: { user: { id: "u-1", role: "DOCTOR" } } }`. Mock the entire `@/infrastructure/api` module so `api.bookings.getRoomToken.useQuery` can be controlled per-state. Mock the `@livekit/components-react` module so `<LiveKitRoom>` is a stub `<div data-testid="livekit-room" />` and `<VideoConference>` is a stub `<div data-testid="video-conference" />`. Cover 4 scenarios per the spec's `REQ-VC-UI-1` and `REQ-VC-UI-2`: (1) **Loading** — `useQuery` returns `{ isLoading: true }` → the spinner + `"Conectando con la sala…"` text is in the DOM and no `<LiveKitRoom>` is mounted; (2) **Error** — `useQuery` returns `{ isLoading: false, isError: true, error: { message: "Servicio de videollamada no disponible" }, refetch: vi.fn() }` → a `<p role="alert">` with the message is in the DOM, a `"Reintentar"` Button whose click calls `refetch()` is present, and a `"Volver"` link to `/citas/<id>` is present; (3) **Success** — `useQuery` returns `{ isLoading: false, data: { token: "jwt", serverUrl: "ws://localhost:7880", roomName: "cita-x" } }` → `<LiveKitRoom data-testid="livekit-room">` and `<VideoConference>` are mounted, the `En vivo` badge with `aria-live="polite"` is present, the cita summary is in the DOM, the D10 footer note with the text `"quedará en 'En curso'"` and a link to `/citas/<id>` is present, and no spinner or error text is in the DOM; (4) **Disconnect** — call the `onDisconnected` prop of `<LiveKitRoom>` and assert `mockRouter.push` was called with `/citas/<id>`. |
| **Acceptance criteria** | 1. All 4 scenarios are covered and pass ✅<br/>2. The loading scenario asserts `"Conectando con la sala…"` is in the DOM and `<LiveKitRoom>` is NOT ✅<br/>3. The error scenario asserts `<p role="alert">` is in the DOM, `"Reintentar"` calls `refetch`, and `"Volver"` is a link to `/citas/<id>` ✅<br/>4. The success scenario asserts `<LiveKitRoom>` and `<VideoConference>` are mounted, the `En vivo` badge carries `aria-live="polite"`, the D10 footer note is in the DOM, and no loading or error text is in the DOM ✅<br/>5. The disconnect scenario asserts `mockRouter.push("/citas/<id>")` is called ✅<br/>6. The test does not require a real DB or a real LiveKit network connection ✅ |
| **Dependencies** | 7.1 |
| **Estimated lines** | ~90 |

**Group 9 subtotal**: ~102 lines

**PR-2 TOTAL: ~640 lines** — within the 800-line budget, with a ~160 line buffer.

---

## Review Workload Forecast

- **PR-1 estimated changed lines**: ~580 (within 800-line budget, ~220 line buffer) ✓
- **PR-2 estimated changed lines**: ~640 (within 800-line budget, ~160 line buffer) ✓
- **Total change**: ~1,220 lines (UI + tests + specs)
- **Chained PRs recommended**: Yes (auto-forecast triggered)
- **400-line budget risk**: High (the full change would exceed; PR split mitigates)
- **Decision needed before apply**: No (the PR split is already in the design; apply can proceed group-by-group with `stacked-to-main` chain strategy)
- **Chain strategy**: `stacked-to-main` (cached from user's preference in engram)

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Notes for the Orchestrator

**Why the budget is exceeded.** The design estimated ~1,220 lines (UI + tests + specs). The gap comes from realistic test coverage (~430 lines of tests across 5 files) and the call page's 3-state component (~140 lines). The 2-way PR split keeps each PR under the 800-line cap.

**Recommended split.** Two chained PRs to stay within 800 lines:

| PR | Tasks | Est. Lines | Focus |
|---|---|---|---|
| **PR-1 — Data + API + Specs** | G1 (1.1–1.3), G2 (2.1–2.3), G3 (3.1), G4 (4.1–4.3), G5 (5.1–5.2), G6 (6.1–6.5) | ~580 | Foundation: column, migration, entity getter, LiveKit client, use case, tRPC procedure, audit union, Docker, env, dev doc. Independently testable via tRPC client. |
| **PR-2 — UI + Tests** | G7 (7.1), G8 (8.1–8.2), G9 (9.1–9.2) | ~640 | All UI: call page, JoinCallButton, detail page wire, 2 component tests + 1 page test. Ships the user-facing call. |

**Order**: PR-1 → PR-2. PR-1 is reviewable as a self-contained data + API foundation that can be curl-tested. PR-2 depends on PR-1 (the call page imports the procedure added in PR-1 and the detail page wires `JoinCallButton` which navigates to the call page).

**Chain strategy**: `stacked-to-main`. Each PR merges to `main` in order. PR-2 branches off `main` after PR-1 lands.

**Pre-flight reconciliation notes** (path/identifier corrections made vs the original user prompt):

1. `AuditAction` lives at `src/application/use-cases/audit/write-audit-log.use-case.ts` (the user prompt suggested `src/domain/enums/index.ts` — that's where `UserRole` / `ConsultationStatus` live, not the audit union). The design picked the audit use case; the spec allows either location. Tasks follow the design.
2. `livekit_room_name` is `varchar(128)` per the spec and design (the user prompt suggested `text`). The Drizzle migration's `ALTER TABLE` statement will reflect `varchar(128)`.
3. `JoinCallButton` lives at `src/components/booking/JoinCallButton.tsx` (the existing `src/components/booking/` barrel already houses `StatusBadge` / `AppointmentCard` / `SlotGrid`).
4. The detail page is already a `"use client"` component, so the wire in task 9.1 is purely additive (no refactor).
5. `.env.example` placeholders use `changeme` / `changeme-in-prod` per the spec's `REQ-LK-INF-2`; the dev defaults `devkey` / `secret` are the comment explanation, not the placeholder values.

---

## Cancelled (Out of Scope)

These features were considered during explore and explicitly **rejected** for this change. They are listed here to prevent re-adding them in `sdd-apply`:

- **Recording / transcription / playback** (LiveKit Egress) — out of MVP per D-OOS. Future change: "video-call-recording".
- **Pre-call waiting room** — out of MVP. Future change: "video-call-waiting-room".
- **In-call chat** — `canPublishData: false` in the JWT grant per D2. Future change: "video-call-chat".
- **Picture-in-picture UX polish** — out of MVP. Future change: "video-pip-polish".
- **Modality toggle (presencial / online)** — out of MVP per D7. Future change: "appointment-modality".
- **In-call notes** — out of MVP. Future change: "in-call-notes".
- **Doctor-initiated call (push notifications)** — FCM/APNS setup is a separate build. Future change: "video-call-push".
- **Multi-party calls** — MVP is 1:1 only. Future change: "multi-party-calls".
- **Real TURN server for production** — dev container's built-in TURN is fine for `localhost`. Future change: "livekit-turn-prod".
- **Real TLS / production certs** — dev uses `ws://localhost:7880`; production needs `wss://` + cert. Future change: "livekit-tls-prod".
- **Webhook integration for auto-completion** (D10 mitigation) — the "doctor + patient both leave without action" gap is documented in the call page footer, the `video-calls-ui` spec, and the archive report. Future change: "livekit-webhooks".
- **Disable `tel:` "Llamar" button on `DoctorHero`** — out of MVP per the proposal's "Out of Scope" table. Future change: "doctor-hero-cleanup".
- **`Enviar mensaje` button on `DoctorHero`** — out of MVP; the `DoctorHero` surface is stable.
- **Footer stub pages** (privacidad, términos, etc.) from `home-page-upgrade` — already rejected by that change, not re-adding here.
- **Reviews system** — out of MVP for the video calls change.
- **Insurance grid** — out of MVP for the video calls change.
- **i18n** — site is Spanish-only; all UI copy in the new components is hard-coded Spanish literals.
- **No new shadcn primitives** — the call page reuses `Button`, `Spinner`, `Card`, `Alert`, `Skeleton` (per AD-4). No new shadcn components are added in this change.
- **No new tRPC middleware** — `getRoomToken` uses the existing `protectedProcedure` with no custom transform (per the design's "Out-of-Scope Architectural Notes").
- **No new env vars beyond the 3 LiveKit ones** — no feature flag, no analytics token.
- **No new third-party libraries beyond `livekit-server-sdk`** — the client-side `@livekit/components-react` and `livekit-client` are already in `package.json` from earlier prep work.
- **No `livekit/` migrations directory** — we use the existing `src/infrastructure/db/migrations/`.
- **No `JoinCallButton` variant for doctor vs patient in MVP** — the `isDoctor` prop is declared for future role-aware copy; the MVP uses a single label.
- **No integration test for the use case → DB** — the auth + status + time logic is pure (input rows → decision). A future change can add a real-DB integration test.
