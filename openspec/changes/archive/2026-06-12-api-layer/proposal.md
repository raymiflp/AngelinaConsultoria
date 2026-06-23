# Proposal: tRPC API Layer

## Intent

Set up the tRPC communication layer between frontend and backend. Domain entities, DB schema, and value objects exist — but no mechanism for frontend→backend calls. tRPC gives end-to-end type safety without code generation, so future endpoints get full inference.

## Scope

### In Scope
- tRPC server: context (DB + auth placeholder), router tree, procedure helpers (public/protected), error formatting
- tRPC React client: provider, typed hooks, server-side caller for RSC
- Next.js App Router route handler for tRPC HTTP transport
- Router scaffold (`src/infrastructure/api/routers/`) for future endpoints
- Shared API types between server and client

### Out of Scope
- Actual API endpoints (auth, profiles, booking) — later changes
- Auth.js integration — next change
- UI components, pages, domain logic

## Capabilities

### New Capabilities
- `api-infrastructure`: tRPC server — context, procedures, router, error handling
- `api-client`: tRPC React — provider, hooks, server-side caller

### Modified Capabilities
None

## Approach

1. **Server context** (`src/infrastructure/api/trpc.ts`): factory injecting DB client + auth placeholder. `publicProcedure` and `protectedProcedure` (checks session, throws UNAUTHORIZED).
2. **Router** (`src/infrastructure/api/root.ts`): `appRouter` combining sub-routers from `routers/`.
3. **Error formatter** (`src/infrastructure/api/error-formatter.ts`): shape validation/AUTH errors as structured responses.
4. **HTTP handler** (`src/app/api/trpc/[trpc]/route.ts`): mount tRPC via `@trpc/next` adapter.
5. **Client** (`src/lib/trpc/client.ts`, `provider.tsx`, `server-client.ts`): typed caller, React Query wrapper, createCaller for RSC.
6. **Shared types** (`src/shared/types/api.ts`): `AppRouter` export for client inference.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/infrastructure/api/trpc.ts` | New | Context + procedure helpers |
| `src/infrastructure/api/root.ts` | New | appRouter combining routers |
| `src/infrastructure/api/error-formatter.ts` | New | Error formatting |
| `src/infrastructure/api/routers/` | New | Placeholder directory |
| `src/lib/trpc/client.ts` | New | Client with links |
| `src/lib/trpc/provider.tsx` | New | React Query provider |
| `src/lib/trpc/server-client.ts` | New | Server caller for RSC |
| `src/app/api/trpc/[trpc]/route.ts` | New | HTTP handler |
| `src/shared/types/api.ts` | New | Shared API types |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| tRPC + Next.js 15 incompatibility | Low | `@trpc/next` v11 targets Next 15 |
| Protected procedure before Auth.js | Med | Placeholder: throws until auth is wired |

## Rollback Plan

1. Delete `src/infrastructure/api/` entirely
2. Delete `src/lib/trpc/` entirely
3. Delete `src/app/api/trpc/[trpc]/route.ts`
4. Revert `src/shared/types/api.ts`

## Dependencies

- `@trpc/server`, `@trpc/client`, `@trpc/react-query`, `@trpc/next` — already in `package.json`
- Zod — already in `package.json`

## Success Criteria

- [ ] `next build` passes with zero TS errors
- [ ] Context factory returns a Drizzle-typed DB client
- [ ] `publicProcedure` executes and returns data (verified by test)
- [ ] `protectedProcedure` throws UNAUTHORIZED without session
- [ ] React provider renders without hydration errors
- [ ] `createCaller` works server-side with typed return
