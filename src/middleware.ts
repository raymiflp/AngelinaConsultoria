import { auth } from "@/auth";
import { buildProtectedRouteHandler } from "@/lib/auth/protected-route-handler";

/**
 * Next.js middleware — route guard for protected pages.
 *
 * Spec: openspec/specs/auth-core/spec.md (proposed in the auth-usuarios
 * change but never created until this housekeeping change).
 *
 * Wraps the pure handler in `src/lib/auth/protected-route-handler.ts` with
 * Auth.js v5's `auth()` reader. The handler is unit-tested in
 * `src/lib/auth/__tests__/protected-route-handler.test.ts`.
 *
 * NOTE: when using a `src/` directory, Next.js expects `middleware.ts` to
 * live at `src/middleware.ts` (NOT at the project root). Placing it at the
 * root causes Next.js to silently ignore it — `middleware-manifest.json`
 * stays empty and no route is guarded. See: https://nextjs.org/docs/app/building-your-application/routing/middleware#convention
 *
 * Public paths (excluded by the matcher below):
 * - /, /doctores, /doctores/[id], /login, /registro
 * - /api/auth/* (Auth.js handles its own)
 * - /api/trpc/* (the tRPC procedures enforce their own auth)
 * - /privacidad, /terminos, /contacto, /preguntas-frecuentes,
 *   /centro-de-ayuda, /quienes-somos, /proximamente
 * - /_next/static, /_next/image, favicon, and other static assets
 *
 * We use a single negative-lookahead pattern instead of an array of
 * positive matchers: Next.js 15's matcher parser collapses
 * `["/dashboard/:path*", "/perfil/:path*", ...]` into a single catch-all
 * (`^/.*$`) which guards every public route too. The negative-lookahead
 * pattern is the documented standard for this case.
 */
export default auth((req) => {
  const handler = buildProtectedRouteHandler((r) => !!r.auth);
  // Auth.js's `auth()` wrapper augments `req` with `auth` (session or null).
  return handler(req as unknown as Parameters<typeof handler>[0]);
});

/**
 * Matcher — runs middleware on every page except public routes, static
 * assets, API routes, and Next.js internals. The handler inside
 * `buildProtectedRouteHandler` decides what to do with each request.
 *
 * Excluded patterns: /api, /_next/static, /_next/image, favicon, common
 * public pages (/, /login, /registro, /doctores, /quienes-somos,
 * /contacto, /preguntas-frecuentes, /terminos, /privacidad,
 * /centro-de-ayuda, /proximamente).
 */
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.ico|ico|icon|apple-icon|manifest\\.webmanifest|login|registro|doctores|quienes-somos|contacto|preguntas-frecuentes|terminos|privacidad|centro-de-ayuda|proximamente|$).*)",
  ],
};
