# Proposal: Auth Usuarios

## Intent

Medico-consulta has no auth. The Usuario entity, DB schema, and tRPC infra exist — but `ctx.session` is hardcoded null. Users can't register or log in. This delivers the auth foundation: registration + login via Auth.js v5 (credentials provider) wired into tRPC context so protected procedures work.

## Scope

### In Scope

1. Auth.js config (credentials, JWT, session callbacks) — `src/auth.ts`
2. Auth.js App Router route handlers — `src/app/api/auth/[...nextauth]/route.ts`
3. Password hashing with `bcryptjs`
4. tRPC auth router: register + login procedures
5. Wire Auth.js session into tRPC context (replace null placeholder)
6. Next.js middleware for page protection — `src/middleware.ts`

### Out of Scope

OAuth providers, email verification, password reset, UI components, RBAC beyond `session.user.role`, token rotation.

## Capabilities

### New

- `auth-core`: Auth.js config, credentials authorize callback, password hashing, session/JWT callbacks
- `auth-api`: tRPC router — register (validate → hash → insert → session) and login (validate → verify → session)

### Modified

- `api-infrastructure`: Context factory SHALL call `auth()` instead of returning `null`. Existing "session is null" scenario becomes "session reflects auth status"

## Approach

1. `src/auth.ts` — `NextAuth()` with credentials provider, JWT strategy, session callback attaching `id` + `role`
2. Route handler — export `GET`/`POST` from Auth.js handler
3. `src/middleware.ts` — wrap `auth()`, configure public/private route matchers
4. Install `bcryptjs` + `@types/bcryptjs`; add `AUTH_SECRET` to env
5. Update `src/infrastructure/api/context.ts` — `createContext()` calls `await auth()`, passes session
6. `src/infrastructure/api/routers/auth.ts` — `register` (zod input, check duplicate, hash, insert, return session) + `login` (zod input, find user, verify password, return session). Both use `publicProcedure`.

## Affected Areas

`src/auth.ts` (new) · `src/app/api/auth/[...nextauth]/route.ts` (new) · `src/middleware.ts` (new) · `src/infrastructure/api/context.ts` (mod) · `src/infrastructure/api/routers/auth.ts` (mod) · `.env` (new) · `package.json` (mod)

## Risks

| Risk | Like. | Mitigation |
|------|-------|------------|
| bcrypt blocks event loop | Low | Use pure-JS `bcryptjs` |
| Auth.js v5 beta changes | Med | Pin version, check changelog before upgrade |
| Credentials CSRF | Low | Auth.js v5 handles it via `next-auth.session-token` cookie |

## Rollback Plan

1. Delete `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/middleware.ts`
2. Revert `context.ts` to `session: null` and `auth.ts` router to `router({})`
3. Remove `bcryptjs` + `@types/bcryptjs` from `package.json` and `AUTH_SECRET` from `.env`
4. Run `npm install`

## Dependencies

- `next-auth@^5.0.0-beta.28` — already installed
- `bcryptjs@^2.4.3` + `@types/bcryptjs` — to install

## Success Criteria

- [ ] `npm run build` passes with zero TS errors
- [ ] Register: auth.register creates a DB row with hashed password, returns session
- [ ] Login: auth.login with valid creds returns session; invalid creds return UNAUTHORIZED
- [ ] Context: `ctx.session` contains real user data when valid cookie present, `null` otherwise
- [ ] Protected procedure: throws UNAUTHORIZED without session, succeeds with it
