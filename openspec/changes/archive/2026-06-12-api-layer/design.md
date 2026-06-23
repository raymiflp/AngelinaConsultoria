# Design: tRPC API Layer

## Architecture Overview

```
┌──────────────────────────────────────────┐
│  src/app/api/trpc/[trpc]/route.ts        │
│  HTTP handler (fetchRequestHandler)      │
├──────────────────────────────────────────┤
│  src/infrastructure/api/                 │
│  ┌────────────┐  ┌───────────────┐       │
│  │ trpc.ts    │  │ context.ts    │       │
│  │ initTRPC   │  │ createContext │       │
│  │ procedures │  │ { db, sess }  │       │
│  └─────┬──────┘  └───────────────┘       │
│        │                                  │
│  ┌─────▼──────┐  ┌───────────────┐       │
│  │ routers/   │  │error-formatter│       │
│  │ _app.ts    │  │.ts            │       │
│  │ (merges)   │  │ Zod handling  │       │
│  └────────────┘  └───────────────┘       │
│  ┌────────────┐  ┌───────────────┐       │
│  │ client.ts  │  │ provider.tsx  │       │
│  │ createTRPC │  │ QueryClient   │       │
│  │ React      │  │ + tRPC Prov   │       │
│  └────────────┘  └───────────────┘       │
│  ┌─────────────────────┐                 │
│  │ server-caller.ts    │                 │
│  │ createCaller (RSC)  │                 │
│  └─────────────────────┘                 │
└──────────────────────────────────────────┘
```

## Architecture Decisions

### AD-1: Infrastructure Layer Placement

**Decision**: All API infrastructure code lives in `src/infrastructure/api/`. The HTTP route handler (`src/app/api/trpc/[trpc]/route.ts`) is the ONLY file in the Next.js App Router directory — it's a thin adapter.

**Rationale**: Clean Architecture layers. Domain and application layers must NOT depend on infrastructure concerns. Putting tRPC init, routers, client, and provider in `src/infrastructure/api/` keeps the dependency arrow pointing inward: `infrastructure → application → domain`.

**Tradeoff**: Requires one extra `@trpc/server` types import in client code. Mitigated by `import type` — tree-shaken at compile time, zero server code leaks to the client bundle.

### AD-2: Async Context Factory

**Decision**: `createContext` is an async function that instantiates the DB connection once and attaches a nullable `session` field.

```ts
// src/infrastructure/api/context.ts
import { db } from "@/infrastructure/db";

export async function createContext(): Promise<Context> {
  return { db, session: null };
}

export interface Context {
  db: typeof import("@/infrastructure/db").db;
  session: { user: { id: string; role: string } } | null;
}
```

**Rationale**: Async context allows future middleware (Auth.js, request logging) to await promises before handlers execute. The `session` field starts as `null` — Auth.js middleware will populate it in a later change.

### AD-3: Protected Procedure Pattern

**Decision**: `protectedProcedure` is a middleware wrapper that checks `ctx.session` and throws `TRPCError` with `UNAUTHORIZED` code if missing.

```ts
// src/infrastructure/api/trpc.ts
import { initTRPC, TRPCError } from "@trpc/server";

const t = initTRPC.context<Context>().create();

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});
```

**Rationale**: Clear guard that fails fast. When Auth.js is wired in later, the middleware simply needs to set `ctx.session` — this procedure automatically works. No changes to route handlers required.

### AD-4: Modular Router Tree

**Decision**: Each domain gets its own router file in `src/infrastructure/api/routers/`. The root `_app.ts` merges all sub-routers.

```
src/infrastructure/api/routers/
├── _app.ts          ← appRouter = t.router({...})
├── auth.ts          ← placeholder (empty router)
├── profiles.ts      ← placeholder (empty router)
└── bookings.ts      ← placeholder (empty router)
```

**Rationale**: Single-file routers become unmaintainable past ~5 endpoints. Modular routers let teams work on different domains without merge conflicts. The `_app.ts` merge is the single export consumed by the route handler and client.

### AD-5: Error Formatting

**Decision**: Custom error formatter serializes Zod validation errors into structured field-level messages. tRPC's built-in formatter handles the rest.

```ts
// src/infrastructure/api/error-formatter.ts
import { TRPCErrorShape } from "@trpc/server/rpc";

export function errorFormatter({ shape, error }: {
  shape: TRPCErrorShape;
  error: any;
}) {
  return {
    ...shape,
    data: {
      ...shape.data,
      zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
    },
  };
}
```

**Rationale**: Frontend form validation needs per-field error mapping. Without custom formatting, Zod errors appear as opaque messages. Flattened structure enables `<FormField error={errors.fieldName} />` patterns.

### AD-6: Client Setup

**Decision**: `createTRPCReact<AppRouter>()` typed hooks, wrapped in a `"use client"` provider with a fresh `QueryClient` per render.

```ts
// src/infrastructure/api/provider.tsx
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { api } from "@/infrastructure/api/client";

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient();
  const trpcClient = api.createClient({ links: [httpBatchLink({ url: "/api/trpc" })] });

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}
```

**Rationale**: Fresh `QueryClient` per render avoids stale cache issues in SSR/RSC environments. `httpBatchLink` batches concurrent requests into single HTTP calls — critical for page loads with multiple data hooks.

### AD-7: Route Handler — Fetch Adapter

**Decision**: Use `@trpc/server/adapters/fetch` (not `@trpc/next`). Export named `GET` and `POST` functions.

```ts
// src/app/api/trpc/[trpc]/route.ts
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/infrastructure/api/routers/_app";
import { createContext } from "@/infrastructure/api/context";

const handler = (req: Request) =>
  fetchRequestHandler({ endpoint: "/api/trpc", req, router: appRouter, createContext });

export { handler as GET, handler as POST };
```

**Rationale**: `@trpc/server/adapters/fetch` is the official adapter for Next.js App Router route handlers. It handles both GET (query) and POST (mutation) HTTP methods. Named exports align with the Next.js route handler convention.

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/infrastructure/api/trpc.ts` | Create | tRPC init, `publicProcedure`, `protectedProcedure`, error formatter wiring |
| `src/infrastructure/api/context.ts` | Create | Async context factory, `Context` type |
| `src/infrastructure/api/error-formatter.ts` | Create | Custom Zod error serialization |
| `src/infrastructure/api/routers/_app.ts` | Create | Root router merging sub-routers, `AppRouter` type export |
| `src/infrastructure/api/routers/auth.ts` | Create | Empty placeholder router |
| `src/infrastructure/api/routers/profiles.ts` | Create | Empty placeholder router |
| `src/infrastructure/api/routers/bookings.ts` | Create | Empty placeholder router |
| `src/infrastructure/api/client.ts` | Create | `createTRPCReact<AppRouter>()` typed client |
| `src/infrastructure/api/provider.tsx` | Create | `"use client"` provider: QueryClient + tRPC |
| `src/infrastructure/api/server-caller.ts` | Create | `createCallerFactory` for RSC server calls |
| `src/app/api/trpc/[trpc]/route.ts` | Create | HTTP route handler (GET, POST) |
| `src/infrastructure/api/__tests__/context.test.ts` | Create | Context integration test |
| `src/infrastructure/api/__tests__/trpc.test.ts` | Create | Protected procedure unit test |
| `src/infrastructure/api/__tests__/client.test.tsx` | Create | Client/provider type-check test |

## Testing Strategy

### Context Integration Test
- Call `createContext()` and verify `db` is a Drizzle instance (duck-type with `.select()` check)
- Verify `session` is `null` before Auth.js wiring

### Protected Procedure Unit Test
- Create a trpc instance with mock context (`{ db: null, session: null }`)
- Call `protectedProcedure.query(() => "ok")` and expect `TRPCError(UNAUTHORIZED)`
- With session populated: expect the handler to execute successfully

### Client/Provider Type Tests
- Type-only tests using `expectTypeOf`:
  - `api.useUtils()` returns typed utils
  - `<TRPCProvider>` accepts children prop
  - `<TRPCProvider>` renders without hydration errors (JSDOM mount)

**All tests pass with `vitest run` — no build step required.**
