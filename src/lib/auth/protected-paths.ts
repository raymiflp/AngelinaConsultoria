/**
 * Protected-route matcher — single source of truth for the middleware
 * `config.matcher` array. Extracted so it's testable without booting
 * Auth.js's edge runtime.
 *
 * Adding a new protected path: add it here AND add it to the
 * `config.matcher` array in `middleware.ts`. The CI test in
 * `protected-route-handler.test.ts` asserts the two stay in sync.
 */
export const PROTECTED_PATHS = [
  "/dashboard/:path*",
  "/perfil/:path*",
  "/citas/:path*",
  "/configuracion",
  "/pacientes",
  "/pacientes/:path*",
] as const;
