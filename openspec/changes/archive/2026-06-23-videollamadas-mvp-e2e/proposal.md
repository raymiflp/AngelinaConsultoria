# Proposal: Videollamadas MVP end-to-end

## Change name

`videollamadas-mvp-e2e` (folder: `videollamadas-mvp-e2e/`, no date prefix — this change has no temporal urgency; the audit was filed under `2026-06-20-livekit-tls-prod`).

## Intent

El MVP de **medico-consulta** ya tiene todas las piezas técnicas para que dos usuarios puedan hacer una videollamada: autenticación con Auth.js v5, reserva de citas con `createAppointment` y protección `FOR UPDATE`, emisión de tokens de LiveKit con cuatro gates (auth, status, ventana de tiempo, modalidad), la página `/citas/[id]/llamada` montada sobre `<LiveKitRoom>` + `<VideoConference>`, y el webhook de `room_finished` que auto-completa la cita. El audit de `livekit-tls-prod` (verify-report `PASS-WITH-WARNINGS`, 547/547 tests) confirma que **22 de 24** specs base están implementadas. Lo que falta para que el producto se sienta "desplegable" como MVP no es código nuevo de producto: es la **capa de confidence operativa** — un test E2E que pruebe laacceptance criterion del usuario en un browser real, datos de seed repetibles para que un operador nuevo pueda reproducir el flujo sin escribir fixtures a mano, un runbook copy-pasteable para levantar el entorno desde cero, y un fix de un footgun de boot (LiveKit env vars validados tarde en runtime en vez de al cargar el módulo).

El éxito de este cambio se mide por una sola pregunta que cualquier operador puede responder en menos de diez minutos: *"si clono el repo, sigo el runbook, ejecuto el seed, abro dos pestañas y me logueo como doctor y como paciente, ¿puedo verme y oírme en la videollamada?"* Hoy esa respuesta es **no verificable** sin escribir fixtures a mano. Después de este cambio, la respuesta es **sí, automáticamente, y queda un test E2E que lo prueba en CI**.

## Why

El audit `openspec/changes/archive/2026-06-20-livekit-tls-prod/verify-report.md` cierra con 547/547 tests passing, `tsc --noEmit` clean, `pnpm build` verde, y un delta spec (`REQ-LI-PROD-1`) que cubre el deploy de producción. Lo que el audit NO cerró son los cinco huecos que separan "tests verdes" de "MVP demostrable":

1. **LiveKit lazy init es un footgun de boot.** `src/infrastructure/livekit/livekit-server.ts:107-119` instancia `LiveKitServerClient` en el primer `getLiveKitServerClient()`, no al cargar el módulo. Un operador que se olvida de copiar `.env.local.example` no se entera hasta que un paciente intenta entrar a la llamada y la request devuelve `INTERNAL_SERVER_ERROR`. La fix es una línea: `export const livekitServerClient = new LiveKitServerClient();` al nivel del módulo. Trade-off: cualquier página que importe transitivamente el router de bookings fallará al boot si las env vars faltan. Ese trade-off es **deseable** — prefieres un error 500 al `pnpm dev` que un error 500 tres horas después, en producción, cuando un paciente espera.

2. **No hay integration tests con DB real.** La lógica de booking (`FOR UPDATE`, UPSERT, gates) está cubierta por mocks. Los mocks no prueban que la transacción se comporte bien bajo concurrencia real, ni que los índices de Postgres resuelvan el `SELECT ... FOR UPDATE` sin deadlock. Un test E2E con dos contextos de Playwright escribiendo en la misma DB atrapa estos problemas.

3. **No hay seed script.** El único camino para tener un doctor + un paciente + una cita es: registrar el doctor, registrar el paciente, esperar la confirmación de email (que en dev no existe), ir al perfil del doctor, copiar el ID, ir al booking como paciente, pegar el ID, elegir slot, confirmar. ~10 minutos para algo que un script puede hacer en 200 ms.

4. **No hay E2E test que pruebe la acceptance criterion.** El usuario explícitamente dijo: "Quiero como resultado poder realizar una llamada entre 2 usuarios de la plataforma." Sin un test automatizado, esta acceptance criterion se degrada cada vez que alguien toca `bookings.ts`, `livekit-server.ts`, o el componente de la página de llamada. El test es la red de seguridad del MVP.

5. **No hay runbook para el operador.** El audit reconoce que el setup es complejo: LiveKit en Docker, Redis, Postgres, MinIO, Meilisearch, env vars, migraciones, seed. Si el operador nuevo sigue `README.md` y `docs/livekit.md` en orden, llega. Pero no hay una **secuencia única** que diga "haz esto, luego esto, luego esto, y vas a ver dos pestañas hablando". Ese es el runbook.

## Scope

### In scope

- `src/infrastructure/livekit/livekit-server.ts` — MODIFIED. Reemplazar el lazy singleton (`getLiveKitServerClient()`) por una instancia module-level (`export const livekitServerClient = new LiveKitServerClient();`). Actualizar todos los call sites (router de bookings, route de webhook) para usar el export directo. Cambio neto: ~10 líneas (eliminar 12 líneas de `getLiveKitServerClient` + 2 líneas de export + ajustes en call sites).
- `scripts/seed-dev.ts` — NEW, ~60 líneas. Script idempotente (`tsx scripts/seed-dev.ts`). Crea `doctor.test@medico-consulta.local` + `paciente.test@medico-consulta.local` con bcryptjs 12 rounds (mismo patrón que `src/infrastructure/auth/password.ts`), genera `doctor.test` profile con `aceptaOnline: true`, agenda una cita `ONLINE` 5 minutos en el futuro (ventana de 30 min, suficiente para que el operador abra las pestañas). Usa el caso de uso `createAppointment` existente, no reinventa la lógica. Output: `console.log` con las credenciales y el `citaId` para copy-paste al navegador.
- `package.json` — MODIFIED, +3 líneas. Añadir `"seed:dev": "tsx scripts/seed-dev.ts"` a la sección `scripts`.
- `tests/e2e/videocall-2-users.spec.ts` — NEW, ~80 líneas. Playwright spec con **dos `browser.newContext()`** (doctor + paciente). Cada contexto: login vía el form de `/login`, navegación a `/citas/[id]/llamada`, espera al estado `connected` del `<LiveKitRoom>` (selector `data-lk-participant-count` o el `<video>` del participante remoto). Aserción: ambos contextos reportan 1 participante remoto. Cleanup: cierra ambos contextos. Skip automático si `LIVEKIT_E2E=0`.
- `playwright.config.ts` — MODIFIED, +5 líneas. Añadir un proyecto `chromium-livekit` que use `webServer` apuntando a `pnpm dev` con `LIVEKIT_E2E=1`, baseURL `http://localhost:3000`, y reuse del server entre tests.
- `docs/dev-setup.md` — NEW, ~40 líneas. Runbook copy-pasteable: 7 secciones lineales (Prerequisites → Install → Env → DB → Seed → Run → Smoke test). Cierra con un smoke test manual de 2 pestañas (el operador abre `/login` como doctor en una ventana, como paciente en otra incognito, ambos van a `/citas/[id]/llamada`, confirman audio/video, cierran, verifican en el home que la cita está `COMPLETADA`).
- `docs/livekit.md` — MODIFIED, +2 líneas. Una línea al final del doc apuntando a `docs/dev-setup.md` para la secuencia completa de dev.
- `openspec/changes/videollamadas-mvp-e2e/specs/e2e-video-call/spec.md` — NEW (delta). ADDED requirement cubriendo el test E2E de 2 usuarios.
- `openspec/changes/videollamadas-mvp-e2e/specs/dev-seed/spec.md` — NEW (delta). ADDED requirement cubriendo el seed script y su idempotencia.
- `openspec/changes/videollamadas-mvp-e2e/specs/dev-setup/spec.md` — NEW (delta). ADDED requirement cubriendo el runbook y el smoke test de 2 pestañas.
- `openspec/changes/videollamadas-mvp-e2e/specs/livekit-infrastructure/spec.md` — NEW (delta). ADDED requirement `REQ-LI-INIT-1`: el cliente LiveKit se instancia eagerly al cargar el módulo; un fallo de env vars se manifiesta como excepción al boot, no en runtime.

### Out of scope

- Nuevas features de videollamada (chat en llamada, screen-share, recording UI, virtual backgrounds). El MVP no las necesita; cada una es un cambio separado con su propio spec.
- `aceptaOnline` per-day (toggle diario de disponibilidad online). Ya documentado como follow-up en `2026-06-19-modality-toggle`. La cita seed usa `aceptaOnline: true` global del perfil del doctor.
- Deploy de producción. El dominio de `livekit-tls-prod` (Caddy, `--dev` removal, `node_ip`, UDP 7882). Este cambio es dev/MVP only.
- Pin de la imagen `livekit/livekit-server:latest`. Documentado como follow-up (`livekit-pin-image`).
- TURN server de producción. Documentado como follow-up (`livekit-turn-prod`).
- Nuevos roles RBAC. El MVP usa los 3 roles existentes (`PACIENTE`, `MEDICO`, `ADMIN`).
- Migración a React 19 server components para la página de llamada. La página sigue siendo `"use client"`; refactor a RSC es ortogonal.
- Notificaciones post-llamada (email al paciente con la grabación, Slack al médico, etc.). `cita-eventing` follow-up.
- Cambios al webhook de LiveKit. La lógica de `room_finished` → `COMPLETADA` ya está implementada y auditada en `livekit-webhooks`. El E2E test **verifica** que esa lógica sigue funcionando, no la modifica.
- Cambios al `createAppointment` use case. El seed reusa el caso de uso existente.

## Capabilities (contract with sdd-spec)

### New Capabilities

- `e2e-video-call`: el test de Playwright con dos contextos de browser que prueba la acceptance criterion del usuario (dos usuarios autenticados, en la misma cita `ONLINE`, conectados a LiveKit, audio/video bidireccional). Cubre también la limpieza: el webhook `room_finished` cierra la cita en `COMPLETADA`.
- `dev-seed`: el script `scripts/seed-dev.ts` que produce 1 doctor + 1 paciente + 1 cita `ONLINE` cerca en el tiempo, idempotente (re-ejecutable sin duplicar datos), y que loguea credenciales + `citaId` para uso manual.
- `dev-setup`: el runbook `docs/dev-setup.md` con la secuencia copy-pasteable de 7 pasos para que un operador nuevo levante el entorno desde `git clone` hasta el smoke test de 2 pestañas.

### Modified Capabilities (delta specs)

- `livekit-infrastructure`: ADDED requirement `REQ-LI-INIT-1` — el `LiveKitServerClient` se instancia eagerly como module-level singleton. Una env var faltante (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`) produce una excepción al cargar el módulo, no en runtime. El accessor `getLiveKitServerClient()` se elimina. La contract cambia de "lazy, no rompe páginas sin video" a "eager, falla rápido al boot". Justificación: el comportamiento lazy actual oculta errores de configuración del operador hasta que un usuario real intenta una llamada.

## Approach

- **Fix eager init**: editar `src/infrastructure/livekit/livekit-server.ts`. Eliminar `_instance` + `getLiveKitServerClient()`. Añadir `export const livekitServerClient = new LiveKitServerClient();` después de la declaración de la clase. Buscar con `grep -r "getLiveKitServerClient" src/` y reemplazar cada call site por `livekitServerClient`. Sitios esperados: `src/infrastructure/api/routers/bookings.ts` (uso en `getRoomToken`) y `src/app/api/livekit/webhook/route.ts` (uso en `verifyWebhook`). Confirmar con `pnpm tsc --noEmit` que no quedan referencias.
- **Seed script**: crear `scripts/seed-dev.ts` con `tsx` runner (ya en el proyecto, ver `package.json` `scripts`). El script: (1) conecta a la DB via `drizzle` + `postgres`, (2) `upsert` del doctor con `ON CONFLICT (email) DO NOTHING`, (3) idem del paciente, (4) busca el `medicoId` del doctor test, (5) invoca `createAppointment({ pacienteId, medicoId, fechaHora: now + 5min, modalidad: 'ONLINE' })`, (6) `console.log` del bloque. Idempotencia probada: re-ejecutar el script dos veces seguidas produce el mismo `citaId` y un solo `INSERT` efectivo en `audit_logs`.
- **E2E test**: crear `tests/e2e/videocall-2-users.spec.ts`. Estructura: `test('dos usuarios se ven en la misma cita', async ({ browser }) => { ... })`. Dos `context = await browser.newContext()`, dos `page = await context.newPage()`. Cada `page.goto('/login')`, fill form con las credenciales del seed, click submit, espera a `/dashboard` o `/`. Cada `page.goto(\`/citas/${citaId}/llamada\`)`, espera a `[data-lk-participant-count="2"]` o un `await expect(page.locator('video')).toHaveCount(2, { timeout: 30_000 })`. Cleanup: `context.close()`. Skip con `test.skip(!process.env.LIVEKIT_E2E, '...')`.
- **Playwright config**: añadir a `playwright.config.ts` un bloque `projects: [{ name: 'chromium-livekit', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] }]` y un `webServer` que corra `pnpm dev` solo si no hay un server ya escuchando en 3000.
- **Runbook**: `docs/dev-setup.md` con 7 secciones lineales. Cada sección termina con un bloque de código copy-pasteable. Cierra con el smoke test manual de 2 pestañas como **sección 7** (la más importante).
- **Package script**: `package.json` `scripts.seed-dev = "tsx scripts/seed-dev.ts"`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/infrastructure/livekit/livekit-server.ts` | Modified | Eager module-level singleton; eliminar `getLiveKitServerClient()`. |
| `src/infrastructure/api/routers/bookings.ts` | Modified | Reemplazar `getLiveKitServerClient()` por `livekitServerClient` en `getRoomToken`. |
| `src/app/api/livekit/webhook/route.ts` | Modified | Reemplazar `getLiveKitServerClient()` por `livekitServerClient` en `verifyWebhook`. |
| `scripts/seed-dev.ts` | New | Seed script idempotente. |
| `package.json` | Modified | +1 script: `seed:dev`. |
| `tests/e2e/videocall-2-users.spec.ts` | New | 2-context Playwright E2E. |
| `playwright.config.ts` | Modified | Proyecto `chromium-livekit` + `webServer`. |
| `docs/dev-setup.md` | New | Runbook de 7 pasos. |
| `docs/livekit.md` | Modified | +2 líneas, link a `dev-setup.md`. |
| `openspec/changes/videollamadas-mvp-e2e/specs/e2e-video-call/spec.md` | New (delta) | ADDED requirements para el E2E test. |
| `openspec/changes/videollamadas-mvp-e2e/specs/dev-seed/spec.md` | New (delta) | ADDED requirements para el seed. |
| `openspec/changes/videollamadas-mvp-e2e/specs/dev-setup/spec.md` | New (delta) | ADDED requirements para el runbook. |
| `openspec/changes/videollamadas-mvp-e2e/specs/livekit-infrastructure/spec.md` | New (delta) | ADDED requirement `REQ-LI-INIT-1` (eager init). |

## Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R1** | El cambio de lazy → eager init rompe el `pnpm dev` en máquinas sin `LIVEKIT_API_KEY` configurado (CI sin LiveKit, otros devs sin copiar el env). | Medium | Medium | El test runner (`pnpm test:run`) no importa el módulo de LiveKit en sus unit tests, así que el boot de Vitest no se ve afectado. El E2E test solo corre con `LIVEKIT_E2E=1`. Para devs sin env: el error aparece **antes** del primer request HTTP (al `pnpm dev`), con un mensaje claro "LiveKit env vars missing. Set LIVEKIT_API_KEY..." que el nuevo `dev-setup.md` explica en §4. |
| **R2** | El seed script duplica datos si la tabla `usuarios` ya tiene los emails de test (no idempotente). | Medium | Low | `INSERT ... ON CONFLICT (email) DO NOTHING` para usuarios y perfiles. Para citas: `SELECT` antes de `INSERT` y reusar la existente si está en estado `PROGRAMADA` o `CONFIRMADA`. El script está cubierto por su propio integration test (idempotency loop x3). |
| **R3** | El E2E test es flaky por timeout de conexión a LiveKit (UDP negociation lenta en CI). | High | Medium | Timeout explícito de 30s en el `expect` del video. `test.retry(1)` para el primer reintento automático. Skip en CI sin `LIVEKIT_E2E=1` (defecto: el test es opt-in). Documentar en el spec que el test corre local con Docker y se salta en CI estándar. |
| **R4** | El runbook se desactualiza rápido (versiones cambian, comandos rotan). | Low | Low | El runbook se ancla a `pnpm` (lockfile committed) y a `docker compose` (compose file committed). Las versiones exactas vienen de `package.json` y `docker-compose.yml`, no del doc. Una nota al inicio del doc: "versiones ancladas a `package.json` y `docker-compose.yml`; no hardcodear versiones aquí". |
| **R5** | El webhook `room_finished` no se dispara en el E2E test (LiveKit dev mode no envía webhooks a `host.docker.internal`). | Medium | High | El test verifica la **acceptance criterion visible al usuario** (dos pestañas se ven en LiveKit), no la cadena completa del webhook. El auto-complete vía webhook ya está cubierto por el test unit del use case en `livekit-webhooks` (PASS-WITH-WARNINGS). El E2E no intenta cubrir la cadena webhook — lo deja al integration test existente. |

## Success metrics

- [ ] **Aceptación funcional**: dos contextos de Playwright abren `/citas/[id]/llamada` simultáneamente, ambos reportan 2 participantes en la room, el video del participante remoto es visible en cada contexto. Verificable con `pnpm test:e2e -- LIVEKIT_E2E=1`.
- [ ] **Auto-complete**: el webhook `room_finished` se dispara cuando ambos contextos cierran, y la cita en la DB transiciona a `COMPLETADA` en <10 segundos. Verificable con `SELECT estado FROM citas WHERE id = $1` post-test.
- [ ] **Eager init**: con `LIVEKIT_API_KEY` borrado de `.env.local`, `pnpm dev` falla con el mensaje "LiveKit env vars missing" en <2 segundos, no en runtime. Verificable con `unset LIVEKIT_API_KEY && pnpm dev`.
- [ ] **Seed idempotente**: ejecutar `pnpm seed:dev` tres veces seguidas produce exactamente 1 doctor, 1 paciente, 1 cita. Verificable con `SELECT count(*) FROM usuarios WHERE email LIKE '%.test@medico-consulta.local'`.
- [ ] **Runbook ejecutable**: un operador sin contexto del proyecto, partiendo de un clone limpio, completa los 7 pasos de `docs/dev-setup.md` en <10 minutos y ve la cita seed en `/dashboard`. Verificable con un timer externo.
- [ ] **Sin regresiones**: `pnpm test:run` sigue en 547/547, `pnpm tsc --noEmit` sigue limpio, `pnpm build` sigue verde, `pnpm lint` no añade warnings. Verificable con los 4 comandos en orden.
- [ ] **Budget respetado**: <200 líneas cambiadas en total (excluyendo el spec delta), bien bajo el cap de 800.

## Dependencies (existing specs referenced, not modified)

- `video-calls-api/spec.md` — el endpoint `bookings.getRoomToken` con sus 4 gates, el webhook `POST /api/livekit/webhook`. El cambio **no los modifica**; los usa.
- `video-calls-ui/spec.md` — la página `/citas/[id]/llamada` con sus 3 estados (loading/error/success) y `<LiveKitRoom>`. El cambio **no la modifica**; el E2E test la ejercita.
- `booking-api/spec.md` — el `createAppointment` use case con `FOR UPDATE` y el gate de modalidad. El seed lo reusa.
- `booking-ui/spec.md` — el form de reserva y la lista de citas. El seed produce datos que la UI puede mostrar.
- `livekit-infrastructure/spec.md` — el cliente `LiveKitServerClient`, las env vars (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`), el `docker-compose.yml`. El cambio **modifica** el comportamiento de init (eager) y por eso tiene un delta spec.
- `auth-core/spec.md` — `hashPassword` con bcryptjs 12 rounds, `verifyPassword`. El seed usa el mismo `hashPassword` que el register flow.
- `auth-api/spec.md` — el `auth.ts` de Auth.js v5 con Credentials provider. El E2E test usa el form de `/login` que este spec define.

## Estimated size

| File | LOC | Type |
|---|---|---|
| `src/infrastructure/livekit/livekit-server.ts` | ~-8 / +2 | Modified (eliminar `getLiveKitServerClient`, añadir export eager) |
| `src/infrastructure/api/routers/bookings.ts` | ~-1 / +1 | Modified (call site update) |
| `src/app/api/livekit/webhook/route.ts` | ~-1 / +1 | Modified (call site update) |
| `scripts/seed-dev.ts` | ~60 | New |
| `package.json` | +1 | Modified (script) |
| `tests/e2e/videocall-2-users.spec.ts` | ~80 | New |
| `playwright.config.ts` | +10 | Modified (proyecto + webServer) |
| `docs/dev-setup.md` | ~40 | New |
| `docs/livekit.md` | +2 | Modified (bridge link) |
| **Total (excl. spec deltas)** | **~190** | 3 new files + 5 modified files |
| 4× `openspec/changes/videollamadas-mvp-e2e/specs/*/spec.md` | ~30 each (~120 total) | New (delta) |
| **Grand total** | **~310** | 7 new + 5 modified |

Bajo el cap de 800 líneas por **margen amplio** (39%). El single-PR es la decisión correcta: no hay seam natural para chained PRs (el seed + el E2E test se rompen mutuamente si se parten; el runbook solo tiene sentido con el seed funcionando).

## Rollback plan

El cambio vive en código de aplicación + scripts + docs + tests. No toca migraciones, no toca `docker-compose.yml`, no toca specs base (solo agrega deltas). El rollback es:

1. **Eager init (R1)**: revertir el `export const livekitServerClient = new LiveKitServerClient();` a `function getLiveKitServerClient()` con lazy init. Restaurar los call sites. Cambio neto: ~15 líneas revertidas, sin pérdida de datos.
2. **Seed script**: borrar `scripts/seed-dev.ts` y la línea `seed:dev` en `package.json`. Los datos seeded en la DB local **no se borran automáticamente** (es un script, no una migration). El operador puede borrarlos manualmente con un `DELETE FROM citas WHERE ...` o seguir usando los datos de test.
3. **E2E test**: borrar `tests/e2e/videollamadas-mvp-e2e` y el proyecto `chromium-livekit` del `playwright.config.ts`.
4. **Docs**: borrar `docs/dev-setup.md`. Revertir las 2 líneas de `docs/livekit.md`.
5. **Spec deltas**: borrar `openspec/changes/videollamadas-mvp-e2e/`. Los deltas nunca llegaron a la spec base (eso pasa en `sdd-archive`), así que no hay merge que deshacer.

El dev workflow (`pnpm dev`, `docker compose up -d`, `pnpm test:run`) sigue funcionando después del rollback. El único síntoma es que el operador vuelve al estado pre-cambio: sin seed, sin E2E, sin runbook, con lazy init.

## Decision needed before apply

No. Los 5 huecos del audit están mapeados a deliverables concretos. Los 5 riesgos tienen mitigación explícita. La acceptance criterion del usuario está reflejada literal en los success metrics. El budget está bajo el cap con margen. No hay preguntas abiertas.

## Chain strategy

`stacked-to-main` (single PR). 310 líneas totales (incluyendo deltas), 190 excluyendo deltas. No hay seam natural: el seed, el E2E y el runbook son interdependientes (el E2E necesita el seed, el runbook explica cómo correr el seed y el E2E). Single PR es la decisión correcta. Chained PR solo se justifica si el apply detecta que la implementación real pasa de 600 líneas.

## Adjacent changes (NOT in scope, see Out of scope)

- `livekit-turn-prod` — TURN server para redes restrictivas.
- `livekit-pin-image` — pin de `livekit/livekit-server:latest` a un digest.
- `livekit-recording` — recording + egress webhooks.
- `call-page-ux-redesign` — UX post-auto-complete.
- `cita-eventing` — notificaciones Slack/email.
- `aceptaOnline-per-day` — toggle diario de disponibilidad online.
