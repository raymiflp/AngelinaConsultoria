import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";
import { errorFormatter } from "./error-formatter";
import { rateLimit } from "@/infrastructure/redis/rate-limiter";

/**
 * tRPC root object — the single `initTRPC` instance for this service.
 */
export const t = initTRPC.context<Context>().create({
  errorFormatter,
});

/**
 * Base router builder — all sub-routers derive from this.
 */
export const router = t.router;

/**
 * Middleware utility for composing reusable middleware chains.
 */
export const middleware = t.middleware;

/**
 * Procedure that accepts requests without any authentication.
 */
export const publicProcedure = t.procedure;

/**
 * Rate-limited public procedure.
 *
 * Protects public endpoints (slot discovery, doctor listing) from abuse.
 * Uses IP-based rate limiting when request IP is available, otherwise
 * falls back to a global counter.
 *
 * Limits: 30 requests per 10 seconds per IP.
 */
export const rateLimitedPublicProcedure = publicProcedure.use(
  async ({ ctx, next }) => {
    const ip =
      ctx.headers?.["x-forwarded-for"] ??
      ctx.headers?.["x-real-ip"] ??
      "anonymous";

    await rateLimit({
      key: `public:${ip}`,
      maxRequests: 30,
      windowMs: 10_000,
    });

    return next({ ctx });
  },
);

/**
 * Procedure that rejects requests when no session is present.
 * Throws TRPCError with code UNAUTHORIZED when ctx.session is null.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

/**
 * Procedure that rejects requests when the authenticated user
 * does not have the ADMIN role.
 */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.session.user.role !== "ADMIN") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Acceso denegado: se requiere rol de administrador",
    });
  }
  return next({ ctx });
});
