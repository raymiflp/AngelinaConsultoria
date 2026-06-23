# Tasks: Domain Foundation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~700 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | auto-forecast |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Value Objects, Domain Entities, Drizzle Schema, Verification | PR 1 | Single PR — all phases tightly coupled (entities depend on VOs, schema mirrors entities) |

## Phase 1: Value Objects & Shared Types

- [x] 1.1 Create `src/shared/lib/email.ts` + `phone.ts` — branded classes with ctor validation, `equals()`, `toString()`. Email: RFC 5321 simplified, lowercased local part. Phone: `+34` prefix, 9 digits, strip non-digits. Tests cover valid/invalid formats, structural equality per shared-types spec
- [x] 1.2 Create `src/shared/lib/dni-nie.ts` + `full-name.ts` — DNI_NIE with modulo-23 letter algorithm (NIE X→0/Y→1/Z→2), FullName with first name + ≥1 last name, min 2 chars each, Unicode alpha/hyphen/apostrophe. Tests cover valid DNI/NIE, invalid letter, name length constraints per spec
- [x] 1.3 Create `src/shared/lib/address.ts` + `src/shared/lib/index.ts` barrel — Address with street/city/province/postalCode(5 digits)/country(default "España"), all fields non-empty trimmed. Tests cover valid/invalid postal codes, formatted `toString()` per spec

## Phase 2: Domain Entities

- [x] 2.1 Create `src/domain/enums/index.ts` — `UserRole` (10 values including PACIENTE, DOCTOR, ADMIN, DPO, SUPERADMIN, TUTOR, STAFF, CONTENT, FINANZAS, ASEGURADORA) and `ConsultationStatus` (6 values: PENDIENTE, CONFIRMADA, EN_CURSO, COMPLETADA, CANCELADA, NO_ASISTIO) with transition validation helper per domain-entities spec
- [x] 2.2 Create `src/domain/entities/usuario.ts`, `doctor.ts`, `paciente.ts` — pure TS classes with static `create()`, private constructor, VO composition. Usuario: UUID id, Email, FullName, Phone, passwordHash (non-empty), UserRole, activo (default true). Doctor: numeroColegiado, especialidad, verificado (default false), calificacionMedia (0-5 range). Paciente: fechaNacimiento, Address, alergias (default `[]`), grupoSanguineo
- [x] 2.3 Create `src/domain/entities/cita.ts`, `audit-log.ts`, `consentimiento.ts` — Cita: doctorId, pacienteId, fechaHora (must be future), estado (default PENDIENTE), motivo (non-empty), duracionMinutos (default 30). AuditLog: accion, entidadAfectada, entidadId, direccionIP (all non-empty), detalles (JSON nullable), createdAt auto-set. Consentimiento: tipo, version, aceptado, fechaAceptacion (required if aceptado=true), fechaExpiracion (must be after fechaAceptacion)
- [x] 2.4 Create `src/domain/entities/index.ts` barrel + `__tests__/*.test.ts` — test Usuario empty passwordHash rejection, Cita PENDIENTE→CONFIRMADA transition, past fechaHora rejection, Consentimiento missing fechaAceptacion, expiration before acceptance per domain-entities spec scenarios

## Phase 3: Drizzle Schema & DB

- [x] 3.1 Create `src/infrastructure/db/schema/usuarios.ts`, `doctores.ts`, `pacientes.ts` — Drizzle `pgTable` definitions. usuarios: uuid PK, email (unique), password_hash, role, nombre, telefono, activo (default true), timestamps. doctores: FK→usuarios.id, numero_colegiado (unique), especialidad, precio_consulta (numeric nullable), verificado (default false). pacientes: FK→usuarios.id, fecha_nacimiento, direccion fields, alergias (text[]), grupo_sanguineo
- [x] 3.2 Create `src/infrastructure/db/schema/citas.ts`, `audit-logs.ts`, `consentimientos.ts` — citas: FK→doctores.id + FK→pacientes.id, fecha_hora, estado (default PENDIENTE), motivo, duracion_minutos (default 30), precio. audit_logs: FK→usuarios.id, accion, entidad_afectada, entidad_id, detalles (jsonb nullable), direccion_ip, created_at. consentimientos: FK→usuarios.id, tipo, version, aceptado, fecha_aceptacion (nullable), fecha_expiracion (nullable)
- [x] 3.3 Create `src/infrastructure/db/schema/index.ts` (barrel + drizzle-orm relations), `src/infrastructure/db/index.ts` (postgres.js pool, max 10 connections, DATABASE_URL env, typed Drizzle instance with all schemas), and `drizzle.config.ts` (pg dialect, schema dir, migrations output, DATABASE_URL env read) — per db-schema spec

## Phase 4: Verification

- [x] 4.1 Run `npx tsc --noEmit` — all new files compile without errors, domain layer has zero infrastructure imports
- [x] 4.2 Run `npx vitest run` — all 124 unit tests pass (14 test files) covering Email, Phone, DNI_NIE, FullName, Address, Usuario, Doctor, Paciente, Cita, AuditLog, Consentimiento value/entity invariants per all three spec documents
- [x] 4.3 Run `npx drizzle-kit generate` — migration output contains 6 CREATE TABLE statements with correct columns, FKs, and constraints. Added `DATABASE_URL` to `.env.example`
