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

### Requirement: Security — Generic Error Messages

The authorize callback MUST return generic error messages that do not reveal whether the email exists or the password was wrong.

#### Scenario: Ambiguous error on failed login

- GIVEN either an unknown email or incorrect password
- WHEN `authorize` returns `null`
- THEN the caller MUST receive only "Credenciales inválidas" without distinguishing the failure reason
