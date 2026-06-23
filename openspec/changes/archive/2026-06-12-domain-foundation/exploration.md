## Exploration: Domain Foundation

### Current State

The project has **infrastructure scaffolding only** (from `init-infra`):
- Project config (package.json, tsconfig, next.config, ESLint, Prettier, Docker, Vitest, Playwright)
- Tailwind v4 + shadcn/ui theme (globals.css)
- `cn()` utility (src/lib/utils.ts)
- Empty Clean Architecture directories: `domain/`, `application/`, `infrastructure/`, `presentation/`, `shared/`, `compliance/`, `seo/`
- No `.git` repo initialized
- No Drizzle schema, `drizzle.config`, or migrations
- No tRPC routers, API routes, or auth setup
- No tests beyond the Vitest setup mock
- `openspec/specs/` is empty (no main specs written)
- Extensive Engram planning exists: stack v2, 10 process domains, roles, data model, compliance analysis, competitive analysis

**What exists in Engram (planning), not in code:**
- Roles: Usuario, Paciente, Doctor (curated), Admin, DPO, Superadmin, Tutor, Staff, Content, Finanzas, Aseguradora
- Core entities: usuarios, doctores, pacientes (with tutores), citas, historial_clinico, audit_log, consentimientos
- Business model: Intermediary platform, curated doctors, mixed subscription + per-consultation
- 10 process domains: discovery, search, booking, pre-consultation, consultation, post-consultation, follow-up, doctor backoffice, admin/compliance, cross-cutting

### Affected Areas

- `src/domain/` — New domain entities, value objects, enums, and business rules (pure TS)
- `src/shared/` — Shared value objects and types (Email, Phone, DNI/NIE, etc.)
- `src/infrastructure/db/` — New Drizzle schema, drizzle.config.ts
- `src/infrastructure/db/migrations/` — Generated migrations
- `src/infrastructure/db/index.ts` — DB client initialization
- `openspec/specs/domain-foundation/` — Delta specs for this change
- `tests/` — Unit tests for domain entities and value objects
- `docs/SETUP.md` — Updated migration instructions
- `openspec/changes/domain-foundation/` — SDD artifacts for this change

### Approaches

1. **Domain-only (pure TS, no DB)**
   - Define only domain entities, value objects, and enums in `src/domain/` and `src/shared/`. No Drizzle schema, no DB connection, no migrations.
   - Pros: Pure Clean Architecture, maximum testability, zero infrastructure coupling, smallest change scope, easy to review (~300 lines)
   - Cons: No persistence means you can't run the app meaningfully. Drizzle schema must be done as a separate change, and you risk divergence between domain model and DB schema.
   - Effort: Low

2. **Domain + Drizzle schema (recommended)**
   - Define domain entities + value objects + Drizzle schema + drizzle.config + migrations + DB client init in a single change. Domain entities remain pure (no Drizzle decorators) — the schema is a separate mapping layer in `infrastructure/db/`.
   - Pros: Foundation for ALL future changes is established in one atomic change. Domain and schema are defined together, preventing drift. DB can be initialized and migrated. Everything downstream depends on this.
   - Cons: More code (~600-800 lines). Need to decide schema-first (migrations) vs code-first (push) approach upfront.
   - Effort: Medium

3. **Full vertical slice — domain + schema + repositories + first use case**
   - Everything in approach 2 plus repository interfaces in domain, repository implementations in infrastructure, and the first use case (e.g., "register usuario") with a tRPC router.
   - Pros: End-to-end demo from day one. Immediate proof that the architecture works.
   - Cons: Too much for a single PR (likely 1200+ lines). Couples the foundation decision to a specific use case. Risky because auth is not yet set up. Exceeds 800-line review budget.
   - Effort: High

### Recommendation

**Approach 2 — Domain + Drizzle schema.**

**Reasoning:**

1. **Intrinsic coupling**: Domain entities and the Drizzle schema are two representations of the same model. Defining them in separate changes guarantees rework — you'll realize in the schema phase that a value object needs additional constraints, or that a domain rule affects column types. Define them together, once.

2. **Downstream dependency**: EVERY subsequent change (auth, booking, search, consultation) depends on both the domain model AND the DB schema. Blocking one without the other means nothing downstream can start. This change unblocks the entire project.

3. **Review budget**: The 800-line budget (from openspec config) can accommodate this. Domain entities are typically ~15-25 lines each, value objects ~10 lines, Drizzle schema ~15-25 lines per table. With 5-6 entities and 5-6 value objects + drizzle.config + DB client + tests, we're well within 800 lines.

4. **Clean separation**: Domain entities remain PURE TypeScript (no Drizzle imports). The Drizzle schema in `infrastructure/db/schema/` is a separate mapping layer. This preserves Clean Architecture's dependency rule — domain knows nothing about infrastructure.

**Entities for this first change (foundation layer):**

| Entity / Value Object | Module | Why first change |
|---|---|---|
| `Email` (VO) | `shared/lib/email.ts` | Used everywhere |
| `Phone` (VO) | `shared/lib/phone.ts` | Used everywhere |
| `DNI_NIE` (VO) | `shared/lib/dni-nie.ts` | Spanish identity, compliance |
| `FullName` (VO) | `shared/lib/full-name.ts` | Used everywhere |
| `Address` (VO) | `shared/lib/address.ts` | Patient/doctor data |
| `UserRole` (enum) | `domain/enums.ts` | RBAC foundation |
| `ConsultationStatus` (enum) | `domain/enums.ts` | Booking/consultation states |
| `Usuario` (entity) | `domain/entities/usuario.ts` | Base user for all roles |
| `Doctor` (entity) | `domain/entities/doctor.ts` | Curated doctor profile |
| `Paciente` (entity) | `domain/entities/paciente.ts` | Patient with clinical data |
| `Cita` (entity) | `domain/entities/cita.ts` | Appointment/consultation |
| `AuditLog` (entity) | `domain/entities/audit-log.ts` | Compliance requirement |
| `Consentimiento` (entity) | `domain/entities/consentimiento.ts` | RGPD requirement |
| Drizzle schema for all above | `infrastructure/db/schema/` | Foundation for migrations |

**Entities explicitly NOT in this change:**
- `Tutor` (pivot table, belongs with Paciente domain in booking phase)
- `HistorialClinico`, `Receta`, `Diagnostico` (post-consultation domain)
- `Factura`, `Pago`, `Comision` (finances/admin domain)
- `SolicitudARCO`, `BreachNotification` (compliance domain — Phase 2)
- Meilisearch indices, Redis caching, MinIO file references

### Risks

- **Drizzle config decisions**: Must choose between `drizzle-kit generate` (schema-first) and `drizzle-kit push` (code-first). `generate` is safer for production and recommended.
- **Value object validation**: Phone and DNI formats are Spain-specific. Must validate Spanish formats from day one (e.g., `+34` prefix, DNI letter algorithm). This adds complexity but is non-negotiable for correctness.
- **Domain entity purity**: Team must resist the urge to add Drizzle decorators to domain entities. The schema is a separate mapping layer. This is a discipline requirement.
- **No auth yet**: Usuario entity includes password_hash field, but actual auth.js integration is a later change. The entity must exist for everything else to reference it.

### Ready for Proposal

**Yes** — this exploration is comprehensive enough to move to `sdd-propose`.

**What the orchestrator should tell the user before proposal:**
- The first change will be named **`domain-foundation`**
- Scope: Domain entities + value objects + Drizzle schema + migrations + DB client init
- Excluded from this change: repositories, use cases, tRPC routers, auth, UI
- The user should confirm: (1) whether Drizzle schema should be code-first (`push`) or migration-first (`generate`), (2) whether Tutor entity should be included now or deferred, (3) the exact list of entities is correct for the foundation layer
