# Spec: livekit-infrastructure — Delta

## MODIFIED Requirements

### REQ-LI-INIT-1: LiveKitServerClient is instantiated eagerly at module load

The `LiveKitServerClient` wrapper in `src/infrastructure/livekit/livekit-server.ts` MUST be instantiated eagerly as a module-level constant, NOT lazily on first access. The exported binding MUST be a `const` named `livekitServerClient`, declared and assigned at the top level of the module (e.g. `export const livekitServerClient = new LiveKitServerClient();`), so that the constructor — and therefore the env-var validation inside it — runs at the moment any module imports `livekit-server.ts`.

The previous lazy accessor pattern (`function getLiveKitServerClient() { if (!_instance) _instance = new LiveKitServerClient(); return _instance; }`) MUST be removed. No function-call accessor that wraps the construction MUST remain in the module surface. The `livekitServerClient` export MUST be usable as a value (not a function) at every call site — i.e., `livekitServerClient.createToken(...)` and `livekitServerClient.verifyWebhook(...)` MUST be valid call shapes.

A missing `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, or `NEXT_PUBLIC_LIVEKIT_URL` MUST cause the Next.js server boot to fail with a thrown `Error` whose message identifies which vars are missing and points to `docs/livekit.md` for setup. The failure MUST be observable in the `pnpm dev` boot log within 2 seconds of the import being triggered (typically the first request to the tRPC router or the first server-side import chain). A missing env var MUST NOT surface as a per-request `INTERNAL_SERVER_ERROR` from `getRoomToken` after the server has booted — the boot itself MUST have failed first.

This change is a deliberate trade-off: any page that transitively imports the bookings router (and therefore `livekit-server.ts`) will fail to boot if LiveKit env vars are missing. The pre-change lazy behavior allowed such pages to render and only failed when a user actually clicked "Join call". The eager behavior is preferred because (a) configuration errors surface immediately to the operator instead of three hours later in production, and (b) the same module is now imported once at boot instead of once per request, simplifying reasoning about side effects.

The Vitest unit-test runner (`pnpm test:run`) is unaffected by this change because the existing unit tests do NOT import the LiveKit module (they mock `livekitServerClient` at the test boundary). The E2E test (`pnpm test:e2e -- LIVEKIT_E2E=1`) is gated on `LIVEKIT_E2E=1` and is only run when the operator has intentionally configured the env.

#### Scenario: livekitServerClient is a module-level const, not a function

- GIVEN `src/infrastructure/livekit/livekit-server.ts` after the change
- WHEN the module is parsed
- THEN an `export const livekitServerClient` declaration MUST be present at the top level of the module
- AND `livekitServerClient` MUST be assigned a `new LiveKitServerClient(...)` expression
- AND no `getLiveKitServerClient` function declaration or `export function getLiveKitServerClient` MUST remain in the module

#### Scenario: Call sites use the const directly, not a function accessor

- GIVEN the call sites in `src/infrastructure/api/routers/bookings.ts` (inside `getRoomToken`) and `src/app/api/livekit/webhook/route.ts` (inside the POST handler)
- WHEN the files are inspected
- THEN both MUST reference `livekitServerClient` as a value (e.g. `livekitServerClient.createToken(...)` or `livekitServerClient.verifyWebhook(...)`)
- AND neither MUST call `getLiveKitServerClient()` (the function form)
- AND `pnpm tsc --noEmit` MUST pass with no `getLiveKitServerClient is not a function` or similar errors

#### Scenario: Missing LIVEKIT_API_KEY fails at boot, not per-request

- GIVEN `.env.local` exists but does NOT contain `LIVEKIT_API_KEY`
- WHEN `pnpm dev` is executed
- THEN the boot process MUST terminate (or the first request MUST fail with a non-recoverable error) within 2 seconds
- AND an `Error` whose message contains `"LiveKit env vars missing"` MUST be logged to stderr
- AND the error message MUST name `LIVEKIT_API_KEY` AND `LIVEKIT_API_SECRET`
- AND the message MUST point to `docs/livekit.md` (or the updated `docs/dev-setup.md` per `dev-setup/spec.md`)
- AND no request to `/citas/[id]/llamada` is required to observe the failure — the failure is at import time

#### Scenario: Missing LIVEKIT_API_SECRET fails at boot with the same message shape

- GIVEN `.env.local` has `LIVEKIT_API_KEY=devkey` but is missing `LIVEKIT_API_SECRET`
- WHEN `pnpm dev` is executed
- THEN the boot MUST fail with an `Error` whose message contains `"LiveKit env vars missing"`
- AND the message MUST name `LIVEKIT_API_SECRET` so the operator can fix the specific missing var

#### Scenario: Present vars produce a single shared instance

- GIVEN both `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are set to `devkey` / `secret`
- WHEN `livekit-server.ts` is imported once at boot
- THEN `livekitServerClient` MUST be assigned exactly once (the `const` initializer runs once)
- AND a second import of the module MUST return the same `livekitServerClient` reference (Node module cache guarantees this; the test verifies identity via `===`)
- AND the existing boot-time validation scenarios from `livekit-infrastructure/spec.md` (the "Boot-Time Env Validation" requirement — "present vars instantiate the singleton") MUST continue to pass

#### Scenario: Unset LIVEKIT_API_KEY surfaces in <2 seconds without a livekit call

- GIVEN `LIVEKIT_API_KEY` is unset
- WHEN the operator runs `pnpm dev` and observes the terminal
- THEN the error message MUST appear in the terminal within 2 seconds of `next dev` starting
- AND no browser navigation, no `getRoomToken` call, and no user action is required to trigger the error
- AND the operator can `Ctrl+C` immediately and fix `.env.local` without waiting for a request to fail
