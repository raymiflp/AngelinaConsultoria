# Proposal: Domain Foundation

## Intent

Establish the pure domain model and Drizzle ORM persistence layer — the foundation every future feature depends on. Without this change, no entity, use case, or API can be built.

## Scope

### In Scope
- Shared value objects (Email, Phone, DNI_NIE, FullName, Address) in `src/shared/lib/`
- Domain enums (UserRole, ConsultationStatus) and entities (Usuario, Doctor, Paciente, Cita, AuditLog, Consentimiento) in `src/domain/`
- Drizzle ORM schema mapping all entities in `src/infrastructure/db/schema/`
- `drizzle.config.ts` + generated migrations + DB client init
- Unit tests for value objects and entities

### Out of Scope
- Tutor entity (deferred to booking phase)
- Repositories, use cases, tRPC routers, auth integration, UI components
- Clinical entities (HistorialClinico, Receta, Diagnostico)
- Compliance entities beyond Consentimiento and AuditLog

## Capabilities

### New Capabilities
<!-- Each becomes openspec/specs/<name>/spec.md -->
- `shared-types`: Shared value objects for identity (Email, DNI_NIE), contact (Phone), personal data (FullName, Address) used across all domains
- `domain-entities`: Core domain entities (Usuario, Doctor, Paciente, Cita, AuditLog, Consentimiento) and enums (UserRole, ConsultationStatus) with business rules and invariants
- `db-schema`: Drizzle ORM table schema definitions for all entities, `drizzle.config.ts`, generated SQL migrations, and DB client initialization

### Modified Capabilities
None — first application change, no existing specs.

## Approach

Domain-first with parallel Drizzle schema. Entities remain pure TS in `src/domain/entities/` — zero Drizzle imports. The schema layer in `src/infrastructure/db/schema/` maps entities to PostgreSQL tables via Drizzle ORM. Migrations use `drizzle-kit generate` (migration-first). DB client init uses postgres.js connection pooling.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/shared/lib/` | New | Email, Phone, DNI_NIE, FullName, Address value objects |
| `src/domain/enums.ts` | New | UserRole, ConsultationStatus enums |
| `src/domain/entities/` | New | 6 entity files (usuario, doctor, paciente, cita, audit-log, consentimiento) |
| `src/infrastructure/db/schema/` | New | Drizzle table schema files for all entities |
| `src/infrastructure/db/drizzle.config.ts` | New | Drizzle Kit configuration |
| `src/infrastructure/db/index.ts` | New | DB client init with connection pool |
| `src/infrastructure/db/migrations/` | New | Generated SQL migrations |
| `tests/unit/` | New | Unit tests for all VOs and entities |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Spanish-format validation gaps (DNI, Phone) | Med | Exhaustive tests for DNI letter algorithm, +34 prefix, address format |
| Domain-schema drift over time | Low | Schema generated alongside entities; future changes MUST update both |
| Drizzle config incompatible with PG setup | Low | Use env vars with .env.example; verify via docker-compose |

## Rollback Plan

1. Drop all new DB tables: `DROP TABLE IF EXISTS consentimientos, audit_logs, citas, pacientes, doctores, usuarios CASCADE`
2. Delete all new files: `src/shared/lib/`, `src/domain/entities/`, `src/domain/enums.ts`, `src/infrastructure/db/`
3. Remove test files in `tests/unit/` for domain and shared
4. No data loss risk — no production DB exists yet

## Dependencies

- PostgreSQL running locally or via Docker (docker-compose.yml from init-infra)
- `drizzle-orm`, `drizzle-kit`, `postgres.js` packages in `package.json`
- TypeScript path aliases configured (from init-infra)

## Success Criteria

- [ ] All value objects validate input and throw on invalid data (email format, DNI letter algorithm, phone prefix)
- [ ] All domain entities are pure TS — zero Drizzle imports in `src/domain/` or `src/shared/`
- [ ] `drizzle-kit generate` produces correct SQL migrations for all 6 tables
- [ ] DB client connects and migrations apply cleanly against local PostgreSQL
- [ ] All unit tests pass: `npx vitest run`
- [ ] TypeScript compilation passes: `npx tsc --noEmit`
