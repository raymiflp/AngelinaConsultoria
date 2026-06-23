# Tasks: tRPC API Layer

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~350 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | auto-forecast |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Server infra + client + tests | Single PR | All files, ~350 lines, under budget |

## Phase 1: Server Infrastructure

- [x] 1.1 Create `src/infrastructure/api/trpc.ts` — `initTRPC` singleton, `publicProcedure`, `protectedProcedure` (throws UNAUTHORIZED without session), wire error formatter
- [x] 1.2 Create `src/infrastructure/api/context.ts` — async `createContext()` with Drizzle DB and nullable `session`, export `Context` interface
- [x] 1.3 Create `src/infrastructure/api/error-formatter.ts` — custom formatter serializing Zod errors into `fieldErrors` map, stripping stack traces on known TRPCErrors
- [x] 1.4 Create `src/infrastructure/api/routers/_app.ts` — `appRouter` merging `auth`, `profiles`, `bookings` sub-routers; export `AppRouter` type
- [x] 1.5 Create `src/infrastructure/api/routers/auth.ts` — empty placeholder router
- [x] 1.6 Create `src/infrastructure/api/routers/profiles.ts` — empty placeholder router
- [x] 1.7 Create `src/infrastructure/api/routers/bookings.ts` — empty placeholder router
- [x] 1.8 Create `src/app/api/trpc/[trpc]/route.ts` — `fetchRequestHandler` adapter with named `GET`/`POST` exports

## Phase 2: Client Layer

- [x] 2.1 Create `src/infrastructure/api/client.ts` — `createTRPCReact<AppRouter>()` with `httpBatchLink` to `/api/trpc`
- [x] 2.2 Create `src/infrastructure/api/provider.tsx` — `"use client"` provider with fresh `QueryClient` (5min stale time) + `api.Provider`
- [x] 2.3 Create `src/infrastructure/api/server-caller.ts` — `createCallerFactory` for RSC server calls with session context
- [x] 2.4 Create `src/infrastructure/api/index.ts` — barrel exports for `api`, `TRPCProvider`, `createCaller`, `AppRouter` type, `Context`

## Phase 3: Testing

- [x] 3.1 Write `src/infrastructure/api/__tests__/context.test.ts` — verify `createContext()` returns `db` (duck-type with `.select()`) and `session` is `null`
- [x] 3.2 Write `src/infrastructure/api/__tests__/trpc.test.ts` — `protectedProcedure` throws `TRPCError(UNAUTHORIZED)` without session, succeeds with session
- [x] 3.3 Write `src/infrastructure/api/__tests__/client.test.tsx` — type-check `api.useUtils()`, verify `<TRPCProvider>` renders children without hydration errors

## Phase 4: Verification

- [x] 4.1 Run `tsc --noEmit` — zero TypeScript errors
- [x] 4.2 Run `vitest run` — all 3 test files pass (10 new tests)
- [x] 4.3 Verify route handler compiles: `GET` and `POST` named exports resolve correctly
