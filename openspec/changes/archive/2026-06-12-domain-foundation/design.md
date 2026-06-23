# Design: Domain Foundation

## Technical Approach

Domain-first with parallel Drizzle schema — entities are pure TypeScript classes in `src/domain/entities/` with zero infrastructure imports. Value objects live in `src/shared/lib/` as branded immutable types with construction-time validation. The Drizzle schema in `src/infrastructure/db/schema/` is a separate mapping layer. Migrations use `drizzle-kit generate` (schema-first → SQL). This approach matches the exploration recommendation and the proposal's scope — one atomic change that unblocks all downstream features.

Unit tests co-locate with source files (`src/**/*.test.ts`) per vitest.config.ts convention. No repositories, use cases, or tRPC routers in this change.

## Architecture Decisions

| Decision | Options | Tradeoff | Choice |
|----------|---------|----------|--------|
| **Value Object pattern** | (a) Branded class with ctor validation (b) Zod schema + inferred type (c) Plain type alias | Zod adds runtime overhead and layer coupling; plain types lack validation guarantees. Classes encapsulate validation and invariants. | **(a)** — Validate on construction, use `as const` branding for type safety |
| **Entity pattern** | (a) Class with behavior (b) Interface + functions (c) Zod + infer | Rich domain requires behavior methods (state transitions, validation) that functions don't organize well. Classes also provide `instanceof` checks. | **(a)** — Factory methods on static `create()`, behavior methods, private constructor |
| **Schema mapping** | (a) Decorators on domain entities (b) Separate mapping files (c) TypeScript interfaces only | Decorators couple domain to Drizzle — violating Clean Architecture. Separate mapping is more code but preserves purity. | **(b)** — `infrastructure/db/schema/*.ts` maps entities independently |
| **Migration strategy** | (a) `drizzle-kit generate` (b) `drizzle-kit push` | `push` is convenient for dev but unsafe for production — it diffs schema against live DB and applies changes implicitly. `generate` produces auditable SQL. | **(a)** — `generate` for production safety, `push` only for local dev |
| **DB client** | (a) Singleton module (b) Class with DI (c) Per-request instantiation | No DI framework yet. Singleton with env vars is simplest for infrastructure init. DI refactor later when needed. | **(a)** — `src/infrastructure/db/index.ts` exports a singleton sql client |
| **Naming** | (a) English everywhere (b) Spanish domain + English code (c) Full Spanish | Domain is Spain healthcare. Entities (Usuario, Cita) and enums (UserRole) match the business language. Columns/Tables use snake_case. | **(b)** — Spanish names for domain concepts, English for technical patterns |
| **Test location** | (a) Co-located `*.test.ts` (b) Central `tests/unit/` | vitest.config.ts includes `src/**/*.{test,spec}.{ts,tsx}` — tests co-located by convention. Avoids fighting the config. | **(a)** — `*.test.ts` alongside each module |

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        Domain Layer                             │
│  src/shared/lib/          src/domain/enums.ts                   │
│  ┌──────────────┐        ┌──────────────────┐                   │
│  │ Email (VO)   │        │ UserRole         │                   │
│  │ Phone (VO)   │        │ ConsultationStatus│                  │
│  │ DNI_NIE (VO) │        └────────┬─────────┘                   │
│  │ FullName (VO)│                 │                             │
│  │ Address (VO) │                 ▼                             │
│  └──────┬───────┘  src/domain/entities/                         │
│         │          ┌─────────────────────┐                      │
│         └─────────→│ Usuario             │  ← has Email, etc.   │
│                    │ Doctor              │  ← extends Usuario   │
│                    │ Paciente            │  ← has Address, etc. │
│                    │ Cita                │  ← references Doctor │
│                    │ AuditLog            │  ← compliance        │
│                    │ Consentimiento      │  ← RGPD              │
│                    └────────┬────────────┘                      │
├─────────────────────────────┼──────────────────────────────────┤
│                   Infrastructure Layer                          │
│                             ▼                                   │
│  src/infrastructure/db/schema/  (mapping, NOT domain entities)  │
│  ┌─────────────────────────────────────────────┐                │
│  │ usuarios, doctores, pacientes, citas,        │                │
│  │ audit_logs, consentimientos tables           │                │
│  └─────────────────────┬───────────────────────┘                │
│                        ▼                                       │
│  drizzle-kit generate  ──→  SQL migrations                      │
│  src/infrastructure/db/index.ts  ──→  postgres connection pool  │
└─────────────────────────────────────────────────────────────────┘
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/shared/lib/email.ts` | Create | `Email` branded value object |
| `src/shared/lib/phone.ts` | Create | `Phone` branded VO with Spanish `+34` validation |
| `src/shared/lib/dni-nie.ts` | Create | `DNI_NIE` branded VO with letter algorithm |
| `src/shared/lib/full-name.ts` | Create | `FullName` branded VO (nombre + apellidos) |
| `src/shared/lib/address.ts` | Create | `Address` branded VO (calle, ciudad, CP, provincia) |
| `src/shared/lib/index.ts` | Create | Barrel export for all VOs |
| `src/domain/enums.ts` | Create | `UserRole`, `ConsultationStatus` enums |
| `src/domain/entities/usuario.ts` | Create | Base entity for all users, with Email, hashed password, role |
| `src/domain/entities/doctor.ts` | Create | Extends Usuario, adds specialties, license number, bio |
| `src/domain/entities/paciente.ts` | Create | Extends Usuario, adds FullName, Phone, Address, DNI_NIE |
| `src/domain/entities/cita.ts` | Create | Appointment with DateTime, Doctor ref, Paciente ref, status |
| `src/domain/entities/audit-log.ts` | Create | Compliance entity: actor, action, resource, timestamp, IP, metadata |
| `src/domain/entities/consentimiento.ts` | Create | RGPD consent: patient, type (data_processing/communication), version, dates |
| `src/domain/entities/index.ts` | Create | Barrel export for all entities |
| `src/infrastructure/db/schema/usuarios.ts` | Create | Drizzle table schema for usuarios |
| `src/infrastructure/db/schema/doctores.ts` | Create | Drizzle table schema for doctores |
| `src/infrastructure/db/schema/pacientes.ts` | Create | Drizzle table schema for pacientes |
| `src/infrastructure/db/schema/citas.ts` | Create | Drizzle table schema for citas |
| `src/infrastructure/db/schema/audit-logs.ts` | Create | Drizzle table schema for audit_logs |
| `src/infrastructure/db/schema/consentimientos.ts` | Create | Drizzle table schema for consentimientos |
| `src/infrastructure/db/schema/index.ts` | Create | Barrel export and relations |
| `src/infrastructure/db/index.ts` | Create | DB client singleton (Env: `DATABASE_URL`) |
| `drizzle.config.ts` | Create | Drizzle Kit config with `generate` strategy |
| `src/shared/lib/__tests__/email.test.ts` | Create | Unit tests for Email VO |
| `src/shared/lib/__tests__/phone.test.ts` | Create | Unit tests for Phone VO with Spanish prefixes |
| `src/shared/lib/__tests__/dni-nie.test.ts` | Create | Unit tests for DNI/NIE letter algorithm |
| `src/domain/entities/__tests__/usuario.test.ts` | Create | Unit tests for Usuario creation / role validation |
| `src/domain/entities/__tests__/cita.test.ts` | Create | Unit tests for Cita state transitions |

Total: 28 new files, 0 modifications, 0 deletions. Estimated ~700 lines.

## Interfaces / Contracts

### Value Object Pattern (shared)

```typescript
// Branded type — carries validation guarantee in the type system
export type EmailBrand = { readonly __brand: "Email" };
export class Email {
  private constructor(readonly value: string) {}
  static create(input: string): Email {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input))
      throw new Error("Invalid email format");
    return new Email(input);
  }
  equals(other: Email): boolean { return this.value === other.value; }
}
```

### Entity Pattern (domain)

```typescript
// Pure TS — no Drizzle, no ORM
export class Usuario {
  private constructor(
    readonly id: string,
    readonly email: Email,
    readonly nombreCompleto: FullName,
    readonly passwordHash: string,
    readonly rol: UserRole,
    readonly createdAt: Date,
    readonly updatedAt: Date,
  ) {}
  static create(props: { email: Email; nombreCompleto: FullName; rol: UserRole; passwordHash: string }): Usuario {
    return new Usuario(
      crypto.randomUUID(), props.email, props.nombreCompleto,
      props.passwordHash, props.rol, new Date(), new Date(),
    );
  }
}
```

### Drizzle Schema Pattern (infrastructure)

```typescript
// Separated from domain — uses Drizzle imports freely
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
export const usuarios = pgTable("usuarios", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  nombreCompleto: text("nombre_completo").notNull(),
  passwordHash: text("password_hash").notNull(),
  rol: text("rol").notNull().$type<UserRole>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

## Testing Strategy

All tests co-located with source (`src/**/*.test.ts`), using Vitest with the project's existing jsdom environment.

| Layer | What to Test | Approach |
|-------|-------------|----------|
| **Value Objects** | Email format, DNI letter algorithm, phone prefix, address required fields | Construction with valid/invalid data; `equals()` contract; immutability assertion |
| **Domain Entities** | Usuario creation with valid VOs, Cita state transitions (pending→confirmed→completed), AuditLog serialization | Factory method tests; invalid state transitions should throw; `instanceof` checks |
| **Drizzle Schema** | Type correctness (column types match domain) | Static-only — compile-time assertions; no runtime DB needed for schema definitions |
| **DB Client** | Env var loading, pool creation | Skip for now (requires live PG); document `.env.example` |

**Explicitly NOT in scope**: integration tests (require a running PostgreSQL), e2e tests, coverage thresholds enforcement (config shows 80% but this is foundation code with high coverage naturally).

## Migration / Rollout

- **Initial setup**: Run `npx drizzle-kit generate` → `npx drizzle-kit migrate` after creating the schema files. Add `DATABASE_URL` to `.env.example`.
- **Rollback**: `npx drizzle-kit drop` drops all tables. Delete `src/infrastructure/db/migrations/` and revert all new files via `git revert`.
- **No data risk**: No production database exists yet. First migration is additive only.
- **Sequencing**: Schema MUST be defined before `drizzle-kit generate` is run. All 6 entities must be in place before the first migration.

## Open Questions

- [ ] Resolve exact Spanish validation rules for DNI/NIE (NIE format with X/Y/Z prefix + 7 digits + letter — confirmed algorithm exists?)
- [ ] Confirm Doctor `especialidad` — free-text string or constrained enum with reference table?
- [ ] AuditLog `accion` — free-text or constrained enum of known action types?
- [ ] Consentimiento `tipo` — two values only (data_processing, communication) or more needed from DPO?

