# Capability: dev-setup

## Purpose

Define the developer onboarding runbook at `docs/dev-setup.md` — the single linear sequence of copy-pasteable commands that takes an operator from a fresh `git clone` to a working `pnpm dev` with LiveKit running and two browser tabs successfully joined in a video call. The runbook exists because the dev stack has 5 Docker services plus env files plus migrations plus seed data plus a browser smoke test, and a new operator cannot intuit that order from `README.md` alone. The runbook is the contract: every step MUST be verifiable in isolation and the smoke test MUST close the loop end-to-end.

## Requirements

### REQ-DEV-SETUP-1: Runbook lists commands in order from clone to pnpm dev

`docs/dev-setup.md` MUST exist at the project root and MUST contain a single linear sequence of numbered sections, each ending with a copy-pasteable code block. The sections MUST appear in this exact order, each gated on the previous section completing successfully:

1. **Prerequisites** — list required tools with minimum versions (Node.js, pnpm, Docker Desktop / Docker Engine + Compose v2)
2. **Install** — `pnpm install` at the repo root
3. **Env** — `cp .env.example .env.local` and the LiveKit-specific edits required
4. **DB services** — `docker compose up -d postgres redis minio meilisearch livekit`
5. **Migrations** — `pnpm db:migrate` (Drizzle migrations)
6. **Seed** — `pnpm seed:dev` (output documented in `dev-seed/spec.md`)
7. **Run** — `pnpm dev` and the URL to open
8. **Smoke test** — the 2-tab verification described in REQ-DEV-SETUP-3

Each step MUST be a single command (or a single short sequence like `cp X Y && sed -i ... Z`) — the runbook MUST NOT require the operator to read source code between steps. Where a step has multiple alternatives (e.g. `pnpm` vs `npm`), the runbook MUST pick one and note the alternative in a single sentence, NOT branch the procedure.

#### Scenario: Each step is a single copy-pasteable block

- GIVEN `docs/dev-setup.md` exists at the project root
- WHEN the file is read end-to-end
- THEN steps 1–8 MUST each contain exactly one fenced code block (```` ```bash ... ``` ````) with the command(s) the operator runs
- AND no step MUST require the operator to open an editor or read a separate file to know what to type
- AND the steps MUST be numbered sequentially (1, 2, 3, …) so an operator cannot lose their place

#### Scenario: Runbook is completable in under 10 minutes from a clean clone

- GIVEN a fresh `git clone` with no `.env.local`, no running containers, and an empty `node_modules`
- WHEN a developer follows the runbook top-to-bottom without deviation
- THEN the `pnpm dev` step MUST be reachable within 10 minutes on a modern laptop with a fast internet connection (the runbook MUST NOT include a step that takes longer than 2 minutes on its own — e.g. no manual `psql` schema creation)

### REQ-DEV-SETUP-2: Runbook documents required Docker services, env vars, and verification commands

The runbook MUST explicitly enumerate, with one sentence and one verification command per item:

- **Docker services** required for `pnpm dev`:
  - `postgres` (port 5432) — verification: `docker compose ps postgres` shows `healthy`
  - `redis` (port 6379) — verification: `docker compose ps redis` shows `healthy`
  - `minio` (ports 9000, 9001) — verification: `curl -fsS http://localhost:9000/minio/health/live` returns 200
  - `meilisearch` (port 7700) — verification: `curl -fsS http://localhost:7700/health` returns `{"status":"available"}`
  - `livekit` (port 7880) — verification: `curl -fsS http://localhost:7880` returns a LiveKit server identification string
- **Required env vars** in `.env.local`:
  - `LIVEKIT_API_KEY=devkey` and `LIVEKIT_API_SECRET=secret` (the `--dev` defaults)
  - `NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880`
  - `LIVEKIT_WEBHOOK_URL=http://host.docker.internal:3000/api/livekit/webhook`
  - `DATABASE_URL`, `REDIS_URL`, `MINIO_*`, `MEILI_*` — values from `.env.example`
- **Verification command per service**: one `docker compose ps <service>` or `curl` line that the operator can paste and that returns exit 0 if the service is healthy.

The runbook MUST NOT use the word "etc." or "and others" when listing services — every service MUST be named, and every service MUST have its own verification command.

#### Scenario: Runbook lists all 5 Docker services with verification commands

- GIVEN the runbook's "DB services" section
- WHEN the section is read
- THEN exactly 5 services MUST be listed: `postgres`, `redis`, `minio`, `meilisearch`, `livekit`
- AND each service MUST be followed by a port number and a one-line verification command
- AND the verification commands MUST be executable from the operator's shell (no missing tools)

#### Scenario: Runbook lists all required LiveKit env vars

- GIVEN the runbook's "Env" section
- WHEN the LiveKit env var block is read
- THEN `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`, and `LIVEKIT_WEBHOOK_URL` MUST all be present with their default dev values
- AND a `.env.local` snippet showing all four MUST be present in a code block

### REQ-DEV-SETUP-3: Runbook includes a 2-tab smoke test that verifies the MVP end-to-end

The runbook MUST include a "Smoke test" section (the final section, after `pnpm dev` is running) that an operator completes in under 3 minutes to verify the MVP acceptance criterion from a clean state. The smoke test MUST instruct the operator to:

1. Open `http://localhost:3000` in TWO browser tabs (the runbook MUST specify "incognito" or "private window" for one tab so the two sessions are isolated cookies — otherwise one login overwrites the other).
2. In tab 1, log in as `doctor.dev@medico.local` with password `DoctorDev123!`. Verify the dashboard loads.
3. In tab 2 (incognito), log in as `paciente.dev@medico.local` with password `PacienteDev123!`. Verify the dashboard loads.
4. Navigate both tabs to the URL printed by `pnpm seed:dev` (the `Cita URL:` line, shape `http://localhost:3000/citas/{citaId}/llamada`).
5. In each tab, accept the browser's camera/microphone permission prompt.
6. Verify: both tabs show TWO video tiles (one local + one remote). The remote tile in each tab MUST show the other participant's face.
7. Click "Leave" (or close the tab) in BOTH tabs.
8. Wait up to 30 seconds, then refresh `http://localhost:3000/citas/{citaId}` and verify the cita status badge reads `COMPLETADA` (not `EN_CURSO`).

Each numbered sub-step MUST be a single sentence the operator can act on. The smoke test MUST close with a "Pass criteria" sentence enumerating the observable successes (both tabs see each other; status becomes `COMPLETADA`) so the operator knows when to stop.

#### Scenario: Smoke test instructs two separate browser sessions

- GIVEN the "Smoke test" section
- WHEN the opening instructions are read
- THEN the section MUST explicitly say "two browser tabs" AND MUST instruct the operator to use an incognito/private window for one of them
- AND the two emails (`doctor.dev@medico.local` and `paciente.dev@medico.local`) MUST be assigned to specific tabs so the operator does not mix them up

#### Scenario: Smoke test verifies the cita auto-completes

- GIVEN the operator closed both tabs after step 7
- WHEN the operator refreshes the cita detail page per step 8
- THEN the runbook MUST instruct them to verify the status badge is `COMPLETADA`
- AND the runbook MUST specify a 30-second timeout for the transition (matching the webhook chain budget in `e2e-video-call` REQ-VC-E2E-4)
- AND the runbook MUST note that if the badge still reads `EN_CURSO` after 30 seconds, the webhook is misconfigured — see the troubleshooting matrix in REQ-DEV-SETUP-4

### REQ-DEV-SETUP-4: Runbook includes a troubleshooting matrix

The runbook MUST include a "Troubleshooting" section (after the Smoke test, or as a sibling section linked from each step) that maps the most common failure modes to their root cause and fix. The matrix MUST include AT MINIMUM these four rows:

| Symptom | Likely cause | Fix |
|---|---|---|
| Next.js boot fails with `"LiveKit env vars missing"` | `.env.local` missing `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | `cp .env.example .env.local` and verify the two vars are `devkey` / `secret` |
| `docker compose ps livekit` shows the container as `Exit 1` or not running | LiveKit image pulled with a stale config, or port 7880 occupied | `docker compose logs livekit` for the actual error; `docker compose down && docker compose up -d livekit` |
| `getRoomToken` returns `FORBIDDEN` with `"La cita debe estar confirmada antes…"` | Cita status is `PENDIENTE`, not `CONFIRMADA` (seed defaulted, or operator manually edited) | Re-run `pnpm seed:dev`; the script forces `estado = 'CONFIRMADA'`. Verify with `SELECT estado FROM citas WHERE id = ${citaId}` |
| `getRoomToken` returns `FORBIDDEN` with `"La videollamada se habilita 15 minutos antes…"` | Operator opened the URL outside the cita's ±15 minute window | Use the URL printed by `pnpm seed:dev` (which schedules for `now + 5min`); re-run the seed if more than 15 minutes have passed since the original run |

Each row MUST use the exact error message or HTTP response the operator would see, so a `grep` on the error message against the runbook finds the fix. The matrix MUST be a Markdown table, not a bulleted list.

#### Scenario: Troubleshooting matrix covers the four mandatory failure modes

- GIVEN the "Troubleshooting" section
- WHEN the table is read
- THEN it MUST have at least 4 rows
- AND the four mandatory symptoms MUST all be present (LiveKit env vars missing, LiveKit container not running, cita status not CONFIRMADA, fuera de ventana de tiempo)
- AND every row MUST have three columns: Symptom, Likely cause, Fix

#### Scenario: Error messages in the matrix match the actual application output

- GIVEN an operator sees one of the documented failure modes in their terminal or browser
- WHEN they `grep` the runbook for the error message
- THEN the row matching that error MUST exist in the matrix
- AND the error message text in the matrix MUST be a substring of the actual application output (e.g. `"LiveKit env vars missing"` is byte-identical to the boot-time error in `livekit-infrastructure/spec.md`)
