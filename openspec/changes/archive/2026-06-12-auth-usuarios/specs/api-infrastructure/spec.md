# Delta for API Infrastructure

## MODIFIED Requirements

### Requirement: Context Factory

The system SHALL provide a context factory that injects a Drizzle DB client and a real auth session from Auth.js.

(Previously: Context factory returned `session: null` placeholder. Now it calls `auth()` from `next-auth/next` to resolve the real session.)

#### Scenario: Context provides DB client

- GIVEN the context factory is invoked for an incoming request
- WHEN the context is created
- THEN it MUST contain a `db` property typed as the Drizzle ORM instance from `src/infrastructure/db/index.ts`

#### Scenario: Authenticated context has session

- GIVEN a valid session cookie is present in the request
- WHEN the context factory calls `auth()` from `next-auth/next`
- THEN `ctx.session` MUST contain the authenticated user data with `id`, `email`, `name`, and `role`

#### Scenario: Unauthenticated context has null session

- GIVEN no valid session cookie is present
- WHEN the context factory calls `auth()`
- THEN `ctx.session` MUST be `null` — typed as `Session | null`

### Requirement: protectedProcedure

The system MUST expose a procedure helper that rejects requests when no session is present and passes the full session to downstream handlers.

(Previously: Session was always null; protectedProcedure checked null and threw. Now session reflects real auth state from Auth.js.)

#### Scenario: Authenticated request succeeds

- GIVEN the context contains a valid `session` object resolved from Auth.js
- WHEN the handler executes
- THEN the response MUST be returned normally and `ctx.session` MUST contain `user.id`, `user.email`, `user.name`, and `user.role`

#### Scenario: Unauthenticated request is rejected

- GIVEN the context has `session` set to `null` (no valid cookie)
- WHEN a protected procedure is invoked
- THEN the server MUST throw a `TRPCError` with code `UNAUTHORIZED`

## ADDED Requirements

### Requirement: Context Imports Auth.js

The context factory SHALL import and call the `auth` helper from the Auth.js configuration module to resolve the current session.

#### Scenario: Auth import resolves

- GIVEN the Auth.js module at `src/auth.ts` exports an `auth` function
- WHEN the `createContext` factory is invoked
- THEN it MUST call `auth()` and assign the result to `ctx.session`
