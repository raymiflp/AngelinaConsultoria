# Capability: e2e-video-call

## Purpose

Define the end-to-end Playwright test that proves the MVP acceptance criterion: two authenticated users (one doctor, one patient) on the platform can simultaneously join the same cita's video call, see and hear each other, and trigger the cita auto-completion when both leave. This is the safety net that prevents the call flow from regressing every time `bookings.ts`, `livekit-server.ts`, or the call page component changes. The test is opt-in via `LIVEKIT_E2E=1` and is the only verification path that exercises real browser contexts against a real (dev) LiveKit instance.

## Requirements

### REQ-VC-E2E-1: Two authenticated browser contexts join the same cita

The system MUST provide a Playwright test (`tests/e2e/videocall-2-users.spec.ts`) that creates two independent browser contexts via `browser.newContext()`, logs one in as the seeded doctor (`doctor.dev@medico.local`) and the other as the seeded paciente (`paciente.dev@medico.local`) through the existing `/login` form, and navigates both contexts to `/citas/{citaId}/llamada` for the cita produced by `pnpm seed:dev` (the cita where both users are participants, `modalidad === 'ONLINE'`, `estado === 'CONFIRMADA'`, `fechaHora` within the next 5 minutes).

The test MUST NOT bypass authentication (no `storageState` injection, no direct cookie setting). Both users MUST complete the real login form — fill email, fill password, click submit, wait for navigation away from `/login` — so the test exercises the full session lifecycle end-to-end.

The test MUST be skipped automatically when `process.env.LIVEKIT_E2E !== '1'`, with a clear `test.skip()` message referencing `LIVEKIT_E2E=1` and `docs/dev-setup.md`. The default skip behavior ensures the test never blocks CI environments that do not have a running LiveKit container.

#### Scenario: Both contexts authenticate and navigate to the call page

- GIVEN `LIVEKIT_E2E=1`, the dev stack is running (`pnpm dev` + Docker services up), and `pnpm seed:dev` has been executed producing citaId `C`
- WHEN the Playwright test opens two `browser.newContext()` instances and logs each in via `/login`
- THEN the doctor context MUST land on the dashboard or root after submit (no `/login` URL)
- AND the paciente context MUST land on the dashboard or root after submit
- AND both contexts MUST successfully `page.goto('http://localhost:3000/citas/C/llamada')` without an HTTP error response
- AND both contexts MUST NOT receive an `UNAUTHORIZED` tRPC error from `getRoomToken` (both are participants of cita `C`)

#### Scenario: Test is skipped when LIVEKIT_E2E is not set

- GIVEN `LIVEKIT_E2E` is unset or not equal to `'1'`
- WHEN the test file is executed
- THEN the test body MUST be skipped via `test.skip(...)` and MUST NOT create browser contexts
- AND the Playwright reporter MUST report the test as `skipped`, NOT `failed`

### REQ-VC-E2E-2: Both contexts reach the LiveKitRoom success state within 10 seconds

After navigating to `/citas/{citaId}/llamada`, each browser context MUST reach the success state — meaning the `<LiveKitRoom>` element is mounted in the DOM with the `<VideoConference>` child rendered inside it — within 10 seconds of the navigation completing. The 10-second budget covers the token query round-trip, the LiveKit signaling handshake (`ws://localhost:7880`), and the initial media track negotiation.

The test MUST assert the success state using `await expect(page.locator('[data-lk-component="livekit-room"]')).toBeVisible({ timeout: 10_000 })` or an equivalent selector that the `<LiveKitRoom>` component exposes. A loading spinner that persists past 10 seconds is a regression (the gate is upstream — by the time the page renders, the token has already been issued and the room is joining).

#### Scenario: Both contexts show the LiveKitRoom mounted within 10 seconds

- GIVEN the test from REQ-VC-E2E-1 has just navigated both contexts to the call page
- WHEN the test waits up to 10 seconds on the LiveKitRoom visibility selector in each context
- THEN both contexts MUST resolve the `expect(...).toBeVisible()` assertion within the 10-second timeout
- AND no context MUST show the `"Conectando con la sala…"` loading text after success
- AND no context MUST show the error `<p role="alert">` element

#### Scenario: One context slow to mount does not block the other

- GIVEN the doctor context reaches success state at t=2s and the paciente context at t=8s
- WHEN the test asserts the success state on both contexts in parallel via `Promise.all`
- THEN the test MUST pass as long as both succeed within the 10-second individual budget
- AND the slow context MUST NOT cause the fast context's assertion to time out

### REQ-VC-E2E-3: LiveKit server reports exactly 2 participants in the room

While both contexts are connected, the LiveKit server MUST report exactly 2 participants in the room `cita-{citaId}`. The test MUST verify this in one of two ways (the implementation picks one, both are acceptable): (a) on-screen via the `[data-lk-participant-count]` attribute or the participant tile grid showing exactly 2 tiles, OR (b) server-side via the LiveKit HTTP admin API (`GET http://localhost:7880/twirp/livekit.RoomService/ListParticipants` with the dev credentials) returning exactly 2 entries for the room.

The test MUST assert `participantCount === 2` (not `>= 2`, not `<= 2` — exactly 2). A count of 1 means one context failed to join silently; a count of 3 means a stale session or a leaked context from a prior run leaked in. Both are regressions.

#### Scenario: Participant count is exactly 2 during the call

- GIVEN both contexts are in the success state from REQ-VC-E2E-2
- WHEN the test reads the participant count from the chosen verification surface
- THEN the count MUST be exactly 2
- AND the count MUST be stable across at least 2 consecutive polls 1 second apart (not a transient blip during join)

#### Scenario: Participant count drops to 0 after both contexts disconnect

- GIVEN both contexts were at count 2
- WHEN both contexts call `context.close()` to clean up
- THEN within 5 seconds the participant count MUST drop to 0 (verified via the same surface used in the positive case)
- AND no orphaned participant entries MUST remain in the room

### REQ-VC-E2E-4: room_finished webhook fires and updates the cita to COMPLETADA within 30 seconds

After both contexts disconnect, the LiveKit server MUST deliver a `room_finished` webhook event to `POST /api/livekit/webhook`. The webhook handler MUST verify the signature, dedupe the event, dispatch to `autoCompleteOnRoomFinishedUseCase`, and the use case MUST atomically transition the cita from `EN_CURSO` to `COMPLETADA` (because both participants were present — `participantCount >= 1` at the moment the room finished; see `video-calls-api` REQ-VCA-WH-2). The full chain MUST complete within 30 seconds of both contexts closing.

The test MUST verify the transition by polling the cita row directly: `SELECT estado FROM citas WHERE id = ${citaId}`. The poll interval MUST be 1 second, the total timeout 30 seconds. The final state MUST be exactly `'COMPLETADA'` — NOT `'NO_ASISTIO'` (both users joined, so participantCount is 2, not 0).

This requirement MAY be marked as a soft assertion when the LiveKit container cannot reach `host.docker.internal:3000` (e.g. Linux without `extra_hosts` configured) — the test MUST log a warning and continue rather than fail, because R5 in the proposal acknowledges this is a known dev-only gap and the underlying logic is covered by unit tests in `livekit-webhooks`.

#### Scenario: Cita transitions to COMPLETADA within 30 seconds of disconnect

- GIVEN both contexts disconnected and the participant count is 0
- WHEN the test polls `SELECT estado FROM citas WHERE id = ${citaId}` every 1 second for up to 30 seconds
- THEN within 30 seconds the `estado` MUST be exactly `'COMPLETADA'`
- AND NO `NO_ASISTIO` transition MUST occur (both users joined, so the threshold of `participantCount >= 1` is met)
- AND an `audit_logs` row with `accion === 'CITA_AUTO_COMPLETED_BY_WEBHOOK'` MUST be present (verified via a SELECT query)

#### Scenario: Webhook unreachable logs a warning instead of failing

- GIVEN the LiveKit container cannot reach the Next.js webhook URL (Linux without `extra_hosts: host.docker.internal:host-gateway`)
- WHEN the test polls for the cita state transition
- THEN the test MUST log a `console.warn` explaining the webhook chain is not exercised in this environment
- AND the test MUST NOT fail on the webhook assertion
- AND the assertion on `participanteCount === 2` (REQ-VC-E2E-3) MUST still be enforced

### REQ-VC-E2E-5: Bidirectional media is established

While both contexts are connected, the test MUST verify that bidirectional media is flowing — i.e., the doctor context is receiving the patient's audio/video track AND the patient context is receiving the doctor's audio/video track. The test MUST verify this via one of two acceptable approaches:

(a) **DOM-level**: assert that both contexts have exactly 2 `<video>` elements visible in the participant tile grid (one local tile + one remote tile per context). A blank frame on the remote tile is still acceptable for the assertion — the presence of the `<video>` element proves the track was subscribed. The track's `readyState` MUST be `>= 2` (HAVE_CURRENT_DATA) within 15 seconds of the LiveKitRoom mounting.

(b) **Server-level**: query the LiveKit admin API (`ListParticipants`) and confirm each participant's `tracks` array contains at least one published video track AND at least one published audio track.

The test MUST NOT rely on actual visual frame analysis (pixel diffs, etc.) — that level of verification is fragile in CI. Track subscription (`<video>` element + non-zero `videoWidth`/`videoHeight`, or admin API track list) is the contract.

#### Scenario: Both contexts show 2 video tiles

- GIVEN both contexts are in the success state with participant count 2
- WHEN the test asserts `await expect(page.locator('video')).toHaveCount(2, { timeout: 15_000 })` on each context
- THEN both contexts MUST satisfy the assertion within 15 seconds
- AND the remote `<video>` element on each context MUST have `videoWidth > 0` AND `videoHeight > 0` (track has actual frames)

#### Scenario: Audio track is published in both directions

- GIVEN both contexts are connected with 2 video tiles visible
- WHEN the test checks the LiveKit admin API `ListParticipants` response
- THEN each participant entry MUST include at least one audio track with `mimeType` starting with `"audio/"` AND at least one video track with `mimeType` starting with `"video/"`
- AND the doctor participant identity MUST match `/^doctor-/` AND the paciente identity MUST match `/^paciente-/`
