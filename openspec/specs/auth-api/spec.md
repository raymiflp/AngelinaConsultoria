# Auth API Specification

## Purpose

Defines the tRPC router for authentication procedures: user registration, login, and current-session retrieval. These procedures are consumed by the presentation layer and validate input through Zod schemas.

## Requirements

### Requirement: auth.register Procedure

The system MUST expose a `auth.register` public procedure that accepts `email`, `password`, `nombre`, and `telefono`, validates input, creates a `Usuario` in the database, and returns a session.

#### Scenario: Successful registration

- GIVEN valid input with email `new@example.com`, password `Secure1pass`, and a unique email
- WHEN `auth.register` is called
- THEN it MUST create a `Usuario` row with a bcrypt-hashed password and return a session object containing `user.id`, `user.email`, `user.name`, and `user.role`

#### Scenario: Duplicate email rejected

- GIVEN a user already exists with email `existing@example.com`
- WHEN `auth.register` is called with that email
- THEN the server MUST throw a `TRPCError` with code `CONFLICT` and message indicating the email is already registered

#### Scenario: Invalid email format

- GIVEN an email `not-an-email`
- WHEN `auth.register` is called
- THEN Zod validation MUST reject the input before any DB operation

#### Scenario: Weak password rejected

- GIVEN a password `short`
- WHEN `auth.register` is called
- THEN the server MUST reject the input with validation errors describing the password rules

#### Scenario: Missing required fields

- GIVEN an input without `email` or `password`
- WHEN `auth.register` is called
- THEN the server MUST return a Zod validation error indicating the missing fields

### Requirement: auth.login Procedure

The system MUST expose a `auth.login` public procedure that accepts `email` and `password`, validates credentials, and returns a session.

#### Scenario: Valid credentials return session

- GIVEN a registered user with email `user@example.com` and correct password
- WHEN `auth.login` is called with those credentials
- THEN it MUST return a session object identical to the registration response shape

#### Scenario: Invalid credentials rejected

- GIVEN a registered user with email `user@example.com`
- WHEN `auth.login` is called with a wrong password
- THEN the server MUST throw a `TRPCError` with code `UNAUTHORIZED` and a generic "Credenciales inválidas" message

#### Scenario: Non-existent email

- GIVEN no user with email `ghost@example.com` exists
- WHEN `auth.login` is called
- THEN the server MUST throw `TRPCError` with code `UNAUTHORIZED` and MUST NOT reveal whether the email exists

### Requirement: auth.me Procedure

The system MUST expose a `auth.me` protected procedure that returns the authenticated user's data from the session.

#### Scenario: Authenticated user retrieves profile

- GIVEN a valid session with user `{ id, email, name, role }`
- WHEN `auth.me` is called
- THEN it MUST return the user object matching the session data

#### Scenario: Unauthenticated request rejected

- GIVEN no session cookie is present
- WHEN `auth.me` is called
- THEN the server MUST throw `TRPCError` with code `UNAUTHORIZED`

### Requirement: Protected Procedure Pattern (Modified)

The `protectedProcedure` middleware is the base for `adminProcedure`. The `admin.*` procedures in the `adminRouter` MUST chain `adminProcedure` on top of `protectedProcedure`.
(Previously: only `protectedProcedure` was defined for general auth. No role-specific middleware existed.)

#### Scenario: Admin router composed with adminProcedure

- GIVEN the `adminRouter` is defined
- WHEN each procedure in `adminRouter` is inspected
- THEN EVERY procedure MUST use `adminProcedure` (or a composition chain that includes it) as its middleware

### Requirement: Input Validation

All public procedure inputs MUST be validated with Zod schemas before processing.

#### Scenario: Zod schema enforces shape

- GIVEN any input that fails Zod validation (wrong types, missing fields, out-of-range values)
- WHEN the procedure is invoked
- THEN the server MUST reject with a formatted validation error before any business logic executes
