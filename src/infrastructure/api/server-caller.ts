import { t } from "@/infrastructure/api/trpc";
import { appRouter } from "@/infrastructure/api/routers/_app";

/**
 * Creates a server-side caller for use in Server Components (RSC),
 * route handlers, and server actions.
 *
 * Usage:
 *   const caller = createCaller(await createContext());
 *   const result = await caller.someProcedure();
 */
export const createCaller = t.createCallerFactory(appRouter);
