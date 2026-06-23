# API Infrastructure Specification

## Purpose

Defines the tRPC server infrastructure: context creation, procedure helpers, error formatting, and router composition. This layer sits between HTTP transport and domain logic.

## Requirements

### Requirement: tRPC Instance

The system MUST initialize a singleton tRPC instance via `initTRPC` from `@trpc/server`.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Initialization succeeds | `@trpc/server` is available | the instance is created | it exposes `router`, `publicProcedure`, `middleware` |
| Singleton reuse | the instance was already initialized | a consumer requests it | the same instance is returned |

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

### Requirement: publicProcedure

The system MUST expose a procedure helper that accepts requests without authentication checks.

#### Scenario: Unauthenticated request

- GIVEN a caller invokes a public procedure
- WHEN the handler executes
- THEN the response MUST be returned without any session validation

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

### Requirement: Error Formatter

The system SHALL define an error formatter that normalizes all errors into a consistent shape.

#### Scenario: Zod validation error

- GIVEN a Zod validation error occurs inside a procedure
- WHEN the formatter processes it
- THEN the response MUST include a `fieldErrors` map with per-field messages

#### Scenario: Known TRPCError

- GIVEN a `TRPCError` with code `UNAUTHORIZED` is thrown
- WHEN the formatter processes it
- THEN the response MUST include the original code and message, and MUST NOT include stack traces

### Requirement: Router Composition

The system SHALL define an `appRouter` that merges sub-routers from the `routers/` directory.

#### Scenario: No sub-routers registered

- GIVEN no sub-routers exist in `src/infrastructure/api/routers/`
- WHEN the `appRouter` is created
- THEN it MUST be a valid tRPC router with zero procedures

#### Scenario: Sub-router merged

- GIVEN a sub-router is defined and merged via `mergeRouters`
- WHEN a procedure from the sub-router is called
- THEN it MUST execute correctly under the merged namespace

### Requirement: HTTP Route Handler

The system MUST expose a Next.js App Router handler at `src/app/api/trpc/[trpc]/route.ts` using the `@trpc/next` adapter.

#### Scenario: GET request

- GIVEN a GET request to `/api/trpc/{procedurePath}`
- WHEN the handler processes it
- THEN it MUST execute the matching procedure and return the serialized result

#### Scenario: POST request

- GIVEN a POST request with JSON body to `/api/trpc/{procedurePath}`
- WHEN the handler processes it
- THEN it MUST parse input, execute the procedure, and return the result

### Requirement: Type Exports

The system MUST export the `AppRouter` type for client-side inference.

#### Scenario: Client imports AppRouter type

- GIVEN a client-side file imports `AppRouter` from the shared types
- WHEN TypeScript resolves the import
- THEN the `AppRouter` type MUST enable full type inference for all procedures, inputs, and outputs

### Requirement: Context Imports Auth.js

The context factory SHALL import and call the `auth` helper from the Auth.js configuration module to resolve the current session.

#### Scenario: Auth import resolves

- GIVEN the Auth.js module at `src/auth.ts` exports an `auth` function
- WHEN the `createContext` factory is invoked
- THEN it MUST call `auth()` and assign the result to `ctx.session`
