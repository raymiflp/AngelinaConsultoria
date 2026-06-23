# API Client Specification

## Purpose

Defines the tRPC React client layer: typed client creation, React Query provider, typed hooks, and a server-side caller for Next.js RSC.

## Requirements

### Requirement: Typed Client

The system MUST create a typed tRPC client using `@trpc/client` and `@trpc/react-query`, configured with the server `AppRouter` type.

#### Scenario: Client with httpBatchLink

- GIVEN the server `AppRouter` type is available
- WHEN the client is created
- THEN it MUST configure an `httpBatchLink` pointing to `/api/trpc`
- AND the client MUST be fully typed with all server procedure definitions

#### Scenario: Data transformation

- GIVEN the client is created
- WHEN it serializes or deserializes data
- THEN it MUST use a transformer (e.g., superjson) that handles `Date`, `Map`, and `Set` types

### Requirement: Provider Component

The system MUST provide a React component marked `"use client"` that wraps the application with tRPC and React Query contexts.

#### Scenario: Provider renders children

- GIVEN the Provider is placed at the application root
- WHEN any child component mounts
- THEN it MUST be able to call typed tRPC hooks and receive responses

#### Scenario: Dedicated QueryClient

- GIVEN the Provider mounts
- WHEN it initializes
- THEN it MUST create a dedicated `QueryClient` with a stale time of at least 5 minutes and sensible retry defaults

#### Scenario: No hydration errors

- GIVEN the Provider is rendered on both server and client
- WHEN the client hydrates
- THEN no React hydration mismatch errors MUST occur

### Requirement: Typed Hooks

The system MUST export typed hooks mirroring the server router in the form `api.{resource}.{method}.useQuery()` and `api.{resource}.{method}.useMutation()`.

#### Scenario: Query returns typed data

- GIVEN a procedure exists on the server that returns `{ id: string, name: string }`
- WHEN the client calls `api.some.procedure.useQuery()`
- THEN `data` MUST be typed as `{ id: string, name: string } | undefined`

#### Scenario: Mutation accepts typed input

- GIVEN a mutation procedure accepts `{ email: string }`
- WHEN the client calls `api.some.mutate.useMutation()`
- THEN the `mutate` function MUST accept only `{ email: string }` at type-check time

#### Scenario: getQueryKey helper

- GIVEN a query procedure is defined
- WHEN the client calls `api.some.procedure.getQueryKey(input)`
- THEN it MUST return the stable key for cache invalidation

### Requirement: Server-Side Caller

The system SHALL export a `createCaller` function via `@trpc/next` for use in Server Components and route handlers.

#### Scenario: Server Component calls procedure

- GIVEN a Server Component imports `createCaller`
- WHEN it calls `await createCaller().someProcedure()`
- THEN the result MUST be fully typed and returned without an HTTP round-trip

#### Scenario: Caller with session context

- GIVEN the server caller is created with a session object
- WHEN it executes a protected procedure
- THEN the procedure MUST receive the provided session in context

### Requirement: Client Error Surface

The client MUST surface tRPC errors through React Query's error state for UI handling.

#### Scenario: Query error surfaces

- GIVEN a query hook is called and the server returns a TRPCError
- WHEN the error state updates
- THEN the `error` property MUST contain the structured error with its original code and message
