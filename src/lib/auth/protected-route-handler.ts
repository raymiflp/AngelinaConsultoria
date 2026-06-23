import { NextResponse, type NextRequest } from "next/server";

/**
 * Pure, framework-agnostic handler for the protected-route middleware.
 * Exported separately so the auth logic can be unit-tested without booting
 * the Auth.js v5 edge runtime.
 *
 * The function is intentionally not coupled to Auth.js — it just receives a
 * boolean (`isLoggedIn`) and a `NextRequest`-like object. The default
 * middleware at the project root wires this handler to Auth.js's
 * `auth()` wrapper.
 *
 * @param isLoggedIn - function that returns true if the request is authenticated
 * @returns a Next.js handler that either passes through or redirects to /login
 */
export function buildProtectedRouteHandler(
  isLoggedIn: (req: { auth: unknown }) => boolean,
): (req: NextRequest) => NextResponse {
  return function handler(req: NextRequest): NextResponse {
    if (isLoggedIn(req as unknown as { auth: unknown })) {
      return NextResponse.next();
    }

    // Build the callback URL from the requested path + search params.
    const callbackUrl = req.nextUrl.pathname + req.nextUrl.search;
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("callbackUrl", callbackUrl);

    return NextResponse.redirect(loginUrl);
  };
}
