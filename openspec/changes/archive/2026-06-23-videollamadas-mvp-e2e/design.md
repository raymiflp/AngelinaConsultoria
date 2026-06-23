# Design: Videollamadas MVP end-to-end

## 1. Architecture overview

This change adds the **operational confidence layer** for the MVP. No product code path is touched; instead, the change (a) hardens LiveKit module init from lazy to eager so configuration errors surface at boot, (b) introduces a deterministic dev seed so any operator can reproduce the call flow without writing fixtures by hand, (c) introduces a 2-context Playwright E2E that proves the user-visible acceptance criterion in real browsers, and (d) publishes a copy-pasteable runbook that takes a fresh clone to "two tabs seeing each other" in under 10 minutes.

Request flow (unchanged for the call itself; the seed + E2E exercise this path end-to-end):

```
+-----------------+        +-------------------+        +-------------------------+
|  Doctor (tab 1) |        |  Next.js (tRPC +  |        |  LiveKitServerClient    |
|  Paciente (tab2)| -----> |  RSC + webhook)   | -----> |  (eager module const)   |
+-----------------+        +-------------------+        +-------------------------+
        |                          |                              |
        | tRPC getRoomToken        | 4 gates:                     | AccessToken.toJwt()
        | (auth, status, window,   |  - participant               | (LIVEKIT_API_KEY,
        |  modality)               |  - status / ±15min           |  LIVEKIT_API_SECRET)
        |                          |  - modalidad === ONLINE      v
        v                          v                         +-------------------+
+--------------------+   +-----------------------+         |  LiveKit server   |
| @livekit/components|   | webhooks /api/livekit| <-----   |  (Docker, --dev)  |
| -react <LiveKitRoom|<- | /webhook  room_finished ---->    |  ws://localhost   |
| + <VideoConference>|   | -> autoCompleteUseCase|         |  :7880            |
+--------------------+   +-----------------------+         +-------------------+
        |                          |
        v                          v
   peer media                 audit_logs
   (UDP 7882)                cita.estado = COMPLETADA
```

Eager init means the `LiveKitServerClient` constructor (and therefore env-var validation) runs the moment the module is imported — typically during the first import of the bookings router or the webhook route. There is no longer a `getLiveKitServerClient()` accessor. Per spec `livekit-infrastructure/spec.md` REQ-LI-INIT-1, this is the correct trade-off.

---

## 2. Module-by-module changes

### 2.1 `src/infrastructure/livekit/livekit-server.ts` — eager module-level singleton

**DELETE** lines 107–120 (the `let _instance` cache + the `export function getLiveKitServerClient()` accessor + the JSDoc that documents lazy behavior). **ADD** at the end of the file, after the class declaration:

```ts
// Module-level eager singleton. The constructor reads the env vars
// (LIVEKIT_API_KEY / LIVEKIT_API_SECRET / NEXT_PUBLIC_LIVEKIT_URL); a missing
// var throws HERE, at import time, so a misconfigured environment fails the
// Next.js boot instead of surfacing as a per-request INTERNAL_SERVER_ERROR
// when a patient tries to join the call three hours later in production.
// REQ-LI-INIT-1 (livekit-infrastructure spec).
export const livekitServerClient = new LiveKitServerClient();
```

Update the class-level JSDoc to drop the "Instantiation is deferred..." paragraph and replace with: "The class is instantiated eagerly as a module-level singleton (`livekitServerClient`) at the bottom of this file; the constructor's env-var check therefore runs at the moment any module imports `livekit-server.ts`."

**Call site updates** — `pnpm tsc --noEmit` must stay clean and the 547 unit tests must stay green. The grep `getLiveKitServerClient` has **four** hits, not two:

| File | Line | Change |
|---|---|---|
| `src/application/use-cases/bookings/get-room-token.use-case.ts` | 6 (import), 115 (call) | `import { livekitServerClient }` and `livekitServerClient.createRoomToken(...)` |
| `src/infrastructure/api/routers/bookings.ts` | imports via `bookings` tRPC surface | indirect — fix the use case and the router picks it up |
| `src/app/api/livekit/webhook/route.ts` | 4 (import), 56 (call) | `import { livekitServerClient }` and `livekitServerClient.verifyWebhook(...)` |
| `src/infrastructure/livekit/index.ts` | 1–4 (re-export barrel) | Replace `getLiveKitServerClient` with `livekitServerClient` in the re-export |

Test files that mock the old accessor MUST also be updated to keep unit tests passing:

| Test file | Change |
|---|---|
| `src/infrastructure/livekit/__tests__/livekit-server.test.ts` | The `describe("getLiveKitServerClient lazy singleton", ...)` block (lines 150–212) is **deleted** (the lazy contract no longer exists). The other 4 describe blocks (`env validation`, `verifyWebhook`) are unchanged. |
| `src/application/use-cases/bookings/__tests__/get-room-token.test.ts` | `vi.mock("@/infrastructure/livekit/livekit-server", () => ({ livekitServerClient: stubClient }))` — the use case now reads `livekitServerClient.createRoomToken(...)` instead of `getLiveKitServerClient().createRoomToken(...)`. |
| `src/app/api/livekit/__tests__/route.test.ts` | Same `vi.mock` swap — `livekitServerClient: () => ({ verifyWebhook: mockVerifyWebhook })`. |

**Trade-off**: any page that transitively imports the bookings router (the dashboard, the call page, the cita list, anything under `/citas/*`) will now fail to boot if LiveKit env vars are missing. This is **deliberate and desired** — `pnpm dev` failing fast at the operator's terminal is better than a 500 three hours later in production. The Vitest unit runner is unaffected because the existing tests already mock the module at the test boundary and never execute the real import.

### 2.2 `scripts/seed-dev.ts` — NEW

Plain Node TypeScript script (`.ts` extension, run with `tsx`). Lives at the repo root under `scripts/` to mirror `scripts/seed-admin.mjs`. Reads env via `dotenv/config` (already used elsewhere) and connects with the same `postgres-js` driver + Drizzle pattern as `src/infrastructure/db/index.ts`.

Shape (sketch):

```ts
import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import bcrypt from "bcryptjs";
import * as schema from "../src/infrastructure/db/schema";
import { usuarios, doctores, pacientes, citas } from "../src/infrastructure/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { ConsultaModalidad, ConsultationStatus } from "../src/domain/enums";

const DOCTOR_EMAIL = "doctor.dev@medico.local";
const DOCTOR_PASSWORD = "DoctorDev123!";
const PACIENTE_EMAIL = "paciente.dev@medico.local";
const PACIENTE_PASSWORD = "PacienteDev123!";

async function upsertUser(sql, email, password, rol, nombre, telefono) {
  const existing = await sql`SELECT id FROM usuarios WHERE email = ${email} LIMIT 1`;
  if (existing.length) return existing[0].id as string;
  const hash = await bcrypt.hash(password, 12);
  const [row] = await sql`
    INSERT INTO usuarios (email, password_hash, rol, nombre, telefono, activo, created_at, updated_at)
    VALUES (${email}, ${hash}, ${rol}, ${nombre}, ${telefono}, true, NOW(), NOW())
    RETURNING id
  `;
  return row.id as string;
}

async function ensureDoctorProfile(sql, doctorUsuarioId) {
  const existing = await sql`SELECT id FROM doctores WHERE usuario_id = ${doctorUsuarioId} LIMIT 1`;
  if (existing.length) return existing[0].id as string;
  const [row] = await sql`
    INSERT INTO doctores (usuario_id, numero_colegiado, especialidad, biografia, acepta_online, idiomas)
    VALUES (${doctorUsuarioId}, ${"DEV-" + Date.now()}, ${"medico-general"},
            ${"Doctor de prueba — seed dev"}, true, ${["es"]})
    RETURNING id
  `;
  return row.id as string;
}

async function ensurePacienteProfile(sql, pacienteUsuarioId) {
  // fecha_nacimiento NOT NULL, dni/telefono NOT NULL — fill stubs
  await sql`
    INSERT INTO pacientes (usuario_id, fecha_nacimiento, dni, telefono, alergias)
    VALUES (${pacienteUsuarioId}, ${"1990-01-01"}, ${"00000000A"}, ${"+34 600 000 000"}, ${[]})
    ON CONFLICT (usuario_id) DO NOTHING
  `;
}

async function ensureCita(sql, doctorId, pacienteId) {
  const existing = await sql`
    SELECT id FROM citas
    WHERE doctor_id = ${doctorId} AND paciente_id = ${pacienteId}
      AND estado IN ('CONFIRMADA', 'PROGRAMADA')
    LIMIT 1
  `;
  if (existing.length) return existing[0].id as string;
  const startsAt = new Date(Date.now() + 5 * 60 * 1000);
  const [row] = await sql`
    INSERT INTO citas (doctor_id, paciente_id, fecha_hora, estado, motivo, duracion_minutos, modalidad)
    VALUES (${doctorId}, ${pacienteId}, ${startsAt}, 'CONFIRMADA',
            ${"Consulta de prueba — seed dev"}, 30, 'ONLINE')
    RETURNING id
  `;
  return row.id as string;
}
```

The script deliberately uses raw `postgres-js` template literals (mirroring `seed-admin.mjs`) rather than importing the existing `createAppointmentUseCase`, because the use case requires the doctor's `disponibilidad` JSON block and the seed only needs a stub cita. Reusing the use case would force us to populate the doctor's availability schedule, doubling the seed complexity for zero benefit. The booking invariant that REQ-DEV-SEED-3 cares about (no duplicate `CONFIRMADA` cita for the same doctor+paciente) is enforced by the `SELECT` before `INSERT` above.

Stdout block (matches `dev-seed/spec.md` REQ-DEV-SEED-4):

```
=== medico-consulta dev seed ===
Doctor:   doctor.dev@medico.local   /   DoctorDev123!
Paciente: paciente.dev@medico.local /   PacienteDev123!
Cita URL: http://localhost:3000/citas/<uuid>/llamada
```

Error path: any thrown error exits 1 with `console.error("seed:dev:", err.message)`. No emoji, no ANSI — matches the runbook's "pasteable into chat" requirement.

### 2.3 `tests/e2e/videocall-2-users.spec.ts` — NEW

Single Playwright spec, ~80 LOC. Skipped automatically when `LIVEKIT_E2E !== '1'` per `e2e-video-call/spec.md` REQ-VC-E2E-1. Uses `@playwright/test`'s `browser.newContext()` × 2 — one per seeded user — so each has its own cookie jar. Each context fills the existing `/login` form (`src/app/login/page.tsx`); no `storageState` injection.

Outline:

```ts
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import postgres from "postgres";

const SKIP_REASON = "Set LIVEKIT_E2E=1 to run (requires livekit container + seed).";

const DOCTOR = { email: "doctor.dev@medico.local",   password: "DoctorDev123!"   };
const PACIENTE = { email: "paciente.dev@medico.local", password: "PacienteDev123!" };
const BASE = process.env.APP_URL ?? "http://localhost:3000";

test.describe("videocall — two authenticated users on the same cita", () => {
  test.skip(!process.env.LIVEKIT_E2E || process.env.LIVEKIT_E2E !== "1", SKIP_REASON);

  let citaId: string;

  test.beforeAll(async () => {
    // Read the seeded cita id directly from the DB (cheaper than re-running the seed).
    const sql = postgres(process.env.DATABASE_URL!);
    const rows = await sql`
      SELECT c.id FROM citas c
      JOIN doctores d ON c.doctor_id = d.id
      JOIN usuarios u ON d.usuario_id = u.id
      WHERE u.email = ${DOCTOR.email} AND c.estado = 'CONFIRMADA'
      ORDER BY c.fecha_hora DESC LIMIT 1
    `;
    await sql.end();
    if (!rows.length) throw new Error("seed:dev must be run before LIVEKIT_E2E tests");
    citaId = rows[0].id as string;
  });

  async function loginInTab(ctx: BrowserContext, creds: { email: string; password: string }): Promise<Page> {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(creds.email);
    await page.getByLabel(/contraseña/i).fill(creds.password);
    await page.getByRole("button", { name: /ingresar/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 10_000 });
    return page;
  }

  test("both contexts join the room, see 2 tiles, and the cita completes", async ({ browser }) => {
    const doctorCtx = await browser.newContext();
    const pacienteCtx = await browser.newContext();
    try {
      const [docPage, pacPage] = await Promise.all([
        loginInTab(doctorCtx, DOCTOR),
        loginInTab(pacienteCtx, PACIENTE),
      ]);

      const callUrl = `${BASE}/citas/${citaId}/llamada`;
      await Promise.all([docPage.goto(callUrl), pacPage.goto(callUrl)]);

      // REQ-VC-E2E-2: LiveKitRoom mounted within 10s on both contexts.
      await Promise.all([
        expect(docPage.getByTestId("livekit-room")).toBeVisible({ timeout: 10_000 }),
        expect(pacPage.getByTestId("livekit-room")).toBeVisible({ timeout: 10_000 }),
      ]);

      // REQ-VC-E2E-5: 2 <video> tiles per context (local + remote) within 15s.
      await Promise.all([
        expect(docPage.locator("video")).toHaveCount(2, { timeout: 15_000 }),
        expect(pacPage.locator("video")).toHaveCount(2, { timeout: 15_000 }),
      ]);

      // REQ-VC-E2E-3 (DOM path): participant count attribute equals exactly 2.
      await expect(docPage.locator("[data-lk-participant-count='2']")).toBeVisible({ timeout: 15_000 });

      // Cleanup: both contexts close → room_finished → COMPLETADA within 30s.
      await Promise.all([doctorCtx.close(), pacienteCtx.close()]);

      // REQ-VC-E2E-4: poll the DB until estado === 'COMPLETADA' (best-effort, warns on miss).
      const sql = postgres(process.env.DATABASE_URL!);
      const deadline = Date.now() + 30_000;
      let estado: string | undefined;
      while (Date.now() < deadline) {
        const rows = await sql`SELECT estado FROM citas WHERE id = ${citaId}`;
        estado = rows[0]?.estado as string | undefined;
        if (estado === "COMPLETADA") break;
        await new Promise((r) => setTimeout(r, 1_000));
      }
      await sql.end();
      if (estado !== "COMPLETADA") {
        console.warn(`[videocall-2-users] webhook chain not exercised (final estado=${estado}). Likely host.docker.internal unreachable from the livekit container.`);
      } else {
        expect(estado).toBe("COMPLETADA");
      }
    } finally {
      await Promise.allSettled([doctorCtx.close(), pacienteCtx.close()]);
    }
  });
});
```

The `<LiveKitRoom data-testid="livekit-room">` wrapper already exists in `src/app/citas/[id]/llamada/page.tsx:150` — no DOM change needed. The `data-lk-participant-count` selector is what `@livekit/components-react`'s `<ParticipantCounter>`/`FocusLayout` exposes; if the running version differs, fall back to `await expect(page.locator('video')).toHaveCount(2, ...)` alone.

### 2.4 `docs/dev-setup.md` — NEW

Six sections, copy-pasteable, anchored to `package.json` and `docker-compose.yml` (no hardcoded versions per proposal R4 mitigation):

1. **Prerequisites** — Node 22 LTS, pnpm 11 (`corepack enable`), Docker Desktop or Docker Engine + Compose v2.
2. **Bootstrap** — `pnpm install` at the repo root.
3. **Env** — `cp .env.example .env.local`, then set the four LiveKit vars (`LIVEKIT_API_KEY=devkey`, `LIVEKIT_API_SECRET=secret`, `NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880`, `LIVEKIT_WEBHOOK_URL=http://host.docker.internal:3000/api/livekit/webhook`).
4. **DB services** — `docker compose up -d postgres redis minio meilisearch livekit`. One verification command per service: `docker compose ps postgres`, `curl -fsS http://localhost:9000/minio/health/live`, `curl -fsS http://localhost:7700/health`, `curl -fsS http://localhost:7880`.
5. **Migrate + Seed** — `pnpm db:migrate` then `pnpm seed:dev`. Output of the latter is the credentials + URL block from §2.2.
6. **Run + Smoke test** — `pnpm dev`, then the 2-tab incognito dance from `dev-setup/spec.md` REQ-DEV-SETUP-3 (8 sub-steps: two tabs, login each, navigate to URL, accept mic/cam, see 2 video tiles, leave, refresh detail page, verify `COMPLETADA` badge).

Troubleshooting matrix (from `dev-setup/spec.md` REQ-DEV-SETUP-4) — 4 mandatory rows: "LiveKit env vars missing", "livekit container Exit 1", "La cita debe estar confirmada antes…", "La videollamada se habilita 15 minutos antes…".

### 2.5 `package.json` script additions

```json
"seed:dev": "tsx scripts/seed-dev.ts",
"test:e2e:video": "playwright test tests/e2e/videocall-2-users.spec.ts"
```

Plus a single new devDependency: `"tsx": "^4.22.4"` (currently transitive via `drizzle-kit`; pinning it explicitly makes the `seed:dev` script reproducible on a clean install).

### 2.6 `docs/livekit.md` — UPDATE

Add a single line at the top (after the title): `> Looking for dev setup? See [dev-setup.md](./dev-setup.md) for the linear sequence from clone to two tabs in a call.` This points operators to the runbook without duplicating LiveKit-specific content.

### 2.7 `playwright.config.ts` — UPDATE

Add a new `chromium-livekit` project that the `test:e2e:video` script targets:

```ts
projects: [
  // ...existing chromium, firefox, webkit
  {
    name: "chromium-livekit",
    use: { ...devices["Desktop Chrome"], launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } },
    testMatch: /videocall-2-users\.spec\.ts$/,
    dependencies: ["setup"],
  },
],
```

The `--use-fake-ui-for-media-stream` Chrome flag auto-accepts the mic/cam permission prompt so the E2E never stalls on a Playwright dialog handler. Existing `webServer` is reused as-is.

---

## 3. Data model changes

**None.** No Drizzle migration, no schema delta, no new tables, no new columns. The seed writes through existing `usuarios`, `doctores`, `pacientes`, `citas` rows; the call page already reads `livekitRoomName` (it just stays `null` server-side because `get-room-token.use-case.ts:113` derives `roomName = cita-{id}` at token-issuance time).

---

## 4. API changes

**None at the tRPC surface.** `bookings.getRoomToken` keeps its 4 gates (participant, status, ±15-min window, modality). No new procedure, no schema field added, no output shape change. The eager-init change is purely internal to the infrastructure module.

---

## 5. Error handling

| Failure | Behavior | Where caught |
|---|---|---|
| LiveKit env vars missing | Server fails to boot with `Error: LiveKit env vars missing. Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET in .env.local. See docs/livekit.md for setup.` within 2s of `next dev` start | `LiveKitServerClient` constructor in `src/infrastructure/livekit/livekit-server.ts` (eager module-level) |
| LiveKit container down | `getRoomToken` returns `INTERNAL_SERVER_ERROR` with a localized error from the call page (`src/app/citas/[id]/llamada/page.tsx:74-96`). Note: the `AccessToken.toJwt()` path does NOT need the container — it only needs the env vars — so a down container only breaks the **join** path, not the token request. | `@livekit/components-react` connect error → page-level error UI |
| Webhook Redis down | Degrade-open: `webhookDedupe` returns `{ isNew: true }` on Redis failure (existing pattern); the use case is itself idempotent so a double-fire is a no-op | `src/infrastructure/redis/cache.ts` + `autoCompleteOnRoomFinishedUseCase` |
| Seed: DB unreachable | Exit 1 with `console.error("seed:dev:", err.message)` to stderr; no cita URL printed | `scripts/seed-dev.ts` outer `try/catch` |
| E2E: peer doesn't connect within 15s | Test fails with the `expect.toHaveCount(2, { timeout: 15_000 })` assertion error | Playwright `expect` |
| E2E: webhook unreachable from `livekit` container | Test logs `console.warn` and **passes** (R5 mitigation) | `videocall-2-users.spec.ts` post-cleanup poll |

---

## 6. Testing strategy

| Layer | Scope | Approach |
|---|---|---|
| Unit | Eager-init behavior: `LiveKitServerClient` constructs at import; missing env throws; `livekitServerClient` is `===` itself across imports. Updated mock wiring in three test files. | Modify `src/infrastructure/livekit/__tests__/livekit-server.test.ts` (drop lazy describe block, add `livekitServerClient` describe), `get-room-token.test.ts`, `route.test.ts`. Target: keep **547/547** green per `livekit-tls-prod` baseline. |
| Integration | None new — the existing `livekit-webhooks` integration tests already cover the `room_finished` → `COMPLETADA` chain. The seed is exercised by the E2E test indirectly. | No file added. |
| E2E | One new file (`tests/e2e/videocall-2-users.spec.ts`) covering REQ-VC-E2E-1..5 from `e2e-video-call/spec.md`. Skipped unless `LIVEKIT_E2E=1`. | `pnpm test:e2e:video`. |
| Manual smoke | Documented in `docs/dev-setup.md` §6. | Two tabs (one incognito), both navigate to seeded URL, confirm 2 video tiles, leave, refresh detail, confirm `COMPLETADA` badge. |

No new unit tests for the seed itself — it is exercised by the E2E test's `beforeAll` (DB read of `citas.estado = 'CONFIRMADA'`). The seed's idempotency is documented in `dev-seed/spec.md` REQ-DEV-SEED-2 but enforced by `INSERT ... ON CONFLICT` semantics; a redundant integration test is a future-proofing opportunity, not a blocker for this change.

---

## 7. Rollout

- **Single PR.** Total ~310 LOC (excl. spec deltas), well under the 800-line `apply` budget. Per the proposal: "no hay seam natural para chained PRs (el seed + el E2E test se rompen mutuamente si se parten; el runbook solo tiene sentido con el seed funcionando)."
- **No DB migration.** `livekitRoomName` is already in the `citas` table (set to `null` by the seed — the use case derives the room name at token-issuance time).
- **No env-var additions.** All four required vars (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`, `LIVEKIT_WEBHOOK_URL`) are already in `.env.example`.
- **No new Docker services.** `docker-compose.yml` is unchanged.
- **Manual QA gate before merge**: developer runs `pnpm seed:dev` → opens 2 tabs (one incognito) → confirms both video tiles visible → closes both → refreshes the detail page → confirms the `COMPLETADA` badge appears within 30 seconds. This is the operator-experience acceptance criterion from the proposal.
- **E2E runbook for CI**: optional. The test is skipped by default (`LIVEKIT_E2E !== '1'`). When CI eventually wires up a LiveKit container (out of scope for this change), the test runs as `pnpm test:e2e:video`.

---

## 8. Open questions / follow-ups (out of scope, listed for context)

- **Per-day `aceptaOnline`** — already documented as follow-up in `2026-06-19-modality-toggle`. The seed sets `aceptaOnline: true` globally, which is sufficient for MVP.
- **Webhook signature fallback for dev (LiveKit Cloud)** — not needed; we use self-hosted LiveKit in Docker with `--dev` mode.
- **Recording / transcripts / egress webhooks** — `livekit-recording` future change; UI for recordings is out of scope for MVP.
- **Pin `livekit/livekit-server:latest` to a digest** — `livekit-pin-image` future change. Documented in `livekit-webhooks` R2.
- **TURN server for production** — `livekit-turn-prod` future change. Documented in `docs/livekit.md` §4.
- **HTTPS / WSS for production** — `livekit-tls-prod` (already archived). Production deploy is out of MVP scope.
- **Storing the LiveKit room name explicitly** — the `citas.livekitRoomName` column exists (added by `modality-toggle`) but the use case still derives `cita-{id}` server-side. Future change could move to a deterministic column read; for MVP, derivation is simpler and sufficient.
- **Self-test of the seed script** — `dev-seed/spec.md` REQ-DEV-SEED-2 documents idempotency across 3 runs, but there is no automated test for that contract. Worth adding to a future `dev-ergonomics` change.