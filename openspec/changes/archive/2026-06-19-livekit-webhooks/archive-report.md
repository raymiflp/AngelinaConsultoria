# Archive Report — livekit-webhooks (2026-06-19)

## Summary

The `livekit-webhooks` change shipped the D10 mitigation that closes the manual-completion loop for online video consultations: the self-hosted LiveKit container is now configured to fire a `room_finished` webhook (new `livekit.yaml` + docker-compose tweak), a Next.js route handler at `POST /api/livekit/webhook` receives it, the JWT signature is verified via the SDK's `WebhookReceiver`, the event is deduped by `event.id` in Redis with a 24h TTL (degrade-open on Redis unreachable), and a new internal use case `autoCompleteOnRoomFinishedUseCase` atomically transitions an `ONLINE` cita from `EN_CURSO` to `COMPLETADA` (≥1 participant) or `NO_ASISTIO` (0 participants), then writes a system-actor `audit_logs` row tagged `'CITA_AUTO_COMPLETED_BY_WEBHOOK'`. The D10 footer confession is removed from the call page. The change is additive at the data plane (one `ALTER COLUMN ... DROP NOT NULL` on `audit_logs.usuario_id`), additive at the infra plane, additive at the HTTP plane (one route handler, NOT tRPC), additive at the domain plane (one use case, NOT exposed via tRPC), and subtractive at the UI plane (one footer removed).

## Headline numbers

- Total LOC changed: ~750 lines
- New test scenarios: 16
- Final test count: 547 / 547 pass
- TypeScript: 0 errors
- Lint: clean
- Build: succeeded
- Drizzle: "No schema changes"
- REQ-IDs: 5 / 5 covered

## Specs synced

| Capability | Action | File |
|------------|--------|------|
| livekit-infrastructure | appended delta | openspec/specs/livekit-infrastructure/spec.md |
| video-calls-api | appended delta | openspec/specs/video-calls-api/spec.md |
| booking-api | appended delta | openspec/specs/booking-api/spec.md |
| video-calls-ui | removed + appended delta | openspec/specs/video-calls-ui/spec.md |

### Per-spec deltas merged

| Permanent spec | Requirements added | Requirements removed | Scenarios added | Scenarios removed |
|----------------|---------------------|----------------------|------------------|--------------------|
| `livekit-infrastructure/spec.md` | 1 (REQ-LI-WH-1) | 0 | 4 | 0 |
| `video-calls-api/spec.md` | 2 (REQ-VCA-WH-1, REQ-VCA-WH-2) | 0 | 8 | 0 |
| `booking-api/spec.md` | 1 (REQ-BA-WH-1) | 0 | 3 | 0 |
| `video-calls-ui/spec.md` | 1 (REQ-VCU-WH-1) | 1 (Known-Limitation Footer Note) | 2 | 2 |

Totals: 5 requirements added / 1 removed / 17 scenarios added / 2 removed across 4 specs. No new permanent specs created (proposal §Out of Scope confirms "4 delta specs, no new specs").

The `video-calls-ui` removal of `Known-Limitation Footer Note` is the canonical OpenSpec REMOVED action: the verify report confirmed the implementation matches the spec (footer removed from `src/app/citas/[id]/llamada/page.tsx`, the "footer renders" test deleted, "footer does NOT render" test added in all three states). The REMOVED + ADDED delta is internally consistent.

## Files shipped

### Created (NEW)

| File | Purpose |
|------|---------|
| `docker/dev/livekit.yaml` | LiveKit config with `webhook:` block, base64-encoded keys |
| `src/infrastructure/db/migrations/0005_massive_serpent_society.sql` | Single `ALTER TABLE audit_logs ALTER COLUMN usuario_id DROP NOT NULL` (Drizzle-generated, post-edited) |
| `src/app/api/livekit/webhook/route.ts` | POST handler: verifyWebhook → dedupe → dispatch on `room_finished` only |
| `src/application/use-cases/bookings/auto-complete-on-room-finished.use-case.ts` | System-actor use case: optimistic UPDATE + audit row |
| `src/app/api/livekit/__tests__/route.test.ts` | 8 scenarios |
| `src/application/use-cases/bookings/__tests__/auto-complete-on-room-finished.test.ts` | 10 scenarios |
| `src/infrastructure/livekit/__tests__/livekit-server.test.ts` (extend) | 3 new scenarios for verifyWebhook |
| `src/infrastructure/redis/__tests__/cache.webhookDedupe.test.ts` | 5 scenarios |
| `src/infrastructure/db/__tests__/migrations.test.ts` | 8 file-shape scenarios |

### Modified

| File | Change |
|------|--------|
| `src/infrastructure/db/schema/audit-logs.ts` | dropped `.notNull()` from `usuarioId` (FK + cascade preserved) |
| `src/application/use-cases/audit/write-audit-log.use-case.ts` | appended `CITA_AUTO_COMPLETED_BY_WEBHOOK` to `AuditAction` union; widened `usuarioId: string → string \| null` |
| `src/infrastructure/livekit/livekit-server.ts` | added async `verifyWebhook(rawBody, authHeader)` wrapping `WebhookReceiver` |
| `src/infrastructure/redis/cache.ts` | appended `webhookDedupe(eventId, ttlSeconds = 86400)` helper |
| `src/app/citas/[id]/llamada/page.tsx` | DELETED the D10 footer confession |
| `src/app/citas/[id]/llamada/__tests__/page.test.tsx` | DELETED "footer renders" assertion; ADDED "footer does NOT render" in all 3 states |
| `docker-compose.yml` | livekit service: volumes mount + `--config /etc/livekit.yaml` + `extra_hosts: host.docker.internal:host-gateway` |
| `.env.example` + `.env.local.example` | appended `LIVEKIT_WEBHOOK_URL` with cross-platform comment |
| `docs/livekit.md` | added section 5 "Webhooks" |
| `src/application/index.ts` | re-exports `autoCompleteOnRoomFinishedUseCase` + types |

## Risks (final status, R1-R12)

| Risk | Status | Evidence |
|------|--------|----------|
| R1 (forged webhooks) | MITIGATED | `LiveKitServerClient.verifyWebhook` wraps SDK `WebhookReceiver` |
| R2 (replay attacks) | MITIGATED | Redis `webhookDedupe` with 24h TTL + degrade-open |
| R3 (out-of-order events) | MITIGATED | non-EN_CURSO no-op branch |
| R4 (state corruption) | MITIGATED | terminal-state no-op + optimistic UPDATE compare-and-swap |
| R5 (LiveKit not configured) | MITIGATED | `docker/dev/livekit.yaml` mounted + `--config` flag |
| R6 (audit_logs.usuario_id not nullable) | MITIGATED | migration 0005 + schema change |
| R7 (room name parsing) | ACCEPTED RISK | regex `/^cita-([0-9a-f-]{36})$/`; BAD_REQUEST on mismatch |
| R8 (Linux parity) | MITIGATED | `extra_hosts: host.docker.internal:host-gateway` |
| R9 (image pin) | ACCEPTED RISK | `latest` preserved; deferred to `livekit-pin-image` |
| R10 (CI doesn't need LiveKit) | MITIGATED | route handler mocks SDK + use case + dedupe |
| R11 (doctor override) | MITIGATED | webhook path bypasses `updateAppointmentStatusUseCase` (separate use case) |
| R12 (clock skew) | ACCEPTED | SDK handles JWT exp/nbf; not a code concern |

## Deviations from design (5)

1. **Use case signature `(db, input)` not `(event)`** — matches project pattern (`getRoomTokenUseCase(db, input)`, `updateAppointmentStatusUseCase(db, input)`)
2. **Migration test as file-shape unit test** — matches `schema.test.ts` pattern (no live DB)
3. **`db as never` cast in route handler** — matches `bookings.ts` tRPC router pattern
4. **`@vitest-environment node` on livekit test** — jsdom/jose Uint8Array incompatibility
5. **`signWebhookJwt` rewritten with node:crypto** — exercises real signature math end-to-end

## Verification gaps (manual, user must run)

- `docker compose up -d livekit` + trigger `room_finished` event from a browser → observe cita transitions to `COMPLETADA` + audit row with `accion: 'CITA_AUTO_COMPLETED_BY_WEBHOOK'`
- Repeat with nobody joining → cita transitions to `NO_ASISTIO`
- `curl -X POST .../api/livekit/webhook -H 'Authorization: bogus' -d '{}'` → 401

## Out-of-scope reminders (NOT shipped, follow-up changes)

- `livekit-recording` (egress webhooks)
- `call-page-ux-redesign` (doctor buttons)
- `livekit-tls-prod` / `livekit-turn-prod` / `livekit-pin-image`
- `updateAppointmentStatusUseCase` modifications
- `citas.livekit_room_name` writes
- `cita-eventing` notifications

## Accepted risks (deferred)

- R7 (room name parsing via regex, fragile if LiveKit format changes)
- R9 (image pin to digest, deferred per video-calls D6 precedent)

## Future changes enabled

- `livekit-recording` — recording / egress webhooks (infrastructure ready)
- `call-page-ux-redesign` — remove doctor buttons
- `cita-eventing` — Slack/email notifications (audit log ready)
