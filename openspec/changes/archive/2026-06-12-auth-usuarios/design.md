# Design: Auth Usuarios

## Technical Approach

Wire Auth.js v5 (credentials provider, JWT strategy) into the existing tRPC layer. The `auth()` instance at root level handles session creation and validation. tRPC context calls `auth()` per request, replacing the hardcoded `session: null`. The auth router exposes `register`, `login`, and `me` procedures.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| Session strategy | JWT (encrypted token) | Database sessions | No DB lookup per request; simpler for serverless; token carries userId + role |
| Hashing library | `bcryptjs` | `bcrypt`, `argon2` | Pure JS — no native compilation issues in Docker/Vercel |
| Provider | Credentials only | OAuth (Google, GitHub) | MVP scope; OAuth deferred |
| Error messages | Generic ("Credenciales inválidas") | Specific ("Email not found") | Don't reveal whether email exists |
| Auth file location | `src/auth.ts` (root) | Inside `src/` | Next.js convention; `auth()` is called by middleware, route handlers, and server components |
| Session resolution | Called once in context factory | Per-procedure middleware | Single call per request; cleaner separation |

## Data Flow

```
Request ──→ tRPC handler ──→ createContext()
                                 │
                                 ▼
                              auth() ──→ reads JWT cookie
                                 │
                                 ▼
                    session | null ──→ injected into ctx
                                 │
                                 ▼
                        procedure execution
                              │
                    ┌─────────┴──────────┐
                    │                    │
              publicProcedure    protectedProcedure
              (session optional)  (throws if null)
```

**Register flow:**

```
auth.register(input) → Zod validate → check email uniqueness
  → hash password (bcryptjs) → db.insert(usuarios)
  → create session via auth() → return { user, expires }
```

**Login flow:**

```
auth.login(input) → Zod validate → db.find by email
  → bcryptjs.verify → throw generic error on mismatch
  → create session → return { user, expires }
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/auth.ts` | Create | NextAuth config: credentials provider, authorize callback (queries usuarios via Drizzle, verifies bcrypt), JWT callback (adds userId + role), session callback (maps token → session) |
| `src/app/api/auth/[...nextauth]/route.ts` | Create | Exports `GET`, `POST` from `@/auth` handlers — App Router catch-all for Auth.js endpoints |
| `src/infrastructure/auth/password.ts` | Create | `hash(password: string): Promise<string>` + `verify(password: string, hash: string): Promise<boolean>` wrapping bcryptjs |
| `src/infrastructure/auth/schemas.ts` | Create | Zod schemas: `registerSchema` (email, password, nombre, telefono, rol) + `loginSchema` (email, password) with validation rules |
| `src/infrastructure/api/context.ts` | Modify | Import `auth()` from `@/auth`, call `await auth()` at top of `createContext()`, return session from result |
| `src/infrastructure/api/routers/auth.ts` | Modify | Replace `router({})` with `register` (publicProcedure, Zod validate, check dup, hash, insert, return session), `login` (publicProcedure, Zod validate, find, verify, return session), `me` (protectedProcedure, return session.user) |
| `package.json` | Modify | Add `bcryptjs@^2.4.3` and `@types/bcryptjs` to dependencies |
| `src/infrastructure/api/__tests__/context.test.ts` | Modify | Update test: mock `@/auth`, session is no longer `null` when `auth()` returns session |

## Interfaces / Contracts

```typescript
// src/auth.ts exports
export const { handlers, auth, signIn, signOut } = NextAuth(config);

// Session shape (from Auth.js JWT callback)
interface Session {
  user: { id: string; role: string; email: string; name: string };
  expires: string;
}

// tRPC context (modified)
interface Context {
  db: typeof db;
  session: Session | null;  // Previously hardcoded null
}

// Auth router procedures
auth.register(input: RegisterInput) → { user: Session["user"]; expires: string }
auth.login(input: LoginInput) → { user: Session["user"]; expires: string }
auth.me() → { user: Session["user"] }
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `password.ts` | Hash a password, verify same password succeeds; verify wrong password fails; edge: empty string |
| Unit | `schemas.ts` | Valid inputs pass; invalid email, short password, missing fields fail |
| Integration | `auth.register` | Valid input creates user + returns session; duplicate email throws CONFLICT; invalid input throws BAD_REQUEST |
| Integration | `auth.login` | Valid credentials return session; wrong password throws UNAUTHORIZED; nonexistent email throws same generic error |
| Integration | `auth.me` | With session returns user; without session throws UNAUTHORIZED |
| Integration | Authorize callback | Mock DB, test valid/invalid credentials return correct results |

## Migration / Rollout

No migration required. New users register via the auth router; existing users (none yet) would need password set. `AUTH_SECRET` already in `.env.local.example`.

## Open Questions

- [ ] Should register return a full session or just confirmation + redirect to login? (Decision: return session — consistent with login UX)
- [ ] Password min length policy? (Decision: 8 chars minimum in Zod schema)
- [ ] Default role for new registrations? (Decision: `"paciente"` — most common use case)
