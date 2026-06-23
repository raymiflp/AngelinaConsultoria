import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/infrastructure/api/routers/_app";

/**
 * Typed tRPC React client.
 *
 * Exposes fully-typed hooks that mirror the server router:
 *   - `api.some.procedure.useQuery()` for queries
 *   - `api.some.mutate.useMutation()` for mutations
 *   - `api.useUtils()` for cache utilities
 */
export const api = createTRPCReact<AppRouter>();
