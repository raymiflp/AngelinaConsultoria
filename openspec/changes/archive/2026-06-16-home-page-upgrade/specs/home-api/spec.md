# Home API Specification

## Purpose

Define the new public tRPC procedure `getHomeStats` that powers the home page's trust counter and the home page's "doctores verificados" copy. The procedure is the only new tRPC surface in this change; it is additive and does not modify any existing procedure in `profilesRouter`. The procedure MUST be safe to call from a server-rendered landing page on every request (the page is `force-dynamic`), and MUST degrade gracefully if the database is unavailable.

## Requirements

### Requirement: getHomeStats Procedure

A new public tRPC query procedure `getHomeStats` SHALL be added to `src/infrastructure/api/routers/profiles.ts` (the existing `profilesRouter`). The procedure SHALL be declared as `publicProcedure.query(async () => { ... })` — no input, no auth required.

The procedure SHALL return an object with exactly these two fields:

```ts
{
  totalVerifiedDoctors: number;   // COUNT(*) FROM doctores WHERE verificado = true
  totalSpecialties: number;       // COUNT(DISTINCT especialidad) FROM doctores WHERE verificado = true
}
```

Both fields MUST be non-negative integers. The procedure SHALL catch any database error and return the safe fallback shape `{ totalVerifiedDoctors: 0, totalSpecialties: 0 }` rather than throwing. The fallback preserves the home page's invariant that the trust counter is hidden at zero (REQ-HOME-UI-3) — a DB outage produces the same "no stat" rendering as an empty database, never a 500 page.

The procedure SHALL be implemented via a new use case `GetHomeStatsUseCase` at `src/application/use-cases/profiles/get-home-stats.use-case.ts` (Clean Architecture: router → use case → repository). The use case SHALL use the existing Drizzle repository pattern. If the existing `DoctorRepository` does not already expose count methods, two new methods SHALL be added: `countVerifiedDoctors(): Promise<number>` and `countDistinctSpecialties(): Promise<number>` (the design phase reconciles the exact repository interface).

#### Scenario: Returns both counts on success

- GIVEN the database has 5 verified doctors across 3 distinct specialties (e.g. "Psicólogo", "Dermatólogo", "Dentista")
- WHEN `api.profiles.getHomeStats.useQuery()` is called (or invoked server-side via `createCaller`)
- THEN the response MUST be `{ totalVerifiedDoctors: 5, totalSpecialties: 3 }`
- AND no error MUST be raised

#### Scenario: Returns both counts at zero on empty database

- GIVEN the database has 0 verified doctors
- WHEN `getHomeStats` is called
- THEN the response MUST be `{ totalVerifiedDoctors: 0, totalSpecialties: 0 }`
- AND no error MUST be raised

#### Scenario: Only-verified doctors are counted

- GIVEN the database has 8 doctors total, of which 5 have `verificado = true` and 3 have `verificado = false`
- WHEN `getHomeStats` is called
- THEN `totalVerifiedDoctors` MUST be `5` (not 8)
- AND `totalSpecialties` MUST count distinct specialties only among the 5 verified doctors

#### Scenario: Specialties are deduplicated

- GIVEN the verified doctors have these specialties: "Psicólogo", "Psicólogo", "Dermatólogo", "Dentista"
- WHEN `getHomeStats` is called
- THEN `totalSpecialties` MUST be `3` (one per unique value, not 4)

#### Scenario: Procedure is public

- GIVEN no active session
- WHEN an unauthenticated client calls `getHomeStats`
- THEN the procedure MUST NOT reject with `UNAUTHORIZED`
- AND the response MUST contain the counts

#### Scenario: Procedure accepts no input

- GIVEN a client calls `getHomeStats` with no arguments
- WHEN the procedure executes
- THEN it MUST resolve successfully (no input validation error)

#### Scenario: DB error returns safe fallback, not throw

- GIVEN the database connection fails (e.g. DB is down or a query throws)
- WHEN `getHomeStats` is called
- THEN the procedure MUST resolve to `{ totalVerifiedDoctors: 0, totalSpecialties: 0 }`
- AND it MUST NOT throw a `TRPCError` to the caller
- AND the home page MUST still render (the trust counter is hidden in this state, per REQ-HOME-UI-3)

### Requirement: Caching and Freshness

The procedure MAY rely on the existing tRPC `superjson` transformer and the page-level `force-dynamic` setting for freshness. No new caching layer (Redis, in-memory, or response cache) is introduced in v1.

The page declares `export const dynamic = "force-dynamic"`, which means a fresh request to `/` produces a fresh call to `getHomeStats`. Two requests within 60 seconds SHALL see independent results (a doctor verified between the two requests SHALL appear in the second response).

#### Scenario: Freshness across requests

- GIVEN the home page is requested at T0 with 5 verified doctors
- AND a new doctor is verified at T0 + 30s
- WHEN the home page is requested again at T0 + 60s
- THEN the second response MUST see `totalVerifiedDoctors = 6` (no stale cache)
- AND the home page MUST re-render with the new count

#### Scenario: No new caching layer

- GIVEN the change is applied
- WHEN inspecting `src/infrastructure/api/routers/profiles.ts`
- THEN `getHomeStats` MUST NOT use a custom `cache()` wrapper
- AND it MUST NOT introduce a new Redis/in-memory store
- AND the existing transformer (`superjson`) is the only cache-adjacent primitive in use

### Requirement: Backward Compatibility

The new procedure SHALL be additive. No existing procedure in `profilesRouter` SHALL be modified. The new use case (`GetHomeStatsUseCase`) and any new repository methods (`countVerifiedDoctors`, `countDistinctSpecialties`) SHALL be additive — existing call sites and existing methods MUST NOT change.

The `DoctorPublicResponse` type and the `listDoctorProfiles` procedure MUST remain unchanged in shape and behavior. The `/doctores` listing page (which uses `listDoctorProfiles`) MUST NOT be affected by this change.

#### Scenario: Existing procedures untouched

- GIVEN the change is applied
- WHEN `src/infrastructure/api/routers/profiles.ts` is inspected
- THEN the procedures `getMyProfile`, `updateMyProfile`, `getDoctorProfile`, `listDoctorProfiles`, `getDoctorFullProfile`, and `getDoctorServices` MUST each retain their existing input, output, and auth shape
- AND only one new procedure (`getHomeStats`) SHALL appear in the router

#### Scenario: DoctorPublicResponse unchanged

- GIVEN the change is applied
- WHEN `DoctorPublicResponse` is read from `src/infrastructure/profiles/schemas.ts`
- THEN it MUST still contain exactly the 7 fields: `id`, `nombre`, `email`, `especialidad`, `biografia`, `precioConsulta`, `calificacionMedia`

#### Scenario: /doctores listing page unaffected

- GIVEN a verified doctor exists
- WHEN `/doctores` is loaded
- THEN it MUST render the same grid of `DoctorCard`s as before this change
- AND it MUST NOT call `getHomeStats`
