# Dev Setup

> Looking for the seed credentials? Run `pnpm seed:dev` after step 6 and
> the script prints them.

This runbook takes a fresh `git clone` to "two browser tabs successfully
joined in a video call" in under 10 minutes. Versions are anchored to
`package.json` and `docker-compose.yml`; do not hardcode versions here
— they will drift.

## 1. Prerequisites

- **Node.js 22+** (`node --version` should print `v22.x` or higher).
- **pnpm** (use `corepack enable && corepack prepare pnpm@11 --activate`
  for the version pinned in `packageManager`).
- **Docker Desktop** (Mac/Windows) or **Docker Engine + Compose v2**
  (Linux). `docker compose version` should print a `v2.x` line.

## 2. Install

```bash
pnpm install
```

## 3. Env

```bash
cp .env.example .env.local
```

Then edit `.env.local` and set the LiveKit block (the dev defaults
match the `--dev` mode of `livekit-server`):

```bash
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
LIVEKIT_WEBHOOK_URL=http://host.docker.internal:3000/api/livekit/webhook
```

Plus the standard `DATABASE_URL`, `REDIS_URL`, `MINIO_*`, `MEILI_*`
copied from `.env.example`. The `LiveKitServerClient` is instantiated
eagerly at boot (REQ-LI-INIT-1) so a missing LiveKit var fails
`next dev` immediately, not at the first request.

## 4. DB services

```bash
docker compose up -d postgres redis minio meilisearch livekit
```

All five services should report `healthy` (or `running`) within ~30s.
One verification command per service:

- `postgres` (port 5432) — `docker compose ps postgres` shows `healthy`.
- `redis` (port 6379) — `docker compose ps redis` shows `healthy`.
- `minio` (ports 9000, 9001) —
  `curl -fsS http://localhost:9000/minio/health/live` returns 200.
- `meilisearch` (port 7700) —
  `curl -fsS http://localhost:7700/health` returns
  `{"status":"available"}`.
- `livekit` (port 7880) — `curl -fsS http://localhost:7880` returns a
  LiveKit server identification string.

## 5. Migrations

```bash
pnpm db:migrate
```

Applies the Drizzle migrations in `src/infrastructure/db/migrations/`
in order. The first time, this creates all 11 tables (`usuarios`,
`doctores`, `pacientes`, `citas`, `audit_logs`, `consentimientos`,
`doctor_disponibilidad`, `doctor_experiencia`, `doctor_servicios`,
`doctor_condiciones`, and the auth/session tables).

Verify the connection:

```bash
pnpm db:studio
```

Opens Drizzle Studio at `https://local.drizzle.studio` — the schema
should render without errors.

## 6. Seed

```bash
pnpm seed:dev
```

Idempotent. Creates one doctor + one paciente + one cita scheduled 5
minutes in the future (status `CONFIRMADA`, modality `ONLINE`). The
script reuses the application-layer `createAppointmentUseCase` — the
same path the patient UI exercises — so the booking invariants (`FOR
UPDATE`, modality gate, audit log) are validated end-to-end.

Sample output:

```text
=== angelina-consultoria dev seed ===
Doctor:   doctor.dev@angelina.local   /   DoctorDev123!
Paciente: paciente.dev@angelina.local /   PacienteDev123!
Cita ID:  8d2a1f8e-2b1c-4f00-aaaa-000000000099
Cita URL: http://localhost:3000/citas/8d2a1f8e-2b1c-4f00-aaaa-000000000099/llamada
Room:     cita-dev-8d2a1f8e
```

Re-run the script any time — it exits 0, prints the same cita id, and
does not duplicate the cita while it is in a non-terminal state
(`CONFIRMADA` / `PENDIENTE` / `EN_CURSO`).

## 7. Run

```bash
pnpm dev
```

Open `http://localhost:3000` and log in. Or skip the dashboard and go
straight to the smoke test (step 8).

## 8. Smoke test

Open TWO browser tabs — the second MUST be a private / incognito
window so the two sessions have isolated cookies:

1. **Tab 1** (regular): open `http://localhost:3000/login`, log in as
   `doctor.dev@angelina.local` / `DoctorDev123!`. Verify the dashboard
   loads.
2. **Tab 2** (incognito): open `http://localhost:3000/login`, log in
   as `paciente.dev@angelina.local` / `PacienteDev123!`. Verify the
   dashboard loads.
3. **Both tabs**: navigate to the `Cita URL:` printed by
   `pnpm seed:dev` (the shape is
   `http://localhost:3000/citas/<uuid>/llamada`).
4. **Both tabs**: accept the camera/microphone permission prompt
   (Chrome shows a small bar at the top of the page; click Allow).
5. **Both tabs**: confirm TWO video tiles are visible in each tab —
   one local + one remote. The remote tile in each tab shows the
   other participant's face.
6. **Both tabs**: click "Leave" (or close the tab) in BOTH tabs.
7. **Tab 1**: refresh `http://localhost:3000/citas/<uuid>`. The cita
   status badge should now read `COMPLETADA` (the LiveKit
   `room_finished` webhook transitioned the cita automatically). If
   after 30 seconds the badge still reads `EN_CURSO`, see the
   troubleshooting matrix below — likely the LiveKit container
   cannot reach `host.docker.internal:3000`.

**Pass criteria**: both tabs see each other's video; status badge
reads `COMPLETADA` within 30 seconds of the second tab leaving.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `pnpm dev` exits with `"LiveKit env vars missing"` | `.env.local` is missing `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | `cp .env.example .env.local` and verify the two vars are `devkey` / `secret` |
| `docker compose ps livekit` shows the container as `Exit 1` or not running | LiveKit image pulled with a stale config, or port 7880 occupied | `docker compose logs livekit` for the actual error; `docker compose down && docker compose up -d livekit` |
| `getRoomToken` returns `FORBIDDEN` with `"La cita debe estar confirmada antes…"` | Cita status is `PENDIENTE`, not `CONFIRMADA` (seed defaulted, or operator manually edited) | Re-run `pnpm seed:dev`; the script forces `estado = 'CONFIRMADA'`. Verify with `pnpm db:studio` |
| `getRoomToken` returns `FORBIDDEN` with `"La videollamada se habilita 15 minutos antes…"` | Operator opened the URL outside the cita's ±15 minute window | Use the URL printed by `pnpm seed:dev` (which schedules for `now + 5min`); re-run the seed if more than 15 minutes have passed since the original run |
| Smoke test step 5: only one video tile per tab | LiveKit container cannot reach the browser (WebRTC failed) | `docker compose logs livekit` for the join error; on a real browser, allow camera/mic when prompted |
| Smoke test step 7: badge still reads `EN_CURSO` after 30s | LiveKit webhook cannot reach `host.docker.internal:3000/api/livekit/webhook` | Verify `docker-compose.yml` has `extra_hosts: host.docker.internal:host-gateway` (Linux); Mac/Windows Docker Desktop resolves the hostname natively |
