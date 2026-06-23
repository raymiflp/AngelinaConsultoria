# Tasks: Auth Usuarios

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~450–550 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | auto-forecast |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full auth foundation + tRPC wiring + tests | PR 1 | Single PR within 800-line budget |

## Phase 1: Auth Foundation

- [x] 1.1 `npm install bcryptjs && npm install -D @types/bcryptjs`
- [x] 1.2 Create `src/infrastructure/auth/password.ts` — `hash(password, saltRounds=12)` + `verify(password, hash)` wrapping bcryptjs
- [x] 1.3 Create `src/infrastructure/auth/schemas.ts` — Zod `registerSchema` (email, password min 8 + uppercase + digit, nombre, telefono) + `loginSchema` (email, password)

## Phase 2: Auth.js Configuration

- [x] 2.1 Create `src/auth.ts` — `NextAuth()` with credentials provider, `authorize` callback (queries usuarios via Drizzle, bcrypt verify), JWT callback (attach id+role), session callback (map token→session)
- [x] 2.2 Create `src/app/api/auth/[...nextauth]/route.ts` — export `GET`, `POST` from `@/auth` handlers

## Phase 3: tRPC Integration

- [x] 3.1 Modify `src/infrastructure/api/context.ts` — import `auth` from `@/auth`, call `await auth()` in `createContext()`, return real session instead of `null`
- [x] 3.2 Modify `src/infrastructure/api/routers/auth.ts` — replace `router({})` with `register` (publicProcedure, Zod validate, check duplicate, hash, insert, return session), `login` (publicProcedure, find user, verify password, return session), `me` (protectedProcedure, return session.user)
- [x] 3.3 Verify `src/infrastructure/api/routers/_app.ts` — confirm `auth: authRouter` is already merged (no change needed)

## Phase 4: Testing

- [x] 4.1 Write `src/infrastructure/auth/__tests__/password.test.ts` — hash+verify success, wrong password fails, empty string edge case
- [x] 4.2 Write `src/infrastructure/api/routers/__tests__/auth.test.ts` — register (success, duplicate CONFLICT, invalid Zod input), login (valid creds, wrong password UNAUTHORIZED, missing email UNAUTHORIZED), me (authenticated returns user, unauthenticated UNAUTHORIZED)
- [x] 4.3 Update `src/infrastructure/api/__tests__/context.test.ts` — mock `@/auth`, test that session reflects `auth()` result (authenticated scenario + null scenario)

## Phase 5: Verification

- [x] 5.1 `npm run type-check` (tsc --noEmit) — zero TS errors
- [x] 5.2 `npm run test:run` (vitest run) — all tests pass
