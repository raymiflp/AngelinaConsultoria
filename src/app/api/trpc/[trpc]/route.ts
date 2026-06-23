import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/infrastructure/api/routers/_app";
import { createContext } from "@/infrastructure/api/context";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
  });

export { handler as GET, handler as POST };
