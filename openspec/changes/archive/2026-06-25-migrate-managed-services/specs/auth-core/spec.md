# Delta for auth-core

## ADDED Requirements

### Requirement: REQ-AUTH-V-1 — AUTH_TRUST_HOST is set on Vercel

The Auth.js v5 configuration MUST set `trustHost: true` (or accept `AUTH_TRUST_HOST=true` as an env var) when deployed to Vercel. Vercel terminates TLS at the edge and proxies to the Function with an internal HTTP origin, so NextAuth cannot auto-detect the canonical URL without this flag. Without `trustHost: true`, Auth.js v5 throws "UntrustedHost" errors on Vercel.

`.env.example` MUST include `AUTH_TRUST_HOST=true` as a placeholder line. `docs/deployment.md` MUST document this as a required env var.

#### Scenario: AUTH_TRUST_HOST is in .env.example

- GIVEN `.env.example` after the migration
- WHEN the file is read
- THEN `AUTH_TRUST_HOST` MUST appear with `=` and a placeholder value (e.g., `AUTH_TRUST_HOST=true`)

#### Scenario: Auth.js does not throw UntrustedHost on Vercel

- GIVEN the Vercel production deployment with `AUTH_TRUST_HOST=true` set
- WHEN a user visits any auth route (`/api/auth/signin`, `/api/auth/callback/credentials`, etc.)
- THEN no `UntrustedHost` error MUST be thrown
- AND the auth flow MUST complete normally

### Requirement: REQ-AUTH-V-2 — AUTH_URL resolves from VERCEL_URL

The `AUTH_URL` env var SHOULD be set to the value of `VERCEL_URL` on Vercel deployments. Vercel injects `VERCEL_URL` automatically per-deploy (e.g., `my-app.vercel.app`). The Auth.js configuration MUST NOT hardcode a single `AUTH_URL` — it MUST read from env at boot.

If `AUTH_URL` is unset, NextAuth v5 falls back to the request URL, which is acceptable but less explicit. The deploy runbook MUST recommend setting `AUTH_URL=https://$VERCEL_URL` explicitly.

#### Scenario: AUTH_URL uses VERCEL_URL on Vercel

- GIVEN a Vercel production deployment
- WHEN `AUTH_URL` is read by NextAuth
- THEN it MUST equal `https://${VERCEL_URL}` (the Vercel-injected domain)
- AND it MUST NOT be hardcoded to a fixed value

#### Scenario: deploy runbook documents AUTH_URL

- GIVEN `docs/deployment.md`
- WHEN the Vercel project secrets table is read
- THEN `AUTH_URL` MUST appear with the recommended value `https://$VERCEL_URL`
- AND the note MUST explain that Vercel injects `VERCEL_URL` automatically
