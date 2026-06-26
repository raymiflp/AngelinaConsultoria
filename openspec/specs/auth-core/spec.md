# Auth Core Specification

## Purpose

Defines the authentication infrastructure: Auth.js v5 NextAuth configuration, credentials provider, password hashing, session/JWT callbacks, and the route handler. This layer provides session data consumed by the tRPC context.

## Requirements

### Requirement: Auth.js Instance

The system MUST initialize a singleton Auth.js instance via `NextAuth()` from `next-auth` using the credentials provider and JWT strategy.

#### Scenario: Initialization succeeds

- GIVEN `next-auth@^5.0.0-beta.28` is installed and `AUTH_SECRET` is set in environment
- WHEN the configuration module is loaded
- THEN a valid `NextAuth` instance MUST be exported with `auth`, `handlers`, `signIn`, and `signOut` helpers

### Requirement: Credentials Provider — authorize Callback

The Auth.js credentials provider SHALL define an `authorize` callback that validates credentials against stored user data.

#### Scenario: Valid credentials return user object

- GIVEN a user exists in the `Usuario` table with a bcrypt-hashed password
- WHEN `authorize` is called with matching email and password
- THEN it MUST return an object with `id`, `email`, `name`, and `role` properties

#### Scenario: Invalid password returns null

- GIVEN a user exists with email `test@example.com`
- WHEN `authorize` is called with correct email but wrong password
- THEN it MUST return `null` and MUST NOT reveal which field was incorrect

#### Scenario: Non-existent email returns null

- GIVEN no user exists with the provided email
- WHEN `authorize` is called
- THEN it MUST return `null` with a generic error message

### Requirement: Password Hashing

The system MUST hash passwords using `bcryptjs` with salt rounds set to 12 before persisting.

#### Scenario: Hash is deterministic and verifiable

- GIVEN a plain-text password
- WHEN it is hashed via `bcryptjs.hash()`
- THEN the resulting string MUST start with `$2a$12$` and be verifiable via `bcryptjs.compare()`

### Requirement: Password Validation

The system MUST reject passwords shorter than 8 characters, lacking an uppercase letter, or lacking a numeric digit.

#### Scenario: Password fails length check

- GIVEN a password of 7 characters
- WHEN validation is performed
- THEN it MUST be rejected with an error indicating minimum length of 8

#### Scenario: Password lacks uppercase

- GIVEN a password `abcdefgh1`
- WHEN validation is performed
- THEN it MUST be rejected with an error indicating at least one uppercase letter is required

#### Scenario: Password lacks number

- GIVEN a password `Abcdefgh`
- WHEN validation is performed
- THEN it MUST be rejected with an error indicating at least one number is required

#### Scenario: Password passes all rules

- GIVEN a password `Abcdefg1`
- WHEN validation is performed
- THEN it MUST be accepted

### Requirement: JWT Session Callback

The session callback MUST attach `id` and `role` from the JWT token to the session user object.

#### Scenario: Session callback maps token fields

- GIVEN a JWT token containing `id`, `email`, `name`, and `role`
- WHEN the session callback is invoked
- THEN `session.user` MUST contain `id`, `email`, `name`, and `role` matching the token

### Requirement: Route Handler

The system MUST expose Auth.js route handlers at `src/app/api/auth/[...nextauth]/route.ts` that export `GET` and `POST` from the Auth.js `handlers`.

#### Scenario: Login request

- GIVEN a POST request to `/api/auth/callback/credentials` with valid credentials
- WHEN the handler processes it
- THEN it MUST return a session cookie and redirect to the callback URL

#### Scenario: Session fetch

- GIVEN a GET request to `/api/auth/session` with a valid session cookie
- WHEN the handler processes it
- THEN it MUST return the session JSON with user data

### Requirement: adminProcedure Middleware

The tRPC context MUST expose `adminProcedure` as a middleware that reads `session.user.role` from the existing session (populated by the JWT callback) and enforces `role === "ADMIN"`.

#### Scenario: Admin procedure uses existing session

- GIVEN the JWT callback has populated `session.user.role` with the `ADMIN` value
- WHEN `adminProcedure` middleware runs
- THEN it MUST read `ctx.session.user.role` and compare to `"ADMIN"` without additional DB queries

#### Scenario: Admin procedure unwraps session lazily

- GIVEN the `protectedProcedure` pattern
- WHEN `adminProcedure` is composed on top of `protectedProcedure`
- THEN `adminProcedure` SHALL only check role, relying on `protectedProcedure` for authentication — reducing duplicate session reads

### Requirement: Security — Generic Error Messages

The authorize callback MUST return generic error messages that do not reveal whether the email exists or the password was wrong.

#### Scenario: Ambiguous error on failed login

- GIVEN either an unknown email or incorrect password
- WHEN `authorize` returns `null`
- THEN the caller MUST receive only "Credenciales inválidas" without distinguishing the failure reason

## Vercel Deployment Additions (2026-06-25)

The following requirements are ADDED to this spec by the `migrate-managed-services` change (archived 2026-06-25). They cover the Auth.js v5 hard requirements for running on Vercel's edge proxy.

### Requirement: REQ-AUTH-V-1 — AUTH_TRUST_HOST is set on Vercel

The Auth.js v5 configuration MUST set `trustHost: true` (or accept `AUTH_TRUST_HOST=true` as an env var) when deployed to Vercel. Vercel terminates TLS at the edge and proxies to the Function with an internal HTTP origin, so NextAuth cannot auto-detect the canonical URL without this flag.

`.env.example` MUST include `AUTH_TRUST_HOST=true` as a placeholder line. `docs/deployment.md` MUST document this as a required env var.

#### Scenario: AUTH_TRUST_HOST is in .env.example

- GIVEN `.env.example` after the migration
- WHEN the file is read
- THEN `AUTH_TRUST_HOST` MUST appear with `=` and a placeholder value

### Requirement: REQ-AUTH-V-2 — AUTH_URL resolves from VERCEL_URL

The `AUTH_URL` env var SHOULD be set to the value of `VERCEL_URL` on Vercel deployments. The Auth.js configuration MUST NOT hardcode a single `AUTH_URL` — it MUST read from env at boot.

#### Scenario: AUTH_URL uses VERCEL_URL on Vercel

- GIVEN a Vercel production deployment
- WHEN `AUTH_URL` is read by NextAuth
- THEN it MUST equal `https://${VERCEL_URL}` (the Vercel-injected domain)
- AND it MUST NOT be hardcoded to a fixed value
