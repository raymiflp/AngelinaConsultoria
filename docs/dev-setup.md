# Dev Setup

> Looking for the seed credentials? Run `pnpm seed:dev` after step 6 and
> the script prints them.

This runbook takes a fresh `git clone` to "two browser tabs successfully
joined in a video call" in under 10 minutes. Versions are anchored to
`package.json` and `docker-compose.yml`; do not hardcode versions here
— they will drift.

## Why this stack

The local dev stack mirrors the production stack as closely as possible
(ADR-0001: Vercel-Only Deployment). What runs in Docker locally is what
Vercel runs in production (Postgres). What runs as a managed service
locally (LiveKit Cloud free project, Upstash REST free DB) is the same
managed service in production. See
[`docs/architecture/decisions/0001-vercel-only.md`](../architecture/decisions/0001-vercel-only.md)
for the rationale.

## 1. Prerequisites

- **Node.js 22+** (`node --version` should print `v22.x` or higher).
- **pnpm** (use `corepack enable && corepack prepare pnpm@11 --activate`
  for the version pinned in `packageManager`).
- **Docker Desktop** (Mac/Windows) or **Docker Engine + Compose v2**
  (Linux). `docker compose version` should print a `v2.x` line.
- **LiveKit Cloud free dev project** at https://livekit.cloud (no credit
  card required). You will paste its API key/secret/URL into
  `.env.local` in step 3.

## 2. Install

```bash
pnpm install
```

## 3. Env

```bash
cp .env.example .env.local
```

Then edit `.env.local` and set the LiveKit Cloud block (paste values
from your LiveKit Cloud dev project dashboard):

```bash
LIVEKIT_API_KEY=APIxxxxxxxxxxxx
LIVEKIT_API_SECRET=<base64-from-dashboard>
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_WEBHOOK_URL=http://host.docker.internal:3000/api/livekit/webhook
```

Plus the standard `DATABASE_URL` (the example points at local Postgres)
and the `UPSTASH_*` env vars (the example points at a free Upstash dev
DB; create one at https://upstash.com if you want rate-limiting and
caching to actually run in dev — without them, both degrade to no-op).

The `LiveKitServerClient` is instantiated eagerly at boot
(`REQ-LI-INIT-1`) so a missing LiveKit var fails `next dev` immediately,
not at the first request.

## 4. DB services

```bash
docker compose up -d postgres redis
```

Two services should report `healthy` within ~30s. One verification
command per service:

- `postgres` (port 5432) — `docker compose ps postgres` shows `healthy`.
- `redis` (port 6379) — `docker compose ps redis` shows `healthy`.

LiveKit, MinIO, and MeiliSearch are no longer in `docker-compose.yml`
(see ADR-0001): LiveKit is now a Cloud service, MinIO is now Vercel
Blob, MeiliSearch was unused and has been removed.

## 5. Migrations

```bash
pnpm db:migrate
```

Applies the Drizzle migrations in `src/infrastructure/db/migrations/`
in order. The first time, this creates all tables (`usuarios`,
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
   other participant's face. The connection runs over `wss://` to your
   LiveKit Cloud project (NOT `ws://localhost:7880` — that was the
   self-hosted LiveKit story, retired by ADR-0001).
6. **Both tabs**: click "Leave" (or close the tab) in BOTH tabs.
7. **Tab 1**: refresh `http://localhost:3000/citas/<uuid>`. The cita
   status badge should now read `COMPLETADA` (the LiveKit
   `room_finished` webhook transitioned the cita automatically). If
   after 30 seconds the badge still reads `EN_CURSO`, see the
   troubleshooting matrix below — likely the LiveKit Cloud webhook is
   not configured to reach your local URL.

**Pass criteria**: both tabs see each other's video; status badge
reads `COMPLETADA` within 30 seconds of the second tab leaving.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `pnpm dev` exits with `"LiveKit env vars missing"` | `.env.local` is missing `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | `cp .env.example .env.local` and paste your LiveKit Cloud project values |
| `getRoomToken` returns `FORBIDDEN` with `"La cita debe estar confirmada antes…"` | Cita status is `PENDIENTE`, not `CONFIRMADA` (seed defaulted, or operator manually edited) | Re-run `pnpm seed:dev`; the script forces `estado = 'CONFIRMADA'`. Verify with `pnpm db:studio` |
| `getRoomToken` returns `FORBIDDEN` with `"La videollamada se habilita 15 minutos antes…"` | Operator opened the URL outside the cita's ±15 minute window | Use the URL printed by `pnpm seed:dev` (which schedules for `now + 5min`); re-run the seed if more than 15 minutes have passed since the original run |
| Smoke test step 5: only one video tile per tab | LiveKit Cloud project cannot reach the browser (WebRTC failed) — check the Cloud dashboard's connection logs | Allow camera/mic when prompted; verify the Cloud project's region is close to your location |
| Smoke test step 7: badge still reads `EN_CURSO` after 30s | LiveKit Cloud webhook is not configured to reach your local URL | In the LiveKit Cloud dashboard, set the webhook URL to `http://host.docker.internal:3000/api/livekit/webhook` (Mac/Windows Docker Desktop resolves this natively; on Linux use `host-gateway`) or use a tunnel (ngrok/cloudflared) |
